import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import type { CrawlJobRequest } from '../crawl/worker.js';
import { ScrapeOptionsSchema, WebhookSchema, TIERS, EXTRACTORS } from './crawl.js';
import { cancelJob, fetchJobView } from './jobs.js';

/**
 * Batch scrape: many URLs in, one job to poll.
 *
 * This is `/scrape` run on the machinery `/crawl` already owns — the same job
 * table, worker, per-host politeness and result pagination. It adds no fetch,
 * extract or browser behaviour of its own.
 *
 * A batch is a crawl whose frontier is supplied rather than discovered, which
 * is expressed with the options the frontier already understands: `maxDepth: 0`
 * rejects every link a page yields as too deep, and `allowExternal` lets the
 * supplied list span hosts. Nothing is followed, nothing is guessed.
 *
 * Asynchronous only. A synchronous form would be a second execution path for
 * work that already outlives a request timeout at any interesting size.
 */

export interface BatchLimits {
  /** URLs one batch may carry. A caller-supplied list is not a runaway frontier, so this is generous. */
  maxUrls: number;
}

export const DEFAULT_BATCH_LIMITS: BatchLimits = { maxUrls: 10_000 };

export interface BatchRouteDeps {
  limits?: Partial<BatchLimits> | undefined;
}

const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'must be an http(s) URL');

function batchRequestSchema(limits: BatchLimits) {
  return z.object({
    urls: z.array(z.string()).min(1).max(limits.maxUrls),
    /** Drop unparseable URLs and report them, instead of rejecting the whole batch. */
    ignoreInvalidURLs: z.boolean().default(false),
    formats: z.array(z.string()).optional(),
    tier: z.enum(TIERS).optional(),
    extractor: z.enum(EXTRACTORS).optional(),
    onlyMainContent: z.boolean().optional(),
    scrapeOptions: ScrapeOptionsSchema.optional(),
    maxConcurrency: z.number().int().min(1).max(64).optional(),
    delay: z.number().min(0).max(60).optional(),
    webhook: WebhookSchema.optional(),
  });
}

type ParsedBatchRequest = z.infer<ReturnType<typeof batchRequestSchema>>;

interface PartitionedUrls {
  valid: string[];
  invalid: string[];
}

function partitionUrls(urls: string[]): PartitionedUrls {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const candidate of urls) {
    if (!HttpUrlSchema.safeParse(candidate).success) {
      invalid.push(candidate);
      continue;
    }
    // The frontier dedupes too, but doing it here keeps `total` honest in the
    // 202 rather than reporting a count the job will never reach.
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    valid.push(candidate);
  }

  return { valid, invalid };
}

/**
 * The job request the crawl worker reads.
 *
 * `maxDepth: 0` is what makes this a batch rather than a crawl: the worker
 * still calls `frontier.add` for every link it finds, and every one is rejected
 * as too deep.
 */
export function toBatchJobRequest(body: ParsedBatchRequest, urls: string[]): CrawlJobRequest {
  const scrape = body.scrapeOptions ?? {};
  const seed = urls[0] as string;

  const request: CrawlJobRequest = {
    url: seed,
    limit: urls.length,
    maxDepth: 0,
    includePaths: [],
    excludePaths: [],
    allowSubdomains: true,
    // A supplied list may span hosts; scope filtering would silently drop them.
    allowExternal: true,
    sitemap: 'skip',
    respectRobots: true,
    politeness: 'adaptive',
    incremental: false,
    ignoreQueryParameters: false,
    formats: scrape.formats ?? body.formats ?? ['markdown'],
    tier: scrape.tier ?? body.tier ?? 'auto',
    extractor: scrape.extractor ?? body.extractor ?? 'trafilatura',
    onlyMainContent: scrape.onlyMainContent ?? body.onlyMainContent ?? true,
  };
  if (body.maxConcurrency !== undefined) request.maxConcurrency = body.maxConcurrency;
  if (body.delay !== undefined) request.delay = body.delay;
  if (body.webhook !== undefined) request.webhook = body.webhook;
  return request;
}

export async function registerBatch(app: FastifyInstance, deps: BatchRouteDeps = {}): Promise<void> {
  const limits: BatchLimits = { ...DEFAULT_BATCH_LIMITS, ...deps.limits };
  const schema = batchRequestSchema(limits);

  app.post('/batch/scrape', async (request, reply) => {
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

    const body = parsed.data;
    const { valid, invalid } = partitionUrls(body.urls);

    if (invalid.length > 0 && !body.ignoreInvalidURLs) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `urls.${body.urls.indexOf(invalid[0] as string)}: must be an http(s) URL`,
        field: 'urls',
        invalidURLs: invalid,
        requestId: request.id,
      });
    }

    if (valid.length === 0) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'urls: no valid http(s) URL in the batch',
        field: 'urls',
        invalidURLs: invalid,
        requestId: request.id,
      });
    }

    const jobRequest = toBatchJobRequest(body, valid);
    const apiKeyId = request.apiKey?.id ?? null;

    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO jobs (api_key_id, type, status, request)
       VALUES ($1, 'batch_scrape', 'queued', $2)
       RETURNING id`,
      [apiKeyId, JSON.stringify(jobRequest)],
    );

    const job = rows[0];
    if (!job) {
      return reply.code(500).send({
        error: 'internal_error',
        message: 'Could not create the batch job.',
        requestId: request.id,
      });
    }

    // Every URL is a seed at depth 0. A crawl seeds one and discovers the rest;
    // here the caller has already done the discovering.
    const values: string[] = [];
    const params: unknown[] = [job.id];
    valid.forEach((url, index) => {
      values.push(`($1, $${index + 2}, 0, $${index + 2})`);
      params.push(url);
    });
    await getPool().query(
      `INSERT INTO job_tasks (job_id, url, depth, idempotency_key)
       VALUES ${values.join(', ')}
       ON CONFLICT (job_id, idempotency_key) DO NOTHING`,
      params,
    );
    await getPool().query('UPDATE jobs SET total = $2 WHERE id = $1', [job.id, valid.length]);

    return reply.code(202).send({
      success: true,
      id: job.id,
      jobId: job.id,
      total: valid.length,
      ...(invalid.length > 0 ? { invalidURLs: invalid } : {}),
      url: `/v1/batch/scrape/${job.id}`,
    });
  });

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/batch/scrape/:id',
    async (request, reply) => {
      const result = await fetchJobView(request.params.id, {
        cursor: request.query.cursor,
        basePath: '/v1/batch/scrape',
        type: 'batch_scrape',
        requestId: request.id,
      });
      return reply.code(result.code).send(result.body);
    },
  );

  app.delete<{ Params: { id: string } }>('/batch/scrape/:id', async (request, reply) => {
    const result = await cancelJob(request.params.id, { type: 'batch_scrape', requestId: request.id });
    return reply.code(result.code).send(result.body);
  });
}
