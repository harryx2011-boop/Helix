import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline } from '../core/pipeline.js';
import { ExtractHttpError, StructuredError, type ExtractClient } from '../extract/client.js';
import type { FetchClient } from '../fetch/client.js';
import type { BrowserPool } from '../browser/pool.js';
import type { SearchProvider } from '../search/providers.js';
import { resolveProviderKeys, toClientKeys } from '../providers/resolve.js';
import { dedupeByUrl, screenSource, screenUrl } from '../enrich/guards.js';
import {
  acceptModelFields,
  assemble,
  routeStructural,
  type EnrichedField,
  type NullReason,
  type RejectedSource,
} from '../enrich/enrich.js';
import { buildContent, buildPrompt, buildSchema } from '../enrich/model-phase.js';
import type { FieldSpec, PageEvidence } from '../enrich/routing.js';
import { mapWithLimit } from './search.js';

/**
 * POST /v1/enrich - sparse identifier in, grounded columns out.
 *
 * The endpoint exists to be trustworthy rather than complete. Everything it
 * returns is tied to a passage in a page it fetched; everything it cannot tie is
 * `null` with the reason. That trade is deliberate and is the product: an
 * enrichment API that fabricates a plausible headquarters city is worse than one
 * that says it does not know, because the first cannot be checked at scale.
 */

const FIELD_TYPES = ['string', 'number', 'boolean'] as const;

const FieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'must start with a letter and contain only letters, digits and underscores'),
  type: z.enum(FIELD_TYPES).default('string'),
  description: z.string().max(300).optional(),
});

const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'must be an http(s) URL');

const EnrichRequestSchema = z
  .object({
    subject: z.string().min(1).max(200),
    fields: z.array(FieldSchema).min(1).max(20),
    urls: z.array(HttpUrlSchema).max(10).optional(),
    maxSources: z.number().int().min(1).max(10).default(4),
    timeout: z.number().int().min(1_000).max(120_000).default(30_000),
  })
  .strict();

export type EnrichRequestBody = z.infer<typeof EnrichRequestSchema>;

export interface EnrichRouteDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool | undefined;
  /** Used to find sources when the caller supplies no `urls`. Absent means the caller must supply them. */
  searchProvider?: SearchProvider | undefined;
  encryptionKey?: Buffer | undefined;
  /** How many candidate pages are read at once. */
  concurrency?: number | undefined;
}

/** Candidate URLs for a subject: the caller list if given, otherwise a search. */
async function findCandidates(
  body: EnrichRequestBody,
  deps: EnrichRouteDeps,
  signal: AbortSignal,
): Promise<{ urls: string[]; searched: boolean }> {
  if (body.urls && body.urls.length > 0) {
    return { urls: dedupeByUrl(body.urls.map((url) => ({ url }))).map((u) => u.url), searched: false };
  }

  if (!deps.searchProvider?.configured()) return { urls: [], searched: false };

  const outcome = await deps.searchProvider.search(
    { query: body.subject, limit: Math.min(body.maxSources * 2, 20), sources: ['web'] },
    signal,
  );

  return {
    urls: dedupeByUrl(outcome.hits.map((hit) => ({ url: hit.url }))).map((u) => u.url),
    searched: true,
  };
}

interface ReadOutcome {
  page?: PageEvidence | undefined;
  rejected?: RejectedSource | undefined;
}

/**
 * Read one candidate and decide whether it may be evidence.
 *
 * The URL guard runs before the fetch and the content guards after it, because
 * neither can be judged from the other: a safe URL can serve a parking page, and
 * a parking page on an unsafe URL must never be fetched at all.
 */
async function readCandidate(
  url: string,
  body: EnrichRequestBody,
  deps: EnrichRouteDeps,
  logger: FastifyInstance['log'],
  signal: AbortSignal,
): Promise<ReadOutcome> {
  const urlVerdict = await screenUrl(url);
  if (!urlVerdict.ok) {
    return { rejected: { url, reason: urlVerdict.reason ?? 'unsafe_url', detail: urlVerdict.detail ?? 'rejected' } };
  }

  const result = await runPipeline(
    {
      url,
      // rawHtml is what the metadata phase reads; without it every field would
      // fall through to the model even when the page states it in JSON-LD.
      formats: ['markdown', 'rawHtml'],
      tier: 'auto',
      onlyMainContent: true,
      timeout: body.timeout,
      signal,
    },
    { fetchClient: deps.fetchClient, extractClient: deps.extractClient, browserPool: deps.browserPool, logger },
  );

  if (!result.success) {
    // Not a content judgement: the page never arrived. Saying it fell below the
    // content floor would report a fact about text that was never fetched.
    return {
      rejected: { url, reason: 'unreadable', detail: `the page could not be read: ${result.reason}` },
    };
  }

  const text = result.content.text || result.content.markdown;
  const verdict = screenSource({ url, text });
  if (!verdict.ok) {
    return { rejected: { url, reason: verdict.reason ?? 'below_content_floor', detail: verdict.detail ?? 'rejected' } };
  }

  return {
    page: {
      url: result.finalUrl ?? url,
      text,
      title: result.content.title,
      html: result.content.rawHtml,
    },
  };
}

export async function registerEnrich(app: FastifyInstance, deps: EnrichRouteDeps): Promise<void> {
  const concurrency = deps.concurrency ?? 4;

  app.post('/enrich', async (request, reply) => {
    const parsed = EnrichRequestSchema.safeParse(request.body);

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

    const names = new Set<string>();
    for (const field of body.fields) {
      if (names.has(field.name)) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: `fields: "${field.name}" is listed more than once`,
          field: 'fields',
          requestId: request.id,
        });
      }
      names.add(field.name);
    }

    const fields: FieldSpec[] = body.fields.map((f) => ({
      name: f.name,
      type: f.type,
      description: f.description,
    }));

    const controller = new AbortController();
    const onClose = (): void => {
      if (!reply.raw.writableFinished) controller.abort(new Error('the client disconnected'));
    };
    reply.raw.on('close', onClose);

    try {
      const { urls, searched } = await findCandidates(body, deps, controller.signal);

      if (urls.length === 0) {
        if (searched) {
          return reply.send(
            emptyOutcome(fields, [], 'no_sources', `no search result was returned for "${body.subject}"`),
          );
        }
        if (!deps.searchProvider?.configured()) {
          return reply.code(503).send({
            error: 'search_unavailable',
            message:
              'No search backend is configured, so sources cannot be discovered. Supply `urls` explicitly, ' +
              'or set SEARXNG_URL / SERPER_API_KEY / SERPAPI_KEY.',
            requestId: request.id,
          });
        }
        return reply.send(emptyOutcome(fields, [], 'no_sources', 'no candidate URL was available'));
      }

      const outcomes = await mapWithLimit(urls.slice(0, body.maxSources * 2), concurrency, (url) =>
        readCandidate(url, body, deps, request.log, controller.signal),
      );

      const pages: PageEvidence[] = [];
      const rejected: RejectedSource[] = [];
      for (const outcome of outcomes) {
        if (outcome.rejected) rejected.push(outcome.rejected);
        else if (outcome.page && pages.length < body.maxSources) pages.push(outcome.page);
      }

      if (pages.length === 0) {
        return reply.send(
          emptyOutcome(
            fields,
            rejected,
            rejected.length > 0 ? 'all_sources_rejected' : 'no_sources',
            rejected.length > 0
              ? `all ${rejected.length} candidate pages were rejected by the source guardrails`
              : 'no candidate page could be read',
          ),
        );
      }

      // Phase one and two. Anything answered here costs no model call at all.
      const { answered, open } = routeStructural(fields, pages);

      // The allowlist the model is checked against. Built from what the code
      // fetched, keyed by the URL the code fetched it from.
      const sources = new Map(pages.map((page) => [page.url, page.text]));

      let modelFields = new Map<string, EnrichedField>();
      let modelReason: NullReason | undefined;
      let usage: { tokens: { input: number; output: number }; model: string } | undefined;

      if (open.length > 0) {
        const apiKeyId = request.apiKey?.id;
        const resolved = apiKeyId && deps.encryptionKey ? await resolveProviderKeys(apiKeyId, deps.encryptionKey) : {};
        const { providerKeys, providerModels, providerBaseUrls } = toClientKeys(resolved);

        try {
          const result = await deps.extractClient.structured({
            content: buildContent(pages),
            schema: buildSchema(open),
            prompt: buildPrompt(body.subject, open),
            providerKeys,
            providerModels,
            providerBaseUrls,
            timeoutMs: body.timeout,
          });

          modelFields = acceptModelFields(open, result.data, sources);
          usage = {
            tokens: { input: result.tokensInput, output: result.tokensOutput },
            model: result.modelUsed,
          };
        } catch (error) {
          // A model that cannot be reached leaves the open fields unanswered.
          // Saying "not stated" there would be a lie about the pages.
          modelReason = 'model_unavailable';
          request.log.warn({ err: error }, 'enrich model phase failed');
        }
      }

      const outcome = assemble(fields, answered, modelFields, pages, rejected, modelReason);

      return reply.send({
        success: true,
        subject: body.subject,
        data: outcome.fields,
        sources: { used: outcome.sourcesUsed, rejected: outcome.sourcesRejected },
        usage,
      });
    } catch (error) {
      if (error instanceof StructuredError || error instanceof ExtractHttpError) {
        return reply.code(200).send({
          success: false,
          failure: { reason: 'service_unavailable', detail: error.detail || `helix-extract answered HTTP ${error.status}` },
        });
      }
      const err = error as { name?: string; message?: string };
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return reply.code(200).send({
          success: false,
          failure: { reason: 'timeout', detail: 'the enrichment did not finish within the budget for this call' },
        });
      }
      request.log.error({ err: error }, 'enrich failed');
      return reply.code(200).send({
        success: false,
        failure: { reason: 'service_unavailable', detail: err.message ?? 'enrichment could not be completed' },
      });
    } finally {
      reply.raw.off('close', onClose);
    }
  });
}

/** Every field null for the same reason, when there was nothing to read. */
function emptyOutcome(
  fields: readonly FieldSpec[],
  rejected: readonly RejectedSource[],
  reason: NullReason,
  detail: string,
) {
  const outcome = assemble(fields, new Map(), new Map(), [], rejected, reason);
  return {
    success: true,
    data: outcome.fields,
    sources: { used: [], rejected: outcome.sourcesRejected },
    warnings: [detail],
  };
}
