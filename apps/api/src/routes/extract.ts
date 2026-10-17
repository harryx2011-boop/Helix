import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline, type PipelineDeps } from '../core/pipeline.js';
import { StructuredError, type ExtractClient } from '../extract/client.js';
import { resolveProviderKeys, toClientKeys } from '../providers/resolve.js';
import { checkUrl, type HostResolver } from '../core/url-guard.js';
import { tierMemory } from '../core/tier-memory.js';
import { cookieJar } from '../core/cookie-jar.js';
import { gateOutcome, hostGate } from '../core/host-gate.js';
import { mapWithLimit } from './search.js';

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
 * URLs read at once.
 *
 * Four, not `MAX_URLS`: each one is a page fetch plus a model call, and the
 * per-host gate paces same-host URLs anyway. Twenty-five at once would mostly
 * queue inside the browser pool while making the provider's rate limit the next
 * thing to fail.
 */
const URL_CONCURRENCY = 4;

/**
 * What one URL produced. Returned rather than pushed, because the rows must read
 * in the caller's order no matter which URL finished first.
 */
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
  /** A schema the provider refused: the same answer for every URL, so it ends the request. */
  | { kind: 'schema-error'; error: StructuredError }
  /** Aborted, or never started because the request was already over. */
  | { kind: 'skipped' };

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
    reply.raw.on('close', onClose);

    try {
      // One pass over the URLs, several at a time. Serial was n round trips of
      // fetch-then-model for URLs that have nothing to do with each other: 25
      // pages at 3 s each is a 75 s wall. `mapWithLimit` preserves order, so
      // rows, warnings and `dropped` still read in the order the caller listed —
      // the concurrency is not visible in the answer.
      const outcomes = await mapWithLimit(body.urls, URL_CONCURRENCY, async (url): Promise<UrlOutcome> => {
        if (controller.signal.aborted) return { kind: 'skipped' };

        const page = await hostGate.run(
          url,
          // The wait for the host's turn is spent from the caller's timeout.
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
          // Several URLs on one host is the case this route makes common, so the
          // host's own answer has to feed the pacing: a 429 or a challenge on the
          // third URL should slow the fourth, not be rediscovered 20 times.
          gateOutcome,
          controller.signal,
        ).catch((error: unknown) => {
          // Aborted while waiting for the host's turn: the caller left first.
          if (controller.signal.aborted) return undefined;
          throw error;
        });

        if (!page) return { kind: 'skipped' };
        if (!page.success) {
          // A page the caller's own disconnect killed is not a page that failed.
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
                // Said per row: a page whose blocks were clipped answered from part
                // of itself, and the values alone cannot show that.
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
          // A bad schema is the caller's to fix and will fail identically on every
          // URL, so it stops the request rather than repeating n times. The abort
          // is what stops it: URLs already in flight end as `skipped`, and no
          // queued one starts.
          if (error instanceof StructuredError && error.status === 400) {
            controller.abort();
            return { kind: 'schema-error', error };
          }
          const err = error as { name?: string };
          // The caller disconnecting mid-run is not a per-URL extraction failure
          // worth reporting in `warnings`.
          if (err.name === 'AbortError') return { kind: 'skipped' };
          return {
            kind: 'warnings',
            warnings: [
              `${url}: extraction failed — ${error instanceof Error ? error.message : String(error)}`,
            ],
          };
        }
      });

      // Folded in the caller's order, so a concurrent run answers exactly as the
      // serial one did.
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
      // A throw from one URL ends the request while its siblings are still in
      // flight; without this they hold contexts and gate slots to their own
      // timeout. On the normal path every URL is done and this is a no-op.
      controller.abort();
    }
  });
}
