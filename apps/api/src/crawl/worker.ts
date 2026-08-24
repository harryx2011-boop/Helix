import { getPool } from '../db/pool.js';
import { runPipeline, type PipelineDeps } from '../core/pipeline.js';
import { PersistentFrontier } from './persistent-frontier.js';
import { conditionalHeaders, isUnchanged, loadStateForSite, recordVisit } from './state.js';
import { PolitenessController } from './politeness.js';
import { RobotsCache } from './robots.js';
import { SitemapFetcher } from './sitemap.js';
import { siteOf } from './url.js';
import type { Log } from '../core/logger.js';
import { enqueueDelivery, type WebhookConfig, type WebhookEvent } from '../webhooks/deliveries.js';

/**
 * The crawl worker.
 *
 * Claims a queued job, walks its frontier, and writes results as it goes.
 *
 * Two properties matter more than throughput. Progress is durable — every page
 * is written when it completes, so a restart resumes rather than starts over.
 * And failures are recorded as typed rows rather than dropped, so a crawl that
 * returned forty pages out of a hundred can say what happened to the other sixty.
 */

export interface CrawlJobRequest {
  url: string;
  limit: number;
  maxDepth?: number | undefined;
  includePaths: string[];
  excludePaths: string[];
  allowSubdomains: boolean;
  allowExternal: boolean;
  sitemap: 'include' | 'skip' | 'only';
  respectRobots: boolean;
  politeness: 'adaptive' | 'fixed';
  maxConcurrency?: number | undefined;
  delay?: number | undefined;
  incremental: boolean;
  ignoreQueryParameters: boolean;
  formats: string[];
  tier: 'auto' | 'plain' | 'tls' | 'lightpanda' | 'chromium';
  extractor: 'trafilatura' | 'readability' | 'auto';
  onlyMainContent: boolean;
  webhook?: WebhookConfig | undefined;
}

export interface WorkerDeps extends PipelineDeps {
  userAgent: string;
  logger?: Log | undefined;
}

export class CrawlWorker {
  readonly #deps: WorkerDeps;
  readonly #logger: Log | undefined;
  #running = false;
  #stopping = false;

  constructor(deps: WorkerDeps) {
    this.#deps = deps;
    this.#logger = deps.logger;
  }

  /**
   * Claim one queued job.
   *
   * `FOR UPDATE SKIP LOCKED` is what makes several workers safe against one
   * queue without a broker: each claims a different row, and none blocks.
   */
  async #claimJob(): Promise<{ id: string; request: CrawlJobRequest } | undefined> {
    const { rows } = await getPool().query<{ id: string; request: CrawlJobRequest }>(
      `UPDATE jobs
          SET status = 'running', started_at = now()
        WHERE id = (
          SELECT id FROM jobs
           WHERE status = 'queued' AND type = 'crawl'
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
        RETURNING id, request`,
    );
    return rows[0];
  }

  async #isCancelled(jobId: string): Promise<boolean> {
    const { rows } = await getPool().query<{ status: string }>(
      'SELECT status FROM jobs WHERE id = $1',
      [jobId],
    );
    return rows[0]?.status === 'cancelled';
  }

  async runOnce(): Promise<boolean> {
    const job = await this.#claimJob();
    if (!job) return false;

    this.#logger?.info({ jobId: job.id, url: job.request.url }, 'crawl started');

    try {
      await this.#crawl(job.id, job.request);
    } catch (error) {
      this.#logger?.error({ error, jobId: job.id }, 'crawl failed');
      const message = error instanceof Error ? error.message : String(error);
      await getPool().query(
        `UPDATE jobs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
        [job.id, message],
      );
      await this.#emit(job.id, job.request, 'failed', undefined, { error: message });
    }

    return true;
  }

  async #crawl(jobId: string, request: CrawlJobRequest): Promise<void> {
    const frontier = new PersistentFrontier(jobId, {
      seedUrl: request.url,
      limit: request.limit,
      maxDepth: request.maxDepth,
      includePaths: request.includePaths,
      excludePaths: request.excludePaths,
      allowSubdomains: request.allowSubdomains,
      allowExternal: request.allowExternal,
      ignoreQuery: request.ignoreQueryParameters,
    });

    const politeness = new PolitenessController({
      maxConcurrency: request.maxConcurrency ?? 8,
      fixedDelayMs: request.delay !== undefined ? request.delay * 1000 : undefined,
    });

    const robots = new RobotsCache(this.#deps.userAgent, this.#logger);

    // Resume before seeding: a restarted crawl already has a frontier, and
    // re-seeding it would duplicate work the dedup filter has forgotten.
    const resumed = await frontier.resume();
    if (resumed.restored > 0 || resumed.alreadyDone > 0) {
      this.#logger?.info(
        { jobId, restored: resumed.restored, alreadyDone: resumed.alreadyDone },
        'resumed an interrupted crawl',
      );
    }

    const freshStart = resumed.restored === 0 && resumed.alreadyDone === 0;
    if (freshStart) frontier.add(request.url, 0);

    // Dedupe keys make this safe on resume: a restarted crawl does not announce
    // itself twice.
    await this.#emit(jobId, request, 'started', undefined, {
      url: request.url,
      limit: request.limit,
      maxDepth: request.maxDepth ?? null,
    });

    // Previous visits to this site, for incremental mode.
    const seedSite = siteOf(request.url);
    const previous =
      request.incremental && seedSite ? await loadStateForSite(seedSite) : new Map();

    // Seed from the sitemap too: link-following alone misses pages nothing
    // links to, which on a documentation site is most of the deep content.
    if (freshStart && request.sitemap !== 'skip') {
      try {
        const origin = new URL(request.url).origin;
        const rules = await robots.forUrl(request.url);
        const sitemaps = new SitemapFetcher(this.#deps.userAgent, this.#logger);
        const entries = await sitemaps.discover(origin, rules.sitemaps(), request.limit);
        for (const entry of entries) frontier.add(entry.url, 1);
      } catch (error) {
        this.#logger?.debug({ error, jobId }, 'sitemap seeding failed');
      }
    }

    await frontier.flush();
    await getPool().query('UPDATE jobs SET total = $2 WHERE id = $1', [jobId, frontier.enqueued]);

    let completed = 0;
    let failed = 0;
    let unchanged = 0;
    let cancelChecked = Date.now();

    const inFlight = new Set<Promise<void>>();
    const maxParallel = request.maxConcurrency ?? 8;

    while (frontier.pending > 0 || inFlight.size > 0) {
      // Poll for cancellation rather than checking every iteration: a crawl of
      // ten thousand pages should not run ten thousand extra queries.
      if (Date.now() - cancelChecked > 2_000) {
        cancelChecked = Date.now();
        if (await this.#isCancelled(jobId)) {
          this.#logger?.info({ jobId }, 'crawl cancelled');
          await Promise.allSettled(inFlight);
          await frontier.release();
          return;
        }
      }

      if (this.#stopping) break;

      if (inFlight.size >= maxParallel) {
        await Promise.race(inFlight);
        continue;
      }

      const item = await frontier.next((site) => politeness.tryAcquire(site).allowed);
      if (!item) {
        if (inFlight.size > 0) {
          await Promise.race(inFlight);
          continue;
        }
        // Every queued host is paced out; wait for the shortest delay.
        if (frontier.pending > 0) {
          await frontier.flush();
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        break;
      }

      const task = (async () => {
        const started = Date.now();
        let statusCode: number | undefined;

        try {
          if (request.respectRobots) {
            const rules = await robots.forUrl(item.url);
            if (!rules.isAllowed(item.url)) {
              await this.#recordFailure(jobId, item.url, 'robots_denied', 'disallowed by robots.txt');
              await frontier.markFailed(item.url);
              failed++;
              return;
            }
            const delay = rules.crawlDelaySeconds();
            if (delay !== undefined) politeness.setCrawlDelay(item.site, delay);
          }

          const known = previous.get(item.url);

          // Conditional headers are the only mechanism that avoids the download
          // itself — a 304 carries no body. Everything else saves processing.
          const headers = request.incremental ? conditionalHeaders(known) : undefined;

          const result = await runPipeline(
            {
              url: item.url,
              formats: request.formats,
              tier: request.tier,
              extractor: request.extractor,
              onlyMainContent: request.onlyMainContent,
              headers,
            },
            this.#deps,
          );

          statusCode = result.success ? result.statusCode : result.statusCode;

          if (!result.success) {
            await this.#recordFailure(
              jobId,
              item.url,
              result.reason,
              result.detail,
              result.statusCode,
              result.detectedBy,
              result.tier,
              result.tiersAttempted,
            );
            await frontier.markFailed(item.url);
            failed++;
            return;
          }

          const contentUnchanged =
            request.incremental && isUnchanged(known, result.content.contentHash);

          if (request.incremental) {
            await recordVisit({
              url: item.url,
              contentHash: result.content.contentHash,
              etag: result.etag,
              lastModified: result.lastModified,
              statusCode: result.statusCode,
              unchanged: contentUnchanged,
            });
          }

          // An unchanged page still contributes its links — the page did not
          // move, but the pages it points at may have.
          if (!contentUnchanged) {
            await this.#recordDocument(jobId, item.url, result);
            completed++;
            // The markdown is not copied into the delivery row: the dispatcher
            // reads it from `documents` at send time, so a crawl with a webhook
            // stores each page once.
            await this.#emit(jobId, request, 'page', item.url, {
              url: item.url,
              metadata: {
                title: result.content.title,
                sourceUrl: item.url,
                finalUrl: result.finalUrl ?? item.url,
                statusCode: result.statusCode ?? null,
                tier: result.tier,
              },
            });
          } else {
            unchanged++;
          }

          await frontier.markCompleted(item.url);

          // Expand the frontier from what this page linked to.
          for (const link of result.content.links) {
            frontier.add(link, item.depth + 1);
          }
          await frontier.maybeFlush();
        } catch (error) {
          await this.#recordFailure(
            jobId,
            item.url,
            'http_error',
            error instanceof Error ? error.message : String(error),
          );
          await frontier.markFailed(item.url);
          failed++;
        } finally {
          politeness.release(item.site, {
            statusCode,
            latencyMs: Date.now() - started,
          });
        }
      })();

      const tracked = task.finally(() => inFlight.delete(tracked));
      inFlight.add(tracked);
    }

    await Promise.allSettled(inFlight);
    await frontier.flush();

    // A shutdown mid-crawl returns unfetched claims to the queue rather than
    // stranding them as permanently "running".
    if (this.#stopping) {
      await frontier.release();
      await getPool().query(`UPDATE jobs SET status = 'queued' WHERE id = $1`, [jobId]);
      this.#logger?.info({ jobId, completed, failed }, 'crawl paused for shutdown');
      return;
    }

    const { rowCount } = await getPool().query(
      `UPDATE jobs
          SET status = 'completed', finished_at = now(),
              completed = $2, failed = $3, total = $4, usage = $5, rejections = $6
        WHERE id = $1 AND status != 'cancelled'`,
      [
        jobId,
        completed,
        failed,
        frontier.enqueued,
        JSON.stringify({
          pagesFetched: completed,
          pagesUnchanged: unchanged,
        }),
        JSON.stringify(frontier.rejections()),
      ],
    );

    // A cancellation that landed between the last poll and the queue draining
    // leaves the row cancelled and the update unapplied. Cancellation emits
    // nothing, so neither does this.
    if ((rowCount ?? 0) === 0) {
      this.#logger?.info({ jobId, completed, failed }, 'crawl cancelled as it finished');
      return;
    }

    this.#logger?.info(
      { jobId, completed, failed, unchanged, rejections: frontier.rejections() },
      'crawl finished',
    );

    await this.#emit(jobId, request, 'completed', undefined, {
      total: frontier.enqueued,
      completed,
      failed,
      unchanged,
    });
  }

  /**
   * Queue a webhook event. A queue failure is logged, never thrown: the crawl's
   * results are already durable, and losing one notification is recoverable
   * where losing the crawl is not.
   */
  async #emit(
    jobId: string,
    request: CrawlJobRequest,
    event: WebhookEvent,
    key: string | undefined,
    data: unknown,
  ): Promise<void> {
    if (!request.webhook) return;
    try {
      await enqueueDelivery(getPool(), { config: request.webhook, event, jobId, key, data });
    } catch (error) {
      this.#logger?.warn({ error, jobId, event }, 'webhook enqueue failed');
    }
  }

  async #recordDocument(
    jobId: string,
    url: string,
    result: Extract<Awaited<ReturnType<typeof runPipeline>>, { success: true }>,
  ): Promise<void> {
    await getPool().query(
      `INSERT INTO documents
         (job_id, url, final_url, content_hash, status_code, tier, profile, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        jobId,
        url,
        result.finalUrl ?? url,
        result.content.contentHash,
        result.statusCode ?? null,
        result.tier,
        result.profileUsed ?? null,
        JSON.stringify({
          markdown: result.content.markdown,
          text: result.content.text,
          links: result.content.links,
        }),
        JSON.stringify({
          title: result.content.title,
          language: result.content.language,
          tier: result.tier,
          tiersAttempted: result.tiersAttempted,
          extractor: result.content.extractorUsed,
          timingMs: result.timingMs,
        }),
      ],
    );
  }

  async #recordFailure(
    jobId: string,
    url: string,
    reason: string,
    detail?: string,
    statusCode?: number,
    detectedBy?: string[],
    tier?: string,
    tiersTried?: string[],
  ): Promise<void> {
    await getPool().query(
      `INSERT INTO fetch_failures
         (job_id, url, reason, detail, status_code, detected_by, tier, tiers_tried, escalation_available)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        jobId,
        url,
        reason,
        detail ?? null,
        statusCode ?? null,
        detectedBy ?? null,
        tier ?? null,
        tiersTried ?? null,
        reason === 'blocked' || reason === 'challenge',
      ],
    );
  }

  /** Poll for work until stopped. */
  async start(intervalMs = 1_000): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#stopping = false;

    while (!this.#stopping) {
      try {
        const didWork = await this.runOnce();
        if (!didWork) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        this.#logger?.error({ error }, 'worker loop error');
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    this.#running = false;
  }

  stop(): void {
    this.#stopping = true;
  }
}

export { siteOf };
