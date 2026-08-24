import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { discoverUrls, type MapRouteDeps } from './map.js';

/**
 * Crawl.
 *
 * Asynchronous: returns a job id, and work proceeds against the Postgres-backed
 * queue. Pass `estimate: true` to learn what a crawl would cost before spending
 * anything on it — the answer to the loudest complaint about tools in this
 * category, where a job's size is unknowable until the bill arrives.
 */

const CrawlRequestSchema = z.object({
  url: z.string().url(),
  estimate: z.boolean().default(false),
  limit: z.number().int().min(1).max(100_000).default(1000),
  maxDepth: z.number().int().min(0).max(50).optional(),
  includePaths: z.array(z.string()).default([]),
  excludePaths: z.array(z.string()).default([]),
  allowSubdomains: z.boolean().default(false),
  allowExternal: z.boolean().default(false),
  sitemap: z.enum(['include', 'skip', 'only']).default('include'),
  respectRobots: z.boolean().default(true),
  politeness: z.enum(['adaptive', 'fixed']).default('adaptive'),
  maxConcurrency: z.number().int().min(1).max(64).optional(),
  delay: z.number().min(0).max(60).optional(),
  incremental: z.boolean().default(false),
  ignoreQueryParameters: z.boolean().default(false),
  formats: z.array(z.string()).default(['markdown']),
  tier: z.enum(['auto', 'plain', 'tls', 'lightpanda', 'chromium']).default('auto'),
  extractor: z.enum(['trafilatura', 'readability', 'auto']).default('trafilatura'),
  onlyMainContent: z.boolean().default(true),
  webhook: z
    .object({
      url: z.string().url(),
      headers: z.record(z.string()).optional(),
      events: z.array(z.string()).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export interface CrawlRouteDeps extends MapRouteDeps {
  defaultModel: string;
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
  app.post('/crawl', async (request, reply) => {
    const parsed = CrawlRequestSchema.safeParse(request.body);

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

    if (body.estimate) {
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
      url: `/v1/jobs/${job.id}`,
    });
  });
}
