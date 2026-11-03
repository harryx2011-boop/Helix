import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline } from '../core/pipeline.js';
import { gateOutcome, hostGate } from '../core/host-gate.js';
import type { FetchClient } from '../fetch/client.js';
import { StructuredError, type ExtractClient } from '../extract/client.js';
import { sanitizeHtml } from '../extract/sanitize.js';
import type { BrowserPool } from '../browser/pool.js';
import { checkUrl, pinProxyUrl, type HostResolver } from '../core/url-guard.js';
import { resolveProviderKeys, toClientKeys } from '../providers/resolve.js';
import { tierMemory } from '../core/tier-memory.js';
import { cookieJar } from '../core/cookie-jar.js';
import { scrapeCache } from '../core/scrape-cache.js';


const FORMATS = ['markdown', 'html', 'rawHtml', 'text', 'links', 'screenshot', 'json', 'chunks'] as const;

export type ScrapeFormat = (typeof FORMATS)[number];

export const PROVIDERS = [
  'anthropic',
  'openai',
  'openrouter',
  'google',
  'gemini',
  'ollama',
  'vllm',
  'openai-compatible',
] as const;

const ExtractSchema = z.object({
  schema: z.record(z.unknown()).optional(),
  prompt: z.string().max(4_000).optional(),
  provider: z.enum(PROVIDERS).optional(),
  model: z.string().max(200).optional(),
  includeSources: z.boolean().default(false),
});

const ProxyObjectSchema = z.object({
  url: z.string().min(1),
  sessionId: z.string().optional(),
  geo: z.string().length(2).optional(),
});

const ProxySchema = z.union([z.enum(['auto', 'stealth', 'none']), ProxyObjectSchema]);

const ChunkSchema = z.object({
  strategy: z.enum(['semantic', 'heading', 'fixed']).default('semantic'),
  maxTokens: z.number().int().min(64).max(4_096).default(512),
  overlap: z.number().int().min(0).max(1_024).default(64),
});

const ScrapeRequestSchema = z.object({
  url: z.string().url(),
  formats: z.array(z.enum(FORMATS)).min(1).default(['markdown']),
  tier: z.enum(['auto', 'plain', 'tls', 'lightpanda', 'chromium', 'camoufox']).default('auto'),
  engine: z.enum(['chromium', 'firefox', 'webkit']).optional(),
  onlyMainContent: z.boolean().default(true),
  includeSelectors: z.array(z.string()).default([]),
  excludeSelectors: z.array(z.string()).default([]),
  extractor: z.enum(['trafilatura', 'readability', 'auto']).default('trafilatura'),
  waitFor: z.number().int().min(0).max(30_000).optional(),
  timeout: z.number().int().min(1_000).max(300_000).default(30_000),
  mobile: z.boolean().default(false),
  headers: z.record(z.string()).optional(),
  profile: z.string().optional(),
  proxy: ProxySchema.optional(),
  actions: z.array(z.unknown()).max(50).optional(),
  extract: ExtractSchema.optional(),
  jsonOptions: ExtractSchema.optional(),
  chunk: ChunkSchema.optional(),
  maxAge: z.number().int().min(0).max(2_592_000_000).default(0),
});

export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;

export interface ScrapeRouteDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool | undefined;
  proxyUrl?: string | undefined;
  allowPrivateUrls?: boolean | undefined;
  resolveHost?: HostResolver | undefined;
  encryptionKey?: Buffer | undefined;
}

export function rejectFabricationKeywords(schema: Record<string, unknown>, path = 'extract.schema'): void {
  for (const keyword of ['minItems', 'maxItems'] as const) {
    if (keyword in schema) {
      throw Object.assign(new Error(`\`${keyword}\` is not supported in extraction schemas.`), {
        statusCode: 400,
        field: `${path}.${keyword}`,
        hint:
          'Length constraints make models invent entries to satisfy them. ' +
          'Describe the expectation in the field description instead.',
      });
    }
  }

  const properties = schema['properties'];
  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        rejectFabricationKeywords(value as Record<string, unknown>, `${path}.properties.${key}`);
      }
    }
  }

  const items = schema['items'];
  if (items && typeof items === 'object') {
    rejectFabricationKeywords(items as Record<string, unknown>, `${path}.items`);
  }
}

type ProxyResolution =
  | { ok: true; url: string | undefined }
  | { ok: false; message: string };

function resolveProxy(proxy: ScrapeRequest['proxy'], operatorProxy: string | undefined): ProxyResolution {
  if (proxy === undefined || proxy === 'auto') return { ok: true, url: operatorProxy };
  if (proxy === 'none') return { ok: true, url: undefined };
  if (proxy === 'stealth') {
    if (!operatorProxy) {
      return {
        ok: false,
        message:
          '`proxy: "stealth"` needs a proxy configured on this instance. Set HELIX_PROXY_URL, ' +
          'or pass your own as `proxy: { url }`.',
      };
    }
    return { ok: true, url: operatorProxy };
  }
  return { ok: true, url: proxy.url };
}

export async function registerScrape(
  app: FastifyInstance,
  deps: ScrapeRouteDeps,
): Promise<void> {
  app.post('/scrape', async (request, reply) => {
    const parsed = ScrapeRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({
        error: 'invalid_request',
        message: first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
        field: first?.path.join('.'),
        requestId: request.id,
      });
    }

    const body = parsed.data;

    const urlVerdict = await checkUrl(body.url, {
      allowPrivate: deps.allowPrivateUrls,
      resolve: deps.resolveHost,
    });
    if (!urlVerdict.ok) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `url: ${urlVerdict.reason}`,
        field: 'url',
        requestId: request.id,
      });
    }

    if (body.extract && body.jsonOptions) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: '`extract` and `jsonOptions` are the same option under two names. Send one of them.',
        field: 'jsonOptions',
        requestId: request.id,
      });
    }

    const extraction = body.extract ?? body.jsonOptions;
    const extractionField = body.jsonOptions ? 'jsonOptions' : 'extract';

    if (extraction?.schema) {
      try {
        rejectFabricationKeywords(extraction.schema, `${extractionField}.schema`);
      } catch (error) {
        const e = error as Error & { field?: string; hint?: string };
        return reply.code(400).send({
          error: 'invalid_schema',
          message: e.hint ? `${e.message} ${e.hint}` : e.message,
          field: e.field,
          requestId: request.id,
        });
      }
    }

    const wantsJson = body.formats.includes('json');

    if (wantsJson && !extraction?.schema) {
      return reply.code(400).send({
        error: 'invalid_request',
        message:
          'The `json` format requires `jsonOptions.schema` (a JSON Schema describing the fields to return). ' +
          'A `prompt` can accompany it but cannot replace it.',
        field: extraction ? `${extractionField}.schema` : 'jsonOptions',
        requestId: request.id,
      });
    }

    const proxy = resolveProxy(body.proxy, deps.proxyUrl);
    if (!proxy.ok) {
      return reply.code(400).send({
        error: 'proxy_unavailable',
        message: proxy.message,
        field: 'proxy',
        requestId: request.id,
      });
    }

    const proxyVerdict =
      typeof body.proxy === 'object'
        ? await pinProxyUrl(body.proxy.url, { allowPrivate: deps.allowPrivateUrls, resolve: deps.resolveHost })
        : { ok: true as const, url: proxy.url };
    if (!proxyVerdict.ok) {
      const message = `proxy.url: ${proxyVerdict.reason}`;
      return reply.code(400).send({ error: 'invalid_request', message, field: 'proxy.url', requestId: request.id });
    }

    const { maxAge, ...cacheable } = body;
    const cacheKey = maxAge > 0 && !body.actions?.length ? JSON.stringify(cacheable) : undefined;
    const hit = cacheKey ? scrapeCache.get(cacheKey, maxAge) : undefined;
    if (hit) {
      const cached = structuredClone(hit.value) as { data: { metadata: Record<string, unknown> } };
      cached.data.metadata['fromCache'] = true;
      return reply.code(200).send(cached);
    }

    const tier = body.mobile && body.tier === 'auto' ? 'chromium' : body.tier;

    const warnings: string[] = [];

    if (body.mobile && (tier === 'plain' || tier === 'tls')) {
      warnings.push(`mobile: the ${tier} tier has no viewport, so the page was fetched as-is.`);
    } else if (body.mobile && tier === 'lightpanda') {
      warnings.push('mobile: the lightpanda tier has no layout engine, so the phone viewport was not applied.');
    }

    const pipelineOptions = {
      url: body.url,
      formats: body.formats,
      tier,
      onlyMainContent: body.onlyMainContent,
      includeSelectors: body.includeSelectors,
      excludeSelectors: body.excludeSelectors,
      extractor: body.extractor,
      waitFor: body.waitFor,
      timeout: body.timeout,
      headers: body.headers,
      profile: body.profile,
      proxy: proxyVerdict.url,
      actions: body.actions,
      mobile: body.mobile,
      ...(body.engine ? { renderEngine: body.engine } : {}),
      allowPrivate: deps.allowPrivateUrls,
    };

    const result = await hostGate.run(
      body.url,
      (waitedMs) =>
        runPipeline({ ...pipelineOptions, timeout: Math.max(1, body.timeout - waitedMs) }, {
          fetchClient: deps.fetchClient,
          extractClient: deps.extractClient,
          browserPool: deps.browserPool,
          logger: request.log,
          tierMemory,
          cookieJar,
        }),
      gateOutcome,
    );

    if (!result.success) {
      return reply.code(200).send({
        success: false,
        failure: {
          url: result.url,
          reason: result.reason,
          detail: result.detail,
          statusCode: result.statusCode,
          detectedBy: result.detectedBy,
          tier: result.tier,
          tiersAttempted: result.tiersAttempted,
          profile: result.profileUsed,
          escalationAvailable: result.escalationAvailable,
        },
        warnings,
      });
    }

    if (result.warnings) warnings.push(...result.warnings);

    const { content } = result;
    const data: Record<string, unknown> = {};
    let usage: Record<string, unknown> | undefined;

    if (body.formats.includes('markdown')) data['markdown'] = content.markdown;
    if (body.formats.includes('text')) data['text'] = content.text;
    if (body.formats.includes('links')) data['links'] = content.links;
    if (body.formats.includes('rawHtml')) data['rawHtml'] = content.rawHtml;
    if (body.formats.includes('html')) data['html'] = sanitizeHtml(content.rawHtml ?? '');
    if (body.formats.includes('screenshot')) {
      data['screenshot'] = content.screenshot ? `data:image/png;base64,${content.screenshot}` : null;
      if (!content.screenshot) {
        warnings.push('screenshot: no image was captured at the tier that succeeded.');
      }
    }

    if (wantsJson && extraction?.schema) {
      try {
        const apiKeyId = request.apiKey?.id;
        const resolved =
          apiKeyId && deps.encryptionKey ? await resolveProviderKeys(apiKeyId, deps.encryptionKey) : {};
        const { providerKeys, providerModels, providerBaseUrls } = toClientKeys(resolved);

        const structured = await deps.extractClient.structured({
          content: content.markdown,
          schema: extraction.schema,
          prompt: extraction.prompt,
          provider: extraction.provider,
          model: extraction.model,
          includeSources: extraction.includeSources,
          providerKeys,
          providerModels,
          providerBaseUrls,
        });
        data['json'] = structured.data;
        if (extraction.includeSources) data['jsonSources'] = structured.sources;
        usage = {
          model: structured.modelUsed,
          tokens: { input: structured.tokensInput, output: structured.tokensOutput },
          blocksKept: structured.blocksKept,
          blocksTotal: structured.blocksTotal,
          providerCost: { amount: null, currency: 'USD' },
        };
      } catch (error) {
        if (error instanceof StructuredError && error.status === 400) {
          return reply.code(400).send({
            error: error.field ? 'invalid_request' : 'invalid_schema',
            message: error.message,
            field: `${extractionField}.${error.field ?? 'schema'}`,
            requestId: request.id,
          });
        }
        const detail = error instanceof Error ? error.message : 'structured extraction failed';
        request.log.warn({ error, url: body.url }, 'structured extraction failed');
        data['json'] = null;
        warnings.push(`json: ${detail}`);
      }
    }

    if (body.formats.includes('chunks')) {
      try {
        const chunked = await deps.extractClient.chunk({
          text: content.markdown,
          url: body.url,
          strategy: body.chunk?.strategy,
          maxTokens: body.chunk?.maxTokens,
          overlap: body.chunk?.overlap,
        });
        data['chunks'] = chunked.chunks;
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'chunking failed';
        request.log.warn({ error, url: body.url }, 'chunking failed');
        data['chunks'] = null;
        warnings.push(`chunks: ${detail}`);
      }
    }

    data['metadata'] = {
      title: content.title,
      language: content.language,
      sourceUrl: body.url,
      finalUrl: result.finalUrl ?? body.url,
      statusCode: result.statusCode,
      fetchedAt: new Date().toISOString(),
      contentHash: content.contentHash,
      tier: result.tier,
      tiersAttempted: result.tiersAttempted,
      profile: result.profileUsed,
      extractor: content.extractorUsed,
      engine: result.engineUsed,
      mobile: body.mobile && result.tier === 'chromium' && result.engineUsed !== 'firefox',
      timingMs: result.timingMs,
      fromCache: false,
      favicon: content.favicon,
    };

    const payload = {
      success: true,
      data,
      warnings,
      ...(usage ? { usage } : {}),
    };
    if (cacheKey) scrapeCache.set(cacheKey, payload);
    return reply.code(200).send(payload);
  });
}
