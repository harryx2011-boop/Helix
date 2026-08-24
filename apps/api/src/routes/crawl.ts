import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { compilePathPattern } from '../crawl/url.js';
import type { CrawlJobRequest } from '../crawl/worker.js';
import { WEBHOOK_EVENTS } from '../webhooks/deliveries.js';
import { discoverUrls, type MapRouteDeps } from './map.js';
import { cancelJob, fetchJobView } from './jobs.js';

/**
 * Crawl.
 *
 * Asynchronous: returns a job id, and work proceeds against the Postgres-backed
 * queue. Pass `estimate: true` to learn what a crawl would cost before spending
 * anything on it — the answer to the loudest complaint about tools in this
 * category, where a job's size is unknowable until the bill arrives.
 *
 * `GET` and `DELETE /crawl/{jobId}` serve the same job view as `/jobs/{id}`,
 * under the path the crawl spec documents.
 */

export interface CrawlLimits {
  /** Applied when the request omits `limit`. */
  defaultLimit: number;
  /** A request above this is rejected, not clamped: silent clamping hides the ceiling. */
  maxLimit: number;
  maxDepth: number;
}

export const DEFAULT_CRAWL_LIMITS: CrawlLimits = {
  defaultLimit: 1000,
  maxLimit: 100_000,
  maxDepth: 50,
};

export interface CrawlRouteDeps extends MapRouteDeps {
  defaultModel: string;
  limits?: Partial<CrawlLimits> | undefined;
}

const TIERS = ['auto', 'plain', 'tls', 'lightpanda', 'chromium'] as const;
const EXTRACTORS = ['trafilatura', 'readability', 'auto'] as const;

const ScrapeOptionsSchema = z.object({
  formats: z.array(z.string()).optional(),
  tier: z.enum(TIERS).optional(),
  extractor: z.enum(EXTRACTORS).optional(),
  onlyMainContent: z.boolean().optional(),
});

const WebhookObjectSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// The spec writes `webhook` as a bare URL; the fuller object form carries
// headers, an event filter and metadata. Both normalise to the object.
const WebhookSchema = z.union([
  z
    .string()
    .url()
    .transform((url) => ({ url })),
  WebhookObjectSchema,
]);

function crawlRequestSchema(limits: CrawlLimits) {
  return z.object({
    url: z.string().url(),
    estimate: z.boolean().default(false),
    limit: z.number().int().min(1).max(limits.maxLimit).default(limits.defaultLimit),
    maxDepth: z.number().int().min(0).max(limits.maxDepth).optional(),
    includePaths: z.array(z.string()).default([]),
    excludePaths: z.array(z.string()).default([]),
    allowSubdomains: z.boolean().default(false),
    allowExternal: z.boolean().optional(),
    allowExternalLinks: z.boolean().optional(),
    sitemap: z.enum(['include', 'skip', 'only']).default('include'),
    respectRobots: z.boolean().default(true),
    politeness: z.enum(['adaptive', 'fixed']).default('adaptive'),
    maxConcurrency: z.number().int().min(1).max(64).optional(),
    delay: z.number().min(0).max(60).optional(),
    incremental: z.boolean().default(false),
    ignoreQueryParameters: z.boolean().default(false),
    formats: z.array(z.string()).optional(),
    tier: z.enum(TIERS).optional(),
    extractor: z.enum(EXTRACTORS).optional(),
    onlyMainContent: z.boolean().optional(),
    scrapeOptions: ScrapeOptionsSchema.optional(),
    webhook: WebhookSchema.optional(),
  });
}

type ParsedCrawlRequest = z.infer<ReturnType<typeof crawlRequestSchema>>;

/** Collapse the aliases into the one shape the worker reads. */
export function normaliseCrawlRequest(body: ParsedCrawlRequest): CrawlJobRequest {
  const scrape = body.scrapeOptions ?? {};
  const request: CrawlJobRequest = {
    url: body.url,
    limit: body.limit,
    includePaths: body.includePaths,
    excludePaths: body.excludePaths,
    allowSubdomains: body.allowSubdomains,
    allowExternal: body.allowExternal ?? body.allowExternalLinks ?? false,
    sitemap: body.sitemap,
    respectRobots: body.respectRobots,
    politeness: body.politeness,
    incremental: body.incremental,
    ignoreQueryParameters: body.ignoreQueryParameters,
    formats: scrape.formats ?? body.formats ?? ['markdown'],
    tier: scrape.tier ?? body.tier ?? 'auto',
    extractor: scrape.extractor ?? body.extractor ?? 'trafilatura',
    onlyMainContent: scrape.onlyMainContent ?? body.onlyMainContent ?? true,
  };
  if (body.maxDepth !== undefined) request.maxDepth = body.maxDepth;
  if (body.maxConcurrency !== undefined) request.maxConcurrency = body.maxConcurrency;
  if (body.delay !== undefined) request.delay = body.delay;
  if (body.webhook !== undefined) request.webhook = body.webhook;
  return request;
}

/** The first path pattern that neither parses as a glob nor as a regular expression. */
function invalidPattern(body: ParsedCrawlRequest): string | undefined {
  for (const field of ['includePaths', 'excludePaths'] as const) {
    const index = body[field].findIndex((pattern) => compilePathPattern(pattern) === undefined);
    if (index !== -1) return `${field}.${index}`;
  }
  return undefined;
}

/** Rough per-tier wall-clock, used only for projections. */
const TIER_SECONDS: Record<string, number> = {
  plain: 0.3,
  tls: 0.4,
  lightpanda: 0.6,
  chromium: 3.0,
};

/** Characters per token, near enough for an estimate. */
const CHARS_PER_TOKEN = 4;
const AVERAGE_PAGE_CHARS = 6_000;

export async function registerCrawl(app: FastifyInstance, deps: CrawlRouteDeps): Promise<void> {
  const limits: CrawlLimits = { ...DEFAULT_CRAWL_LIMITS, ...deps.limits };
  const schema = crawlRequestSchema(limits);

  app.post('/crawl', async (request, reply) => {
    const parsed = schema.safeParse(request.body);

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({
        error: 'invalid_request',
        message: first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
        field: first?.path.join('.'),
        requestId: request.id,
      });
    }

    const badPattern = invalidPattern(parsed.data);
    if (badPattern) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `${badPattern}: not a valid glob or regular expression`,
        field: badPattern,
        requestId: request.id,
      });
    }

    const body = normaliseCrawlRequest(parsed.data);

    if (parsed.data.estimate) {
      const { links, truncated } = await discoverUrls(
        body.url,
        {
          sitemap: body.sitemap,
          limit: body.limit,
          ignoreQueryParameters: body.ignoreQueryParameters,
        },
        deps,
      );

      const pages = Math.min(links.length, body.limit);

      // Without running the ladder there is no way to know the tier split, so
      // the estimate assumes the cheap path and says so. An estimate that
      // silently assumed the expensive path would be useless in the other
      // direction.
      const assumedTier = body.tier === 'auto' ? 'tls' : body.tier;
      const perPageSeconds = TIER_SECONDS[assumedTier] ?? 0.5;

      const concurrency = body.maxConcurrency ?? 4;
      const estimatedSeconds = Math.ceil((pages * perPageSeconds) / concurrency);

      const needsModel = body.formats.includes('json') || body.formats.includes('summary');
      const inputTokens = needsModel
        ? Math.ceil((pages * AVERAGE_PAGE_CHARS) / CHARS_PER_TOKEN)
        : 0;

      const assumptions = [
        `${pages} pages discovered${truncated ? ' (truncated at the limit)' : ''}`,
        `assumes the ${assumedTier} tier; pages needing a browser cost more`,
        `assumes ${concurrency} concurrent requests`,
      ];

      if (needsModel) {
        assumptions.push(
          `assumes ~${AVERAGE_PAGE_CHARS} characters per page for token estimates`,
          'tokens are billed by your provider, not by Helix',
        );
      }

      return reply.send({
        pages,
        pagesFromCache: 0,
        tierBreakdown: { [assumedTier]: pages },
        estimatedSeconds,
        estimatedTokens: { input: inputTokens, output: needsModel ? pages * 200 : 0 },
        estimatedProviderCost: needsModel
          ? { amount: null, currency: 'USD', model: deps.defaultModel }
          : { amount: 0, currency: 'USD', model: 'none' },
        assumptions,
      });
    }

    const apiKeyId = request.apiKey?.id ?? null;

    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO jobs (api_key_id, type, status, request)
       VALUES ($1, 'crawl', 'queued', $2)
       RETURNING id`,
      [apiKeyId, JSON.stringify(body)],
    );

    const job = rows[0];
    if (!job) {
      return reply.code(500).send({
        error: 'internal_error',
        message: 'Could not create the crawl job.',
        requestId: request.id,
      });
    }

    // The seed is the frontier's first entry; the worker expands from there.
    await getPool().query(
      `INSERT INTO job_tasks (job_id, url, depth, idempotency_key)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (job_id, idempotency_key) DO NOTHING`,
      [job.id, body.url, `${body.url}::0`],
    );

    return reply.code(202).send({
      success: true,
      id: job.id,
      jobId: job.id,
      url: `/v1/crawl/${job.id}`,
    });
  });

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/crawl/:id',
    async (request, reply) => {
      const result = await fetchJobView(request.params.id, {
        cursor: request.query.cursor,
        basePath: '/v1/crawl',
        type: 'crawl',
        requestId: request.id,
      });
      return reply.code(result.code).send(result.body);
    },
  );

  app.delete<{ Params: { id: string } }>('/crawl/:id', async (request, reply) => {
    const result = await cancelJob(request.params.id, { type: 'crawl', requestId: request.id });
    return reply.code(result.code).send(result.body);
  });
}
