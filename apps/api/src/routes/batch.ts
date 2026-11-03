import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { fetchUrl, normaliseUrl } from '../crawl/url.js';
import type { CrawlJobRequest } from '../crawl/worker.js';
import { ScrapeOptionsSchema, WebhookSchema, TIERS, EXTRACTORS, CRAWL_FORMATS } from './crawl.js';
import { cancelJob, fetchJobView } from './jobs.js';
import { checkUrl, type HostResolver } from '../core/url-guard.js';
import { mapWithLimit } from '../core/map-with-limit.js';


export interface BatchLimits {
  maxUrls: number;
}

export const DEFAULT_BATCH_LIMITS: BatchLimits = { maxUrls: 10_000 };

export interface BatchRouteDeps {
  limits?: Partial<BatchLimits> | undefined;
  allowPrivateUrls?: boolean | undefined;
  resolveHost?: HostResolver | undefined;
}

async function firstUnsafeUrl(urls: string[], deps: BatchRouteDeps): Promise<{ url: string; reason: string } | undefined> {
  const oneUrlPerHost = new Map<string, string>();
  for (const url of urls) {
    const host = new URL(url).host;
    if (!oneUrlPerHost.has(host)) oneUrlPerHost.set(host, url);
  }
  const guard = { allowPrivate: deps.allowPrivateUrls, resolve: deps.resolveHost };
  const verdicts = await mapWithLimit([...oneUrlPerHost.values()], 16, async (url) => ({ url, verdict: await checkUrl(url, guard) }));
  const unsafe = verdicts.find((entry) => !entry.verdict.ok);
  return unsafe && !unsafe.verdict.ok ? { url: unsafe.url, reason: unsafe.verdict.reason } : undefined;
}

const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'must be an http(s) URL');

function batchRequestSchema(limits: BatchLimits) {
  return z.object({
    urls: z.array(z.string()).min(1).max(limits.maxUrls),
    ignoreInvalidURLs: z.boolean().default(false),
    formats: z.array(z.enum(CRAWL_FORMATS)).min(1).optional(),
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
    const url = fetchUrl(candidate) ?? candidate;
    const key = normaliseUrl(candidate) ?? url;
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(url);
  }

  return { valid, invalid };
}

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

    const unsafe = await firstUnsafeUrl(valid, deps);
    if (unsafe) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `urls: ${unsafe.url} ${unsafe.reason}`,
        field: 'urls',
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
