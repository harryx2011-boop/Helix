import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline } from '../core/pipeline.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';

const FORMATS = [
  'markdown',
  'html',
  'rawHtml',
  'text',
  'links',
  'images',
  'screenshot',
  'pdf',
  'json',
  'chunks',
  'summary',
] as const;

const ScrapeRequestSchema = z.object({
  url: z.string().url(),
  formats: z.array(z.enum(FORMATS)).default(['markdown']),
  tier: z.enum(['auto', 'plain', 'tls', 'lightpanda', 'chromium']).default('auto'),
  onlyMainContent: z.boolean().default(true),
  includeSelectors: z.array(z.string()).default([]),
  excludeSelectors: z.array(z.string()).default([]),
  extractor: z.enum(['trafilatura', 'readability', 'auto']).default('trafilatura'),
  waitFor: z.number().int().min(0).max(30_000).optional(),
  timeout: z.number().int().min(1_000).max(300_000).default(30_000),
  headers: z.record(z.string()).optional(),
  profile: z.string().optional(),
  proxy: z
    .object({
      url: z.string(),
      sessionId: z.string().optional(),
      geo: z.string().length(2).optional(),
    })
    .optional(),
  actions: z.array(z.unknown()).max(50).optional(),
  extract: z
    .object({
      schema: z.record(z.unknown()).optional(),
      prompt: z.string().optional(),
      model: z.string().optional(),
      includeSources: z.boolean().default(false),
    })
    .optional(),
});

export interface ScrapeRouteDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool;
}

/**
 * Reject extraction schemas that push models to fabricate.
 *
 * Length keywords do not make a model find more real items; they make it invent
 * entries to satisfy the constraint. Vendors document this as a caveat and let
 * the request through anyway. Refusing it with an explanation is better than a
 * confidently wrong answer.
 */
function rejectFabricationKeywords(schema: Record<string, unknown>, path = 'extract.schema'): void {
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

    if (body.extract?.schema) {
      try {
        rejectFabricationKeywords(body.extract.schema);
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

    if (body.formats.includes('json') && !body.extract) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'The `json` format requires an `extract` block with a schema or prompt.',
        field: 'formats',
        requestId: request.id,
      });
    }

    const result = await runPipeline(
      {
        url: body.url,
        formats: body.formats,
        tier: body.tier,
        onlyMainContent: body.onlyMainContent,
        includeSelectors: body.includeSelectors,
        excludeSelectors: body.excludeSelectors,
        extractor: body.extractor,
        waitFor: body.waitFor,
        timeout: body.timeout,
        headers: body.headers,
        profile: body.profile,
        proxy: body.proxy?.url,
        actions: body.actions,
      },
      {
        fetchClient: deps.fetchClient,
        extractClient: deps.extractClient,
        browserPool: deps.browserPool,
        logger: request.log,
      },
    );

    // A failure is reported inside a 200 so the caller can see which tiers and
    // profile were tried. A bot challenge is never dressed up as content.
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
      });
    }

    const { content } = result;
    const data: Record<string, unknown> = {};

    if (body.formats.includes('markdown')) data['markdown'] = content.markdown;
    if (body.formats.includes('text')) data['text'] = content.text;
    if (body.formats.includes('rawHtml')) data['rawHtml'] = content.rawHtml;
    if (body.formats.includes('links')) data['links'] = content.links;
    if (body.formats.includes('screenshot') && content.screenshot) {
      data['screenshot'] = content.screenshot;
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
      timingMs: result.timingMs,
      fromCache: false,
    };

    return reply.code(200).send({ success: true, data });
  });
}
