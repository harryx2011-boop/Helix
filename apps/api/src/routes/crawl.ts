import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { compilePathPattern, fetchUrl, normaliseUrl } from '../crawl/url.js';
import type { CrawlJobRequest } from '../crawl/worker.js';
import { WEBHOOK_EVENTS } from '../webhooks/deliveries.js';
import { MAX_WEBHOOK_BYTES, webhookHeadersProblem, webhookTargetProblem } from '../webhooks/target.js';
import { discoverUrls, type MapRouteDeps } from './map.js';
import { checkUrl } from '../core/url-guard.js';
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
  /** Applied when the request omits `respectRobots`. The operator sets the instance's stance. */
  respectRobots: boolean;
}

export const DEFAULT_CRAWL_LIMITS: CrawlLimits = {
  defaultLimit: 1000,
  maxLimit: 100_000,
  maxDepth: 50,
  respectRobots: true,
};

export interface CrawlRouteDeps extends MapRouteDeps {
  defaultModel: string;
  limits?: Partial<CrawlLimits> | undefined;
}

/**
 * The formats a crawled page can be asked for. openapi.yaml has always declared
 * this as the closed `Format` enum; validating it as a bare string let an
 * unknown name through to be dropped silently per page, which reads to the
 * caller as the format simply not working.
 */
export const CRAWL_FORMATS = ['markdown', 'html', 'rawHtml', 'text', 'links', 'screenshot', 'json', 'chunks'] as const;

export const TIERS = ['auto', 'plain', 'tls', 'lightpanda', 'chromium', 'camoufox'] as const;
export const EXTRACTORS = ['trafilatura', 'readability', 'auto'] as const;

/**
 * Structured extraction applied to every page of the crawl.
 *
 * The same shape `/scrape` accepts, so a schema written for one page works
 * across a whole site without being restated. `schema` and `prompt` are both
 * optional individually but one is required when `json` is among the formats;
 * the route rejects the combination rather than the worker dropping it per page.
 */
export const JsonOptionsSchema = z.object({
  schema: z.record(z.unknown()).optional(),
  prompt: z.string().min(1).max(2000).optional(),
  provider: z.string().max(64).optional(),
  model: z.string().max(200).optional(),
});

export const ScrapeOptionsSchema = z.object({
  formats: z.array(z.enum(CRAWL_FORMATS)).min(1).optional(),
  tier: z.enum(TIERS).optional(),
  extractor: z.enum(EXTRACTORS).optional(),
  onlyMainContent: z.boolean().optional(),
  jsonOptions: JsonOptionsSchema.optional(),
});

// The dispatcher POSTs from the server's own network, so the target is
// checked here before the job exists, and the headers it will send are checked
// against what fetch accepts: a header fetch rejects fails every attempt.
const WebhookUrlSchema = z
  .string()
  .url()
  .superRefine((url, ctx) => {
    const problem = webhookTargetProblem(url);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

const WebhookObjectSchema = z
  .object({
    url: WebhookUrlSchema,
    headers: z.record(z.string()).optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .superRefine((webhook, ctx) => {
    const headerProblem = webhook.headers ? webhookHeadersProblem(webhook.headers) : undefined;
    if (headerProblem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['headers'], message: headerProblem });
    }
    // Copied into every delivery row, so bounded like the headers.
    if (webhook.metadata && Buffer.byteLength(JSON.stringify(webhook.metadata)) > MAX_WEBHOOK_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata'],
        message: `must serialise to at most ${MAX_WEBHOOK_BYTES} bytes`,
      });
    }
  });

// The spec writes `webhook` as a bare URL; the fuller object form carries
// headers, an event filter and metadata. Both normalise to the object.
export const WebhookSchema = z.union([WebhookUrlSchema.transform((url) => ({ url })), WebhookObjectSchema]);

export const DestinationSchema = z.object({
  type: z.enum(['qdrant', 'pgvector']),
  collection: z.string().optional(),
  namespace: z.string().optional(),
  upsertMode: z.enum(['update-in-place', 'append']).default('update-in-place'),
});

function crawlRequestSchema(limits: CrawlLimits) {
  return z.object({
    /**
     * Absent when `resume` names an existing job, whose seed is already known.
     * Checked in `superRefine` rather than here, so the error names the pair.
     */
    url: z.string().url().optional(),
    /**
     * Revive a cancelled crawl instead of starting one.
     *
     * The frontier is already durable — a worker that dies resumes on its own —
     * so what this adds is un-cancelling: the job's queued rows are still there
     * until `expires_at`, and this re-queues them under the original job id.
     */
    resume: z.string().uuid().optional(),
    estimate: z.boolean().default(false),
    limit: z.number().int().min(1).max(limits.maxLimit).default(limits.defaultLimit),
    maxDepth: z.number().int().min(0).max(limits.maxDepth).optional(),
    includePaths: z.array(z.string()).default([]),
    excludePaths: z.array(z.string()).default([]),
    allowSubdomains: z.boolean().default(false),
    allowExternal: z.boolean().optional(),
    allowExternalLinks: z.boolean().optional(),
    sitemap: z.enum(['include', 'skip', 'only']).default('include'),
    respectRobots: z.boolean().default(limits.respectRobots),
    politeness: z.enum(['adaptive', 'fixed']).default('adaptive'),
    maxConcurrency: z.number().int().min(1).max(64).optional(),
    delay: z.number().min(0).max(60).optional(),
    incremental: z.boolean().default(false),
    /**
     * Omit unchanged pages from the response instead of returning them.
     *
     * `incremental` decides what is *fetched*; this decides what is *returned*.
     * A weekly re-crawl of a 500-page docs site wants the twelve pages that
     * moved, not 500 rows to diff client-side. Implies `incremental`, because
     * filtering on a hash the crawl never loaded would return everything.
     */
    changesOnly: z.boolean().default(false),
    /**
     * Cap on pages sharing a path prefix. Bounds calendar and facet traps,
     * where a crawl otherwise spends its whole limit on ?date=2019-04-17.
     */
    maxPagesPerPath: z.number().int().min(1).max(100_000).optional(),
    /**
     * Content filters, applied after extraction and before the page is kept.
     * `includeContent` keeps only pages matching at least one pattern;
     * `excludeContent` drops any page matching one. Path patterns cannot
     * express "skip the login wall" when every such page has a distinct URL.
     */
    includeContent: z.array(z.string()).default([]),
    excludeContent: z.array(z.string()).default([]),
    ignoreQueryParameters: z.boolean().default(false),
    formats: z.array(z.enum(CRAWL_FORMATS)).min(1).optional(),
    tier: z.enum(TIERS).optional(),
    extractor: z.enum(EXTRACTORS).optional(),
    onlyMainContent: z.boolean().optional(),
    scrapeOptions: ScrapeOptionsSchema.optional(),
    destination: DestinationSchema.optional(),
    webhook: WebhookSchema.optional(),
  })
  .superRefine((body, ctx) => {
    if (!body.url && !body.resume) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'required unless `resume` names a job' });
    }
    if (body.url && body.resume) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resume'],
        message: 'cannot be combined with `url`: a resumed crawl keeps its original seed',
      });
    }
    if (body.estimate && body.resume) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estimate'],
        message: 'cannot be combined with `resume`: the work is already queued',
      });
    }
    // `json` without a schema or prompt would be dropped silently on every
    // page. Rejecting the request says so once instead of n times.
    const formats = body.scrapeOptions?.formats ?? body.formats;
    const json = body.scrapeOptions?.jsonOptions;
    if (formats?.includes('json') && !json?.schema && !json?.prompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scrapeOptions', 'jsonOptions'],
        message: 'formats includes "json": provide scrapeOptions.jsonOptions.schema or .prompt',
      });
    }
  });
}

type ParsedCrawlRequest = z.infer<ReturnType<typeof crawlRequestSchema>>;

/**
 * Collapse the aliases into the one shape the worker reads.
 *
 * `seedUrl` is passed separately for a resumed crawl, whose seed comes from the
 * stored job rather than the request body.
 */
export function normaliseCrawlRequest(body: ParsedCrawlRequest, seedUrl?: string): CrawlJobRequest {
  const scrape = body.scrapeOptions ?? {};
  const url = body.url ?? seedUrl;
  if (!url) throw new Error('normaliseCrawlRequest: no url and no seedUrl');
  const request: CrawlJobRequest = {
    url,
    limit: body.limit,
    includePaths: body.includePaths,
    excludePaths: body.excludePaths,
    allowSubdomains: body.allowSubdomains,
    allowExternal: body.allowExternal ?? body.allowExternalLinks ?? false,
    sitemap: body.sitemap,
    respectRobots: body.respectRobots,
    politeness: body.politeness,
    // A response filter over unchanged pages is meaningless unless the crawl
    // loaded the hashes to compare against, so asking for one turns the other on.
    incremental: body.incremental || body.changesOnly,
    changesOnly: body.changesOnly,
    includeContent: body.includeContent,
    excludeContent: body.excludeContent,
    ignoreQueryParameters: body.ignoreQueryParameters,
    formats: scrape.formats ?? body.formats ?? ['markdown'],
    tier: scrape.tier ?? body.tier ?? 'auto',
    extractor: scrape.extractor ?? body.extractor ?? 'trafilatura',
    onlyMainContent: scrape.onlyMainContent ?? body.onlyMainContent ?? true,
  };
  if (body.maxDepth !== undefined) request.maxDepth = body.maxDepth;
  if (body.maxConcurrency !== undefined) request.maxConcurrency = body.maxConcurrency;
  if (body.maxPagesPerPath !== undefined) request.maxPagesPerPath = body.maxPagesPerPath;
  if (scrape.jsonOptions !== undefined) request.jsonOptions = scrape.jsonOptions;
  if (body.delay !== undefined) request.delay = body.delay;
  if (body.webhook !== undefined) request.webhook = body.webhook;
  if (body.destination !== undefined) request.destination = body.destination;
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
  camoufox: 4.0,
};

/** Characters per token, near enough for an estimate. */
const CHARS_PER_TOKEN = 4;
const AVERAGE_PAGE_CHARS = 6_000;

/**
 * What a crawl would cost before it runs.
 *
 * Shared by `estimate: true` on POST /crawl and by POST /crawl/estimate, which
 * exists because callers want the number without constructing a job body they
 * do not intend to submit.
 */
async function estimateCrawl(body: CrawlJobRequest, deps: CrawlRouteDeps): Promise<Record<string, unknown>> {
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

    const needsModel = body.formats.includes('json');
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

    return {
      pages,
      pagesFromCache: 0,
      tierBreakdown: { [assumedTier]: pages },
      estimatedSeconds,
      estimatedTokens: { input: inputTokens, output: needsModel ? pages * 200 : 0 },
      estimatedProviderCost: needsModel
        ? { amount: null, currency: 'USD', model: deps.defaultModel }
        : { amount: 0, currency: 'USD', model: 'none' },
      assumptions,
    };
}

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

    // Resume: the seed and the queued rows already exist, so this re-opens the
    // job rather than creating one. Ownership is checked against the calling
    // key for the same reason GET /crawl/{id} checks it.
    if (parsed.data.resume) {
      const jobId = parsed.data.resume;
      const { rows } = await getPool().query<{
        api_key_id: string | null;
        status: string;
        request: CrawlJobRequest;
        expires_at: Date;
        lease_expires_at: Date | null;
      }>(
        `SELECT api_key_id, status, request, expires_at, lease_expires_at
           FROM jobs WHERE id = $1 AND type = 'crawl'`,
        [jobId],
      );

      const existing = rows[0];
      if (!existing) {
        return reply.code(404).send({
          error: 'not_found',
          message: `No crawl job ${jobId}.`,
          requestId: request.id,
        });
      }

      if (existing.expires_at.getTime() <= Date.now()) {
        return reply.code(409).send({
          error: 'expired',
          message: `Crawl job ${jobId} expired at ${existing.expires_at.toISOString()}; its queue has been released.`,
          requestId: request.id,
        });
      }

      // A 'running' job whose lease has lapsed has no worker behind it: the
      // process that claimed it died without releasing it. Refusing that as
      // "already running" is what made the strand permanent, since the worker
      // will not re-claim it either. An unexpired lease still means a live
      // worker and is still refused.
      // Absent as well as null: a row read before 012 applied carries no lease
      // column at all, and treating that as "held" would restore the strand.
      const leaseHeld = existing.lease_expires_at
        ? existing.lease_expires_at.getTime() > Date.now()
        : false;
      if (existing.status === 'queued' || (existing.status === 'running' && leaseHeld)) {
        return reply.code(409).send({
          error: 'already_running',
          message: `Crawl job ${jobId} is ${existing.status} and does not need resuming.`,
          requestId: request.id,
        });
      }

      // Rows left 'running' belonged to the cancelled worker and will never be
      // completed by it; they go back on the queue alongside the untouched ones.
      const { rowCount } = await getPool().query(
        `UPDATE job_tasks
            SET status = 'queued', claimed_at = NULL, claimed_by = NULL, available_at = now()
          WHERE job_id = $1 AND status IN ('running', 'queued')`,
        [jobId],
      );

      if (!rowCount) {
        return reply.code(409).send({
          error: 'nothing_to_resume',
          message: `Crawl job ${jobId} has no unfinished pages left in its queue.`,
          requestId: request.id,
        });
      }

      await getPool().query(
        "UPDATE jobs SET status = 'queued', finished_at = NULL, error = NULL WHERE id = $1",
        [jobId],
      );

      return reply.code(202).send({ id: jobId, status: 'queued', resumed: true, requeued: rowCount });
    }

    const body = normaliseCrawlRequest(parsed.data);

    // The seed is the caller's choice of what this instance connects to, and it
    // is written to the frontier for a worker to fetch later. Checked here, or
    // the job is accepted and the fetch happens out of band.
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

    if (parsed.data.estimate) {
      return reply.send(await estimateCrawl(body, deps));
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
    // Written as the frontier's `url` and `key` (see FrontierItem): the worker
    // claims and completes rows by that exact string, so a raw
    // `https://example.com` row was never matched and its page was dropped.
    const seed = fetchUrl(body.url) ?? body.url;
    const key = normaliseUrl(body.url, { ignoreQuery: body.ignoreQueryParameters }) ?? seed;
    await getPool().query(
      `INSERT INTO job_tasks (job_id, url, depth, idempotency_key)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (job_id, idempotency_key) DO NOTHING`,
      [job.id, seed, `${key}::0`],
    );

    return reply.code(202).send({
      success: true,
      id: job.id,
      jobId: job.id,
      url: `/v1/crawl/${job.id}`,
    });
  });

  /**
   * The estimate on its own, without submitting a job body a caller does not
   * intend to run. Registered before `/crawl/:id` so "estimate" is never
   * matched as a job id.
   */
  app.post('/crawl/estimate', async (request, reply) => {
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

    if (parsed.data.resume) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'resume: cannot be estimated; the work is already queued',
        field: 'resume',
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

    return reply.send(await estimateCrawl(normaliseCrawlRequest(parsed.data), deps));
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
