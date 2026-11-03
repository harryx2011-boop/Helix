import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline, type PipelineDeps } from '../core/pipeline.js';
import { StructuredError, type ExtractClient } from '../extract/client.js';
import { resolveProviderKeys, toClientKeys } from '../providers/resolve.js';
import { checkUrl, type HostResolver } from '../core/url-guard.js';
import { tierMemory } from '../core/tier-memory.js';
import { cookieJar } from '../core/cookie-jar.js';
import { gateOutcome, hostGate } from '../core/host-gate.js';
import { mapWithLimit } from '../core/map-with-limit.js';


const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'must be an http(s) URL');

const MAX_URLS = 25;

const ExtractRequestSchema = z
  .object({
    urls: z.array(HttpUrlSchema).min(1).max(MAX_URLS),
    schema: z.record(z.unknown()).optional(),
    prompt: z.string().min(1).max(2000).optional(),
    instruction: z.string().min(1).max(2000).optional(),
    provider: z.string().max(64).optional(),
    model: z.string().max(200).optional(),
    allowUngrounded: z.boolean().default(false),
    tier: z.enum(['auto', 'plain', 'tls', 'lightpanda', 'chromium', 'camoufox']).optional(),
    timeout: z.number().int().min(1_000).max(300_000).default(60_000),
  })
  .superRefine((body, ctx) => {
    if (!body.schema && !body.prompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schema'],
        message: 'provide `schema`, or `prompt` to have one designed from a description',
      });
    }
  });

export interface ExtractRouteDeps extends PipelineDeps {
  extractClient: ExtractClient;
  proxyUrl?: string | undefined;
  allowPrivateUrls?: boolean | undefined;
  resolveHost?: HostResolver | undefined;
  encryptionKey?: Buffer | undefined;
}

interface DroppedField {
  url: string;
  field: string;
  reason: string;
}

const URL_CONCURRENCY = 4;

type UrlOutcome =
  | {
      kind: 'row';
      row: Record<string, unknown>;
      dropped: DroppedField[];
      warnings: string[];
      blocksKept: number;
      blocksTotal: number;
      tokensInput: number;
      tokensOutput: number;
      modelUsed: string | undefined;
    }
  | { kind: 'warnings'; warnings: string[] }
  | { kind: 'schema-error'; error: StructuredError }
  | { kind: 'skipped' };

function groundedFields(sources: Record<string, unknown>[]): Set<string> {
  const grounded = new Set<string>();
  for (const source of sources) {
    const field = source['field'];
    if (typeof field === 'string') grounded.add(field);
  }
  return grounded;
}

function splitByGrounding(
  url: string,
  data: Record<string, unknown>,
  sources: Record<string, unknown>[],
): { kept: Record<string, unknown>; dropped: DroppedField[] } {
  const grounded = groundedFields(sources);
  if (grounded.size === 0) return { kept: data, dropped: [] };

  const kept: Record<string, unknown> = {};
  const dropped: DroppedField[] = [];
  for (const [field, value] of Object.entries(data)) {
    if (grounded.has(field)) kept[field] = value;
    else dropped.push({ url, field, reason: 'no grounding span in source' });
  }
  return { kept, dropped };
}

export async function registerExtract(app: FastifyInstance, deps: ExtractRouteDeps): Promise<void> {
  app.post('/extract', async (request, reply) => {
    const parsed = ExtractRequestSchema.safeParse(request.body);

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

    for (const [index, url] of body.urls.entries()) {
      const verdict = await checkUrl(url, { allowPrivate: deps.allowPrivateUrls, resolve: deps.resolveHost });
      if (!verdict.ok) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: `urls.${index}: ${verdict.reason}`,
          field: `urls.${index}`,
          requestId: request.id,
        });
      }
    }

    const apiKeyId = request.apiKey?.id;
    const providerAuth =
      apiKeyId && deps.encryptionKey
        ? toClientKeys(await resolveProviderKeys(apiKeyId, deps.encryptionKey))
        : {};

    const rows: Record<string, unknown>[] = [];
    const dropped: DroppedField[] = [];
    const warnings: string[] = [];
    let blocksKept = 0;
    let blocksTotal = 0;
    let tokensInput = 0;
    let tokensOutput = 0;
    let modelUsed: string | undefined;

    const promptWithInstruction = body.instruction
      ? `${body.prompt ?? ''}\n\n${body.instruction}`.trim()
      : body.prompt;

    const controller = new AbortController();
    const onClose = (): void => {
      if (!reply.raw.writableFinished) controller.abort();
    };
    reply.raw.on('close', onClose);

    try {
      const outcomes = await mapWithLimit(body.urls, URL_CONCURRENCY, async (url): Promise<UrlOutcome> => {
        if (controller.signal.aborted) return { kind: 'skipped' };

        const page = await hostGate.run(
          url,
          (waitedMs) =>
            runPipeline(
              {
                url,
                formats: ['markdown'],
                ...(body.tier ? { tier: body.tier } : {}),
                timeout: Math.max(1, body.timeout - waitedMs),
                onlyMainContent: true,
                ...(deps.proxyUrl ? { proxy: deps.proxyUrl } : {}),
                allowPrivate: deps.allowPrivateUrls,
                signal: controller.signal,
              },
              { ...deps, tierMemory, cookieJar },
            ),
          gateOutcome,
          controller.signal,
        ).catch((error: unknown) => {
          if (controller.signal.aborted) return undefined;
          throw error;
        });

        if (!page) return { kind: 'skipped' };
        if (!page.success) {
          if (page.reason === 'aborted') return { kind: 'skipped' };
          return {
            kind: 'warnings',
            warnings: [`${url}: ${page.reason}${page.detail ? ` — ${page.detail}` : ''}`],
          };
        }

        try {
          const structured = await deps.extractClient.structured({
            content: page.content.markdown,
            ...(body.schema ? { schema: body.schema } : {}),
            ...(promptWithInstruction ? { prompt: promptWithInstruction } : {}),
            ...(body.provider ? { provider: body.provider } : {}),
            ...(body.model ? { model: body.model } : {}),
            includeSources: true,
            ...providerAuth,
            signal: controller.signal,
          });

          const split = splitByGrounding(url, structured.data, structured.sources);

          return {
            kind: 'row',
            row: {
              ...(body.allowUngrounded ? structured.data : split.kept),
              _source: {
                url,
                spans: structured.sources,
                blocksKept: structured.blocksKept,
                blocksTotal: structured.blocksTotal,
              },
            },
            dropped: split.dropped,
            warnings:
              structured.sources.length === 0
                ? [`${url}: the extractor returned no source spans, so no field could be verified.`]
                : [],
            blocksKept: structured.blocksKept,
            blocksTotal: structured.blocksTotal,
            tokensInput: structured.tokensInput,
            tokensOutput: structured.tokensOutput,
            modelUsed: structured.modelUsed,
          };
        } catch (error) {
          if (error instanceof StructuredError && error.status === 400) {
            controller.abort();
            return { kind: 'schema-error', error };
          }
          const err = error as { name?: string };
          if (err.name === 'AbortError') return { kind: 'skipped' };
          return {
            kind: 'warnings',
            warnings: [
              `${url}: extraction failed — ${error instanceof Error ? error.message : String(error)}`,
            ],
          };
        }
      });

      for (const outcome of outcomes) {
        if (outcome.kind === 'schema-error') {
          const { error } = outcome;
          return reply.code(400).send({
            error: error.field ? 'invalid_request' : 'invalid_schema',
            message: error.message,
            field: error.field ?? 'schema',
            requestId: request.id,
          });
        }
        if (outcome.kind === 'skipped') continue;

        warnings.push(...outcome.warnings);
        if (outcome.kind === 'warnings') continue;

        rows.push(outcome.row);
        dropped.push(...outcome.dropped);
        blocksKept += outcome.blocksKept;
        blocksTotal += outcome.blocksTotal;
        tokensInput += outcome.tokensInput;
        tokensOutput += outcome.tokensOutput;
        modelUsed ??= outcome.modelUsed;
      }

      return reply.code(200).send({
        success: true,
        data: rows,
        dropped,
        warnings,
        usage: {
          urls: body.urls.length,
          rows: rows.length,
          model: modelUsed ?? null,
          tokens: { input: tokensInput, output: tokensOutput },
          blocksKept,
          blocksTotal,
          providerCost: { amount: null, currency: 'USD' },
        },
      });
    } finally {
      reply.raw.off('close', onClose);
      controller.abort();
    }
  });
}
