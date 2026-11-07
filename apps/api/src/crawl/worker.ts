import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { runPipeline, type PipelineDeps } from '../core/pipeline.js';
import type { RequestTier } from '../core/escalation.js';
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
import { collectionName, createSink, type VectorSink } from '../vectors/sink.js';
import { tierMemory } from '../core/tier-memory.js';
import { liveCookies } from '../core/cookie-jar.js';


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
  changesOnly?: boolean | undefined;
  includeContent?: string[] | undefined;
  excludeContent?: string[] | undefined;
  maxPagesPerPath?: number | undefined;
  jsonOptions?: {
    schema?: Record<string, unknown> | undefined;
    prompt?: string | undefined;
    provider?: string | undefined;
    model?: string | undefined;
  } | undefined;
  ignoreQueryParameters: boolean;
  formats: string[];
  /** Old names (`chromium`, `lightpanda`, `camoufox`) run as `browser`. */
  tier: RequestTier;
  extractor: 'trafilatura' | 'readability' | 'auto';
  onlyMainContent: boolean;
  webhook?: WebhookConfig | undefined;
  destination?: DestinationConfig | undefined;
}

function compileContentFilters(request: CrawlJobRequest): {
  include: PathMatcher[];
  exclude: PathMatcher[];
} {
  return {
    include: compilePathPatterns(request.includeContent ?? []),
    exclude: compilePathPatterns(request.excludeContent ?? []),
  };
}

interface PageStructured {
  json: unknown;
  blocksKept: number;
  blocksTotal: number;
}

function isAbort(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  const named = error as { name?: string; message?: string } | null;
  if (named?.name === 'AbortError') return true;
  return typeof named?.message === 'string' && /abort/i.test(named.message);
}

const RENDER_TIERS = new Set(['browser']);

function pages(count: number): string {
  return count === 1 ? '1 page was' : `${count} pages were`;
}

const CANCEL_POLL_MS = 2_000;

const JOB_LEASE_SECONDS = 300;

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
  maxHostConcurrency?: number | undefined;
  minHostConcurrency?: number | undefined;
  proxyUrl?: string | undefined;
  sessionPoolSize?: number | undefined;
  sessionMaxBlocks?: number | undefined;
  logger?: Log | undefined;
  encryptionKey?: Buffer | undefined;
  defaultModel?: string | undefined;
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

    const freshStart = resumed.alreadyDone === 0 && resumed.reclaimed === 0 && resumed.restored <= 1;
    if (freshStart) frontier.add(request.url, 0);

    await this.#emit(jobId, request, 'started', undefined, {
      url: request.url,
      limit: request.limit,
      maxDepth: request.maxDepth ?? null,
    });

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

    const seedSite = siteOf(request.url);
    const previous =
      request.incremental && seedSite ? await loadStateForSite(seedSite) : new Map();

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

    await this.#renewJobLease(jobId);

    await frontier.flush();
    await getPool().query('UPDATE jobs SET total = $2 WHERE id = $1', [jobId, frontier.enqueued]);

    let completed = 0;
    let failed = 0;
    let unchanged = 0;
    let filtered = 0;
    let pathCapped = 0;
    let notOwned = 0;
    let linksNotFollowed = 0;
    const tierBreakdown: Record<string, number> = {};
    let browserMs = 0;
    let jsonExtracted = 0;
    let jsonFailed = 0;
    let cancelChecked = Date.now();

    const jobAbort = new AbortController();

    const providerAuth =
      request.jsonOptions && apiKeyId && this.#deps.encryptionKey
        ? toClientKeys(await resolveProviderKeys(apiKeyId, this.#deps.encryptionKey))
        : undefined;

    const contentFilters = compileContentFilters(request);
    const hasContentFilters = contentFilters.include.length > 0 || contentFilters.exclude.length > 0;
    const perPathKept = new Map<string, number>();

    const inFlight = new Set<Promise<void>>();
    const maxParallel = request.maxConcurrency ?? 8;

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
      if (Date.now() - cancelChecked > CANCEL_POLL_MS) {
        cancelChecked = Date.now();

        await frontier.renewLeases();
        await this.#renewJobLease(jobId);

        if (await this.#isCancelled(jobId)) {
          this.#logger?.info({ jobId }, 'crawl cancelled');
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
        let setCookies: string[] | undefined;
        let retryAfterSeconds: number | undefined;

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
              signal: jobAbort.signal,
            },
            { ...this.#deps, tierMemory },
          );

          statusCode = result.success ? result.statusCode : result.statusCode;
          if (result.success) setCookies = result.setCookies;

          if (!result.success) {
            if (result.reason === 'aborted' && jobAbort.signal.aborted) return;
            if (result.reason === 'aborted') {
              if (!(await frontier.markFailed(item.url))) notOwned++;
              failed++;
              return;
            }

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
            result.notModified === true ||
            (request.incremental && isUnchanged(known, result.content.contentHash));

          if (request.incremental) {
            await recordVisit({
              url: item.url,
              contentHash: result.notModified
                ? (known?.contentHash ?? result.content.contentHash)
                : result.content.contentHash,
              etag: result.notModified ? (result.etag ?? known?.etag ?? undefined) : result.etag,
              lastModified: result.notModified
                ? (result.lastModified ?? known?.lastModified?.toUTCString())
                : result.lastModified,
              statusCode: result.statusCode,
              unchanged: contentUnchanged,
            });
          }

          let dropped: 'filter' | 'path-cap' | undefined;
          if (hasContentFilters && !contentUnchanged) {
            const text = result.content.markdown ?? '';
            const included =
              contentFilters.include.length === 0 || matchesAny(text, contentFilters.include);
            const excluded = matchesAny(text, contentFilters.exclude);
            if (!included || excluded) dropped = 'filter';
          }

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

          const held = await frontier.markCompleted(item.url);
          if (!held) notOwned++;

          if (held && !contentUnchanged && !dropped) {
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
                  blocksKept: out.blocksKept,
                  blocksTotal: out.blocksTotal,
                };
                jsonExtracted++;
              } catch (error) {
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
            unchanged++;
          }

          const belowDepthLimit = request.maxDepth === undefined || item.depth < request.maxDepth;
          if (held && result.notModified && belowDepthLimit) linksNotFollowed++;

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

          const { retired } = sessions.release(session, { blocked, statusCode, cookies: liveCookies(setCookies) });
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

    if (this.#stopping) {
      await frontier.release();
      await getPool().query(`UPDATE jobs SET status = 'queued' WHERE id = $1`, [jobId]);
      this.#logger?.info({ jobId, completed, failed }, 'crawl paused for shutdown');
      return;
    }

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
    if (linksNotFollowed > 0) {
      warnings.push(
        `${pages(linksNotFollowed)} answered with 304 (not modified) and no body. A 304 page has no links to follow, so pages reachable only through one were not crawled.`,
      );
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
          ...(linksNotFollowed > 0 ? { pagesLinksNotFollowed: linksNotFollowed } : {}),
          tierBreakdown,
          browserSeconds: Math.round(browserMs / 100) / 10,
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

  async #storeToDestination(
    sink: VectorSink,
    sinkState: { ensured: boolean },
    destination: DestinationConfig,
    url: string,
    markdown: string,
  ): Promise<string | undefined> {
    const collection = collectionName(destination);

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
        model: chunked.embeddingModel,
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
