import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { runPipeline, type PipelineDeps } from '../core/pipeline.js';
import { resolveProviderKeys, toClientKeys } from '../providers/resolve.js';
import { compilePathPatterns, matchesAny, type PathMatcher } from './url.js';
import { PersistentFrontier } from './persistent-frontier.js';
import { conditionalHeaders, isUnchanged, loadStateForSite, recordVisit } from './state.js';
import { PolitenessController } from './politeness.js';
import { SessionPool } from './sessions.js';
import { RobotsCache } from './robots.js';
import { SitemapFetcher } from './sitemap.js';
import { siteOf } from './url.js';
import { estimateCrawl } from './estimate.js';
import type { Log } from '../core/logger.js';
import { enqueueDelivery, type WebhookConfig, type WebhookEvent } from '../webhooks/deliveries.js';
import { createSink, type VectorSink } from '../vectors/sink.js';

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

export interface DestinationConfig {
  type: string;
  collection?: string | undefined;
  namespace?: string | undefined;
  upsertMode: 'update-in-place' | 'append';
}

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
  /** Omit unchanged pages from the result set. Implies `incremental`. */
  changesOnly?: boolean | undefined;
  /** Regex/glob patterns matched against extracted content, after the fetch. */
  includeContent?: string[] | undefined;
  excludeContent?: string[] | undefined;
  /** Cap on pages sharing a path prefix; bounds calendar and facet traps. */
  maxPagesPerPath?: number | undefined;
  /** Structured extraction applied to every page. */
  jsonOptions?: {
    schema?: Record<string, unknown> | undefined;
    prompt?: string | undefined;
    provider?: string | undefined;
    model?: string | undefined;
  } | undefined;
  ignoreQueryParameters: boolean;
  formats: string[];
  tier: 'auto' | 'plain' | 'tls' | 'lightpanda' | 'chromium' | 'camoufox';
  extractor: 'trafilatura' | 'readability' | 'auto';
  onlyMainContent: boolean;
  webhook?: WebhookConfig | undefined;
  destination?: DestinationConfig | undefined;
}

/**
 * Content filters, compiled once per job.
 *
 * Reuses `compilePathPattern` so a caller learns one pattern syntax for paths
 * and content rather than two. An include set keeps only matching pages; an
 * exclude set drops matching ones, and exclude wins where both match.
 */
function compileContentFilters(request: CrawlJobRequest): {
  include: PathMatcher[];
  exclude: PathMatcher[];
} {
  return {
    include: compilePathPatterns(request.includeContent ?? []),
    exclude: compilePathPatterns(request.excludeContent ?? []),
  };
}

/**
 * Per-page structured-extraction result.
 *
 * `blocksKept`/`blocksTotal` travel with the value because a page whose blocks
 * were clipped answered from part of itself, and nothing in the value says so.
 */
interface PageStructured {
  json: unknown;
  blocksKept: number;
  blocksTotal: number;
}

/**
 * Whether a rejection is this side stopping the call, rather than the call
 * going wrong.
 *
 * `AbortSignal.any` surfaces its reason as a DOMException named `AbortError`;
 * `fetch` in some runtimes reports the same condition as a plain Error whose
 * message says so. Both are the job being cancelled, and neither is a fault
 * worth counting or retrying — `TimeoutError` deliberately is not matched here,
 * because that is this side giving up on its own budget.
 */
function isAbort(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  const named = error as { name?: string; message?: string } | null;
  if (named?.name === 'AbortError') return true;
  return typeof named?.message === 'string' && /abort/i.test(named.message);
}

const RENDER_TIERS = new Set(['chromium', 'camoufox']);

function pages(count: number): string {
  return count === 1 ? '1 page was' : `${count} pages were`;
}

/**
 * How often a running crawl asks whether it has been cancelled.
 *
 * A poll rather than a listener: a crawl of ten thousand pages should not run
 * ten thousand extra queries, and two seconds of extra work after a cancel is
 * cheaper than that.
 */
const CANCEL_POLL_MS = 2_000;

/**
 * How long a worker's hold on a job row survives without renewal.
 *
 * Matches the task lease in `persistent-frontier.ts`: the two expire on the
 * same clock, so a dead worker's job and its tasks become reclaimable together
 * rather than leaving a window where one is free and the other is not.
 */
const JOB_LEASE_SECONDS = 300;

/** Path prefix a `maxPagesPerPath` budget is counted against. */
function pathPrefixOf(url: string): string {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split('/').filter(Boolean);
    return segments.length ? `/${segments[0]}` : '/';
  } catch {
    return '/';
  }
}

export interface WorkerDeps extends PipelineDeps {
  userAgent: string;
  /** Ceiling for adaptive per-host concurrency when a request names none. */
  maxHostConcurrency?: number | undefined;
  /** Floor the adaptive controller may not back off below. */
  minHostConcurrency?: number | undefined;
  /**
   * The operator's proxy (`HELIX_PROXY_URL`), the same one `/scrape` resolves
   * `proxy: "auto" | "stealth"` against. The session pool rotates among the
   * URLs it is given; it does not read the environment itself.
   */
  proxyUrl?: string | undefined;
  /** Live identities a crawl holds at once. */
  sessionPoolSize?: number | undefined;
  /** Blocks one identity absorbs before it is retired and replaced. */
  sessionMaxBlocks?: number | undefined;
  logger?: Log | undefined;
  /**
   * Decrypts the job owner's stored provider keys, so per-page structured
   * extraction runs against their model rather than failing for want of a key.
   */
  encryptionKey?: Buffer | undefined;
  /** Shown in the saved projection, as `/crawl/estimate` shows it. */
  defaultModel?: string | undefined;
  /** `HELIX_ALLOW_PRIVATE_URLS`, for the projection's discovery. */
  allowPrivateUrls?: boolean | undefined;
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
  async #claimJob(): Promise<
    { id: string; type?: string; request: CrawlJobRequest; api_key_id: string | null } | undefined
  > {
    const { rows } = await getPool().query<{
      id: string;
      type?: string;
      request: CrawlJobRequest;
      api_key_id: string | null;
    }>(
      `UPDATE jobs
          SET status = 'running',
              started_at = COALESCE(started_at, now()),
              lease_expires_at = now() + ($1 || ' seconds')::interval
        WHERE id = (
          SELECT id FROM jobs
           WHERE type IN ('crawl', 'batch_scrape')
             AND (
               status = 'queued'
               -- A job whose worker died holds a lease nobody is renewing.
               -- Without this it is unreachable: no worker claims a 'running'
               -- row, and resume refuses one. See 012_job_leases.sql.
               OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < now())
             )
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
        RETURNING id, type, request, api_key_id`,
      [JOB_LEASE_SECONDS],
    );
    return rows[0];
  }

  /** Extend this worker's hold on the job it is crawling. */
  async #renewJobLease(jobId: string): Promise<void> {
    await getPool().query(
      `UPDATE jobs
          SET lease_expires_at = now() + ($2 || ' seconds')::interval
        WHERE id = $1 AND status = 'running'`,
      [jobId, JOB_LEASE_SECONDS],
    );
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
      await this.#crawl(job.id, job.request, job.api_key_id, job.type);
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

  async #crawl(jobId: string, request: CrawlJobRequest, apiKeyId?: string | null, type?: string): Promise<void> {
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
      maxConcurrency: request.maxConcurrency ?? this.#deps.maxHostConcurrency ?? 8,
      minConcurrency: this.#deps.minHostConcurrency,
      fixedDelayMs: request.delay !== undefined ? request.delay * 1000 : undefined,
    });

    // One pool per job. Identities are not shared between crawls: a session
    // carries the cookie jar of the site it was used on, and handing that to a
    // crawl of a different host leaks one caller's session state into another.
    const sessions = new SessionPool({
      proxyUrls: this.#deps.proxyUrl ? [this.#deps.proxyUrl] : undefined,
      maxSessions: this.#deps.sessionPoolSize,
      maxBlocks: this.#deps.sessionMaxBlocks,
      logger: this.#logger,
    });

    const robots = new RobotsCache(this.#deps.userAgent, this.#logger);

    const sink = request.destination
      ? createSink(request.destination.type, process.env, this.#logger)
      : undefined;
    if (request.destination && !sink) {
      this.#logger?.warn(
        { jobId, type: request.destination.type },
        'destination requested but not configured on this instance',
      );
    }
    const sinkState = { ensured: false };
    let vectorFailures = 0;

    // Resume before seeding: a restarted crawl already has a frontier, and
    // re-seeding it would duplicate work the dedup filter has forgotten.
    const resumed = await frontier.resume();
    if (resumed.restored > 0 || resumed.alreadyDone > 0 || resumed.reclaimed > 0) {
      this.#logger?.info(
        {
          jobId,
          restored: resumed.restored,
          alreadyDone: resumed.alreadyDone,
          reclaimed: resumed.reclaimed,
        },
        'resumed an interrupted crawl',
      );
    }

    // The route queues the seed before any worker sees the job, so one queued
    // row and nothing else is a crawl that has not started, not a resume.
    const freshStart = resumed.alreadyDone === 0 && resumed.reclaimed === 0 && resumed.restored <= 1;
    if (freshStart) frontier.add(request.url, 0);

    // Dedupe keys make this safe on resume: a restarted crawl does not announce
    // itself twice.
    await this.#emit(jobId, request, 'started', undefined, {
      url: request.url,
      limit: request.limit,
      maxDepth: request.maxDepth ?? null,
    });

    // The projection this crawl is measured against, made before any page is
    // fetched. A resumed crawl keeps its first run's; a batch discovers nothing.
    if (freshStart && type === 'crawl') {
      try {
        const estimate = await estimateCrawl(request, {
          fetchClient: this.#deps.fetchClient,
          extractClient: this.#deps.extractClient,
          userAgent: this.#deps.userAgent,
          allowPrivateUrls: this.#deps.allowPrivateUrls,
          defaultModel: this.#deps.defaultModel ?? 'unset',
        });
        await getPool().query('UPDATE jobs SET estimate = $2 WHERE id = $1', [jobId, JSON.stringify(estimate)]);
      } catch (error) {
        this.#logger?.debug({ error, jobId }, 'crawl projection failed; the job keeps no estimate');
      }
    }

    // Previous visits to this site, for incremental mode.
    const seedSite = siteOf(request.url);
    const previous =
      request.incremental && seedSite ? await loadStateForSite(seedSite) : new Map();

    // Seed from the sitemap too: link-following alone misses pages nothing
    // links to, which on a documentation site is most of the deep content.
    //
    // Entries arrive at depth 1, so a crawl capped at the seed page rejects
    // every one of them. Discovering a sitemap it cannot use costs the fetch
    // and the whole walk of a sitemap index for nothing.
    if (freshStart && request.sitemap !== 'skip' && request.maxDepth !== 0) {
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

    // The lease taken at claim time has been running through resume, sitemap
    // discovery and the incremental state load, and the crawl loop only renews
    // it on its first poll. A slow preamble is long enough for another worker
    // to reclaim a job that is plainly still being worked on.
    await this.#renewJobLease(jobId);

    await frontier.flush();
    await getPool().query('UPDATE jobs SET total = $2 WHERE id = $1', [jobId, frontier.enqueued]);

    let completed = 0;
    let failed = 0;
    let unchanged = 0;
    /** Pages dropped by a content filter, reported rather than silently missing. */
    let filtered = 0;
    /** Pages dropped for exceeding their path's budget. */
    let pathCapped = 0;
    /** Results discarded because this worker no longer held the task row. */
    let notOwned = 0;
    /** Recorded pages by the tier that served them. */
    const tierBreakdown: Record<string, number> = {};
    /** Wall time of pages a render tier served, cheaper tiers tried first included. */
    let browserMs = 0;
    let jsonExtracted = 0;
    let jsonFailed = 0;
    let cancelChecked = Date.now();

    /**
     * Aborted when the job is cancelled or the worker is shutting down.
     *
     * The frontier stops handing out pages the moment cancellation is seen, but
     * a page already inside `extractClient.structured()` keeps running — and
     * that call is billed to the caller's own provider. Without a signal
     * reaching it, cancelling a crawl stops the fetching and pays for the
     * thinking anyway.
     */
    const jobAbort = new AbortController();

    // Resolved once per job: every page of a crawl runs against the same
    // owner's keys, and re-decrypting them per page would be the crawl's
    // slowest step on a site of any size.
    const providerAuth =
      request.jsonOptions && apiKeyId && this.#deps.encryptionKey
        ? toClientKeys(await resolveProviderKeys(apiKeyId, this.#deps.encryptionKey))
        : undefined;

    const contentFilters = compileContentFilters(request);
    const hasContentFilters = contentFilters.include.length > 0 || contentFilters.exclude.length > 0;
    /** Pages kept per path prefix, against `maxPagesPerPath`. */
    const perPathKept = new Map<string, number>();

    const inFlight = new Set<Promise<void>>();
    const maxParallel = request.maxConcurrency ?? 8;

    /**
     * Wait for the next page to finish, or for the cancellation poll to be due,
     * whichever comes first.
     *
     * A bare `Promise.race(inFlight)` blocks until a page completes, so a crawl
     * whose last outstanding page takes two minutes cannot notice it was
     * cancelled for two minutes — the signal exists but nothing reaches the
     * check that fires it. Racing a timer bounds that to the poll interval.
     */
    const raceInFlight = async (): Promise<void> => {
      const dueIn = Math.max(0, CANCEL_POLL_MS - (Date.now() - cancelChecked));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const due = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, dueIn);
      });
      try {
        await Promise.race([...inFlight, due]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    while (frontier.pending > 0 || inFlight.size > 0) {
      // Poll for cancellation rather than checking every iteration: a crawl of
      // ten thousand pages should not run ten thousand extra queries.
      if (Date.now() - cancelChecked > CANCEL_POLL_MS) {
        cancelChecked = Date.now();

        // Leases have to be pushed forward while pages are still being fetched,
        // or a crawl of slow pages reclaims its own live work out from under
        // itself. The frontier decides whether a renewal is actually due.
        await frontier.renewLeases();
        // On the same clock as the task leases: a job renewed less often than
        // its tasks would be stolen out from under a worker that is plainly
        // still working.
        await this.#renewJobLease(jobId);

        if (await this.#isCancelled(jobId)) {
          this.#logger?.info({ jobId }, 'crawl cancelled');
          // Before awaiting them: settling first would wait for the very model
          // calls the cancellation is meant to stop.
          jobAbort.abort();
          await Promise.allSettled(inFlight);
          await frontier.release();
          return;
        }
      }

      if (this.#stopping) {
        jobAbort.abort();
        break;
      }

      if (inFlight.size >= maxParallel) {
        await raceInFlight();
        continue;
      }

      const item = await frontier.next((site) => politeness.tryAcquire(site).allowed);
      if (!item) {
        if (inFlight.size > 0) {
          await raceInFlight();
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
        let blocked = false;
        let retryAfterSeconds: number | undefined;

        // One identity for this whole request, pinned before the fetch. The
        // profile and the proxy travel together because splitting them is
        // exactly the incoherence the Rust profile validator exists to refuse.
        const session = sessions.acquire();

        try {
          if (request.respectRobots) {
            const rules = await robots.forUrl(item.url);
            if (!rules.isAllowed(item.url)) {
              await this.#recordFailure(jobId, item.url, 'robots_denied', 'disallowed by robots.txt');
              if (!(await frontier.markFailed(item.url))) notOwned++;
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

          const cookie = sessions.cookieHeader(session);
          const result = await runPipeline(
            {
              url: item.url,
              formats: request.formats,
              tier: request.tier,
              extractor: request.extractor,
              onlyMainContent: request.onlyMainContent,
              ...(headers || cookie
                ? { headers: { ...(headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) } }
                : {}),
              ...(session.profileId ? { profile: session.profileId } : {}),
              ...(session.proxyUrl ? { proxy: session.proxyUrl } : {}),
              // The fetch stops too, not only the model call: a cancelled crawl
              // that keeps loading pages in a browser tier is still spending.
              signal: jobAbort.signal,
            },
            this.#deps,
          );

          statusCode = result.success ? result.statusCode : result.statusCode;

          if (!result.success) {
            // A page the job itself stopped is not a page that failed. Writing
            // it to `fetch_failures` would leave a cancelled crawl reporting
            // hundreds of broken URLs it never actually tried to read.
            //
            // The row is left leased rather than marked either way: the
            // cancellation path calls `frontier.release()` immediately after
            // this, which returns every still-leased row to `queued`, so a
            // resumed job retries the page instead of skipping it as done or
            // spending an attempt on it.
            //
            // Only when the abort came from this job stopping, though. An
            // `aborted` from anywhere else still has to reach the frontier, or
            // the URL stays leased and `pending` never drains — the loop then
            // spins until the lease expires.
            if (result.reason === 'aborted' && jobAbort.signal.aborted) return;
            if (result.reason === 'aborted') {
              if (!(await frontier.markFailed(item.url))) notOwned++;
              failed++;
              return;
            }

            // The classifier's verdict, not the status code: a challenge page
            // arrives as 200 and would otherwise be scored as a healthy fetch by
            // both the concurrency controller and the session pool.
            blocked = result.reason === 'blocked' || result.reason === 'challenge';
            retryAfterSeconds = result.retryAfterSeconds;

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
            if (!(await frontier.markFailed(item.url))) notOwned++;
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

          // Content filters run after extraction, because that is the first
          // point the page's text exists. A dropped page still contributes its
          // links, for the same reason an unchanged one does.
          let dropped: 'filter' | 'path-cap' | undefined;
          if (hasContentFilters && !contentUnchanged) {
            const text = result.content.markdown ?? '';
            const included =
              contentFilters.include.length === 0 || matchesAny(text, contentFilters.include);
            const excluded = matchesAny(text, contentFilters.exclude);
            if (!included || excluded) dropped = 'filter';
          }

          // A budget per path prefix bounds calendar and facet traps, where one
          // path would otherwise consume the whole crawl limit.
          if (!dropped && !contentUnchanged && request.maxPagesPerPath !== undefined) {
            const prefix = pathPrefixOf(item.url);
            const kept = perPathKept.get(prefix) ?? 0;
            if (kept >= request.maxPagesPerPath) dropped = 'path-cap';
            else perPathKept.set(prefix, kept + 1);
          }

          if (dropped) {
            if (dropped === 'filter') filtered++;
            else pathCapped++;
          }

          // Claimed before anything is stored. A lease that expired mid-fetch
          // has been reclaimed, and the worker holding it now will store this
          // page itself — writing it here too is a duplicate `documents` row
          // and a page counted twice.
          const held = await frontier.markCompleted(item.url);
          if (!held) notOwned++;

          // An unchanged page still contributes its links — the page did not
          // move, but the pages it points at may have.
          if (held && !contentUnchanged && !dropped) {
            // Structured extraction, applied to every kept page. A model
            // failure costs the page its `json` field, never the crawl: the
            // page was read, and dropping 4,000 markdown documents because one
            // provider call timed out is a worse answer than a null field.
            let structured: PageStructured | undefined;
            if (request.jsonOptions) {
              try {
                const out = await this.#deps.extractClient.structured({
                  content: result.content.markdown,
                  schema: request.jsonOptions.schema,
                  prompt: request.jsonOptions.prompt,
                  provider: request.jsonOptions.provider,
                  model: request.jsonOptions.model,
                  ...(providerAuth ?? {}),
                  signal: jobAbort.signal,
                });
                structured = {
                  json: out.data,
                  // Reported per page, because a page whose blocks were clipped
                  // produced an answer from part of itself and the caller
                  // cannot see that from the value alone.
                  blocksKept: out.blocksKept,
                  blocksTotal: out.blocksTotal,
                };
                jsonExtracted++;
              } catch (error) {
                // A cancelled job is not a failed extraction. Counting it in
                // `jsonFailed` would report the crawl as having tried and lost
                // pages it deliberately stopped, and a retry layer reading that
                // count would re-fire the call the cancellation just killed.
                if (isAbort(error)) {
                  this.#logger?.info({ jobId, url: item.url }, 'structured extraction aborted with the job');
                } else {
                  jsonFailed++;
                  this.#logger?.warn(
                    { jobId, url: item.url, error: error instanceof Error ? error.message : String(error) },
                    'structured extraction failed for a crawled page',
                  );
                }
              }
            }

            await this.#recordDocument(jobId, item.url, result, structured);
            completed++;
            tierBreakdown[result.tier] = (tierBreakdown[result.tier] ?? 0) + 1;
            if (RENDER_TIERS.has(result.tier)) browserMs += result.timingMs;

            if (sink && request.destination) {
              const failure = await this.#storeToDestination(
                sink,
                sinkState,
                request.destination,
                item.url,
                result.content.markdown,
              );
              if (failure) {
                vectorFailures++;
                await this.#recordFailure(jobId, item.url, 'vector_store', failure);
              }
            }

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
                favicon: result.content.favicon,
              },
            });
          } else if (held && contentUnchanged) {
            // Counted only for the unchanged case: a page dropped by a filter
            // or a path budget was read and is not evidence the site is static.
            unchanged++;
          }

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
          if (!(await frontier.markFailed(item.url))) notOwned++;
          failed++;
        } finally {
          politeness.release(item.site, {
            statusCode,
            latencyMs: Date.now() - started,
            blocked,
            retryAfterSeconds,
          });

          // The same evidence, read for a different question. Politeness asks
          // "how fast may I go"; the pool asks "is this identity still usable".
          // A host that blocks one identity and accepts another is answering
          // only the second question, so both have to be asked separately.
          const { retired } = sessions.release(session, { blocked, statusCode });
          if (retired) {
            this.#logger?.debug(
              { jobId, session: session.id, url: item.url },
              'identity retired after a block; the next request uses a fresh one',
            );
          }
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

    // Every path that ends a page moves its task row to a terminal status, so a
    // row still queued or running here is a page the job would silently omit.
    const { rows: leftover } = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM job_tasks
        WHERE job_id = $1 AND status IN ('queued', 'running')`,
      [jobId],
    );
    const unresolved = Number(leftover[0]?.n ?? 0);
    const warnings: string[] = [];
    if (unresolved > 0) {
      warnings.push(`${pages(unresolved)} queued but never recorded as fetched or failed.`);
    }
    if (notOwned > 0) {
      warnings.push(`${pages(notOwned)} fetched and discarded because the task was no longer held by this worker.`);
    }
    const lost = completed === 0 && unresolved > 0;

    const { rowCount } = await getPool().query(
      `UPDATE jobs
          SET status = $7, finished_at = now(), warnings = $8, error = $9,
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
          tierBreakdown,
          browserSeconds: Math.round(browserMs / 100) / 10,
          // Named even at zero when the caller asked for the filter, so an
          // empty result is distinguishable from a filter that matched nothing.
          ...(hasContentFilters ? { pagesFiltered: filtered } : {}),
          ...(request.maxPagesPerPath !== undefined ? { pagesOverPathCap: pathCapped } : {}),
          ...(request.jsonOptions ? { jsonExtracted, jsonFailed } : {}),
          ...(request.destination ? { vectorFailures } : {}),
        }),
        JSON.stringify(frontier.rejections()),
        lost ? 'failed' : 'completed',
        JSON.stringify(warnings),
        lost ? warnings.join(' ') : null,
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
      {
        jobId,
        completed,
        failed,
        unchanged,
        vectorFailures,
        sessions: sessions.stats(),
        hosts: politeness.stats(),
        rejections: frontier.rejections(),
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      'crawl finished',
    );

    if (lost) {
      await this.#emit(jobId, request, 'failed', undefined, { error: warnings.join(' ') });
      return;
    }

    await this.#emit(jobId, request, 'completed', undefined, {
      total: frontier.enqueued,
      completed,
      failed,
      unchanged,
    });
  }

  /**
   * Chunk, embed and upsert one page into the configured destination.
   *
   * A failure here is recorded and swallowed rather than thrown: the page
   * itself is already stored, and a vector-store outage should not cost the
   * crawl the page it already fetched.
   */
  async #storeToDestination(
    sink: VectorSink,
    sinkState: { ensured: boolean },
    destination: DestinationConfig,
    url: string,
    markdown: string,
  ): Promise<string | undefined> {
    const collection = destination.collection ?? destination.namespace ?? 'default';

    try {
      const chunked = await this.#deps.extractClient.chunk({ text: markdown, url, embed: true });
      if (chunked.chunks.length === 0) return undefined;

      if (!sinkState.ensured) {
        const dimensions = chunked.embeddingDimensions ?? chunked.chunks[0]?.embedding?.length ?? 0;
        await sink.ensureCollection(collection, dimensions);
        sinkState.ensured = true;
      }

      await sink.store({
        url,
        collection,
        chunks: chunked.chunks.map((chunk) => ({
          text: chunk.text,
          anchor: destination.upsertMode === 'append' ? `${chunk.anchor}:${randomUUID()}` : chunk.anchor,
          tokens: chunk.tokens,
          embedding: chunk.embedding ?? [],
          headingPath: chunk.headingPath,
        })),
      });
      return undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#logger?.warn({ error, url }, 'destination store failed');
      return message;
    }
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
    structured?: PageStructured | undefined,
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
          ...(structured ? { json: structured.json } : {}),
        }),
        JSON.stringify({
          title: result.content.title,
          language: result.content.language,
          tier: result.tier,
          tiersAttempted: result.tiersAttempted,
          escalations: result.escalations,
          extractor: result.content.extractorUsed,
          timingMs: result.timingMs,
          favicon: result.content.favicon,
          // A page whose blocks were clipped answered from part of itself.
          // Reported per page so a caller reading one row can see it, rather
          // than only in a job-level total that averages the fact away.
          ...(structured
            ? { blocksKept: structured.blocksKept, blocksTotal: structured.blocksTotal }
            : {}),
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
