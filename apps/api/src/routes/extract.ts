import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline, type PipelineDeps } from '../core/pipeline.js';
import { StructuredError, type ExtractClient } from '../extract/client.js';
import { resolveProviderKeys, toClientKeys } from '../providers/resolve.js';
import { checkUrl, type HostResolver } from '../core/url-guard.js';

/**
 * POST /v1/extract — the same shape across a set of URLs, as a table.
 *
 * `/scrape` with `jsonOptions` already extracts one page. This exists for the
 * other shape of the question: apply one schema to many pages and get rows
 * back, with each field traceable to where it was read.
 *
 * Two rules distinguish it from a model call with a schema attached:
 *
 * 1. **Ungrounded fields are dropped, not guessed.** A value the model returned
 *    without a matching source span is removed and reported in `dropped`. The
 *    failure this avoids is the expensive one: a plausible number nobody can
 *    check, returned with the same confidence as a real one.
 * 2. **A page that could not be read is a warning, not a failure.** Nineteen
 *    good rows and one unreachable URL is a useful answer; a 502 is not.
 */

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
    /** Extra direction for the model, alongside the schema rather than instead of it. */
    instruction: z.string().min(1).max(2000).optional(),
    provider: z.string().max(64).optional(),
    model: z.string().max(200).optional(),
    /**
     * Keep fields the source does not support, reporting them in `dropped`
     * anyway. Off by default: an ungrounded value is the thing this endpoint
     * exists to not return.
     */
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
  /** Decrypts the caller's stored provider keys, so extraction runs on their model. */
  encryptionKey?: Buffer | undefined;
}

/** A field the model returned that nothing in the page supports. */
interface DroppedField {
  url: string;
  field: string;
  reason: string;
}

/**
 * Fields the source actually supports, per `include_sources`.
 *
 * The extractor reports spans as a list of records naming the field they
 * ground. A field absent from that list was produced by the model without
 * textual support — which is exactly the case worth refusing.
 */
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
  // An extractor that returned no spans at all cannot distinguish grounded
  // from invented, so dropping everything would report a total failure where
  // the real answer is "grounding is unavailable here". Kept, and said so.
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
    request.raw.on('close', onClose);

    try {
      for (const url of body.urls) {
        if (controller.signal.aborted) break;
        const page = await runPipeline(
          {
            url,
            formats: ['markdown'],
            ...(body.tier ? { tier: body.tier } : {}),
            timeout: body.timeout,
            onlyMainContent: true,
            ...(deps.proxyUrl ? { proxy: deps.proxyUrl } : {}),
            allowPrivate: deps.allowPrivateUrls,
          },
          deps,
        );

        if (!page.success) {
          warnings.push(`${url}: ${page.reason}${page.detail ? ` — ${page.detail}` : ''}`);
          continue;
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
          if (split.dropped.length > 0) dropped.push(...split.dropped);

          rows.push({
            ...(body.allowUngrounded ? structured.data : split.kept),
            _source: {
              url,
              spans: structured.sources,
              // Said per row: a page whose blocks were clipped answered from part
              // of itself, and the values alone cannot show that.
              blocksKept: structured.blocksKept,
              blocksTotal: structured.blocksTotal,
            },
          });

          if (structured.sources.length === 0) {
            warnings.push(`${url}: the extractor returned no source spans, so no field could be verified.`);
          }

          blocksKept += structured.blocksKept;
          blocksTotal += structured.blocksTotal;
          tokensInput += structured.tokensInput;
          tokensOutput += structured.tokensOutput;
          modelUsed ??= structured.modelUsed;
        } catch (error) {
          // A bad schema is the caller's to fix and will fail identically on every
          // URL, so it stops the request rather than repeating n times.
          if (error instanceof StructuredError && error.status === 400) {
            return reply.code(400).send({
              error: error.field ? 'invalid_request' : 'invalid_schema',
              message: error.message,
              field: error.field ?? 'schema',
              requestId: request.id,
            });
          }
          const err = error as { name?: string };
          // The caller disconnecting mid-run is not a per-URL extraction
          // failure worth reporting in `warnings` — the loop above already
          // stops issuing new calls once `controller.signal` is aborted.
          if (err.name === 'AbortError') break;
          warnings.push(
            `${url}: extraction failed — ${error instanceof Error ? error.message : String(error)}`,
          );
        }
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
      request.raw.off('close', onClose);
    }
  });
}
