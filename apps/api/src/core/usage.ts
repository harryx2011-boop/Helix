import { getPool } from '../db/pool.js';

/**
 * Per-key request usage (011_request_usage.sql).
 *
 * Recorded here rather than derived from `jobs`, which only crawl and
 * batch_scrape ever write: a usage figure built from that table would silently
 * omit scrape, parse, search, map, metadata and interact, and a chart that is
 * wrong in a way nobody can see is worse than one that says it has no data.
 *
 * Writes are aggregated into hourly buckets and flushed on a timer. The
 * alternative, one INSERT per request on the response path, puts a database
 * round-trip in front of every reply for a number read at hourly resolution.
 */

/** 2xx | 4xx | 429 | 5xx. 429 is split out of 4xx because being throttled is not the same problem as sending a bad request. */
export function statusClass(statusCode: number): string {
  if (statusCode === 429) return '429';
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  return '2xx';
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;

/**
 * The route family a path belongs to, not the path.
 *
 * Two requests for different job ids are the same product; storing them apart
 * makes the table grow with traffic instead of with the API surface, and makes
 * the per-endpoint breakdown a list of uuids. Any segment that looks like an
 * identifier collapses to :id, so an endpoint added later groups correctly
 * without touching this.
 */
export function normaliseEndpoint(url: string): string {
  const path = url.split('?')[0] ?? '';
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'v1') segments.shift();
  if (segments.length === 0) return '/';

  const family = segments
    .slice(0, 2)
    .map((segment) => (UUID_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment) ? ':id' : segment));

  return `/${family.join('/')}`;
}

/** Truncate to the hour in UTC. The primary key is the upsert conflict target, so writer and schema must agree exactly. */
export function hourBucket(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours()));
}

interface PendingKey {
  apiKeyId: string;
  bucketStart: Date;
  endpoint: string;
  statusClass: string;
}

function pendingKeyOf(k: PendingKey): string {
  return `${k.apiKeyId} ${k.bucketStart.toISOString()} ${k.endpoint} ${k.statusClass}`;
}

export interface UsageRecorderOptions {
  /** How often buffered counts are written. */
  flushIntervalMs?: number;
  /**
   * Flush early once this many distinct buckets are pending. Bounds memory when
   * a burst spans many keys or endpoints; without it a stalled flush grows the
   * map without limit.
   */
  maxPending?: number;
  onError?: (error: unknown) => void;
}

/**
 * Buffers counts in memory and flushes them as one multi-row UPSERT.
 *
 * Buffered counts are lost if the process dies before a flush. That is the
 * deliberate trade: usage is a reporting figure, not a billing ledger, and
 * paying a synchronous write per request to avoid losing at most one interval
 * of counts is the wrong side of it. Anything that ever bills must not read
 * this table.
 */
export class UsageRecorder {
  readonly #pending = new Map<string, { key: PendingKey; count: number }>();
  readonly #flushIntervalMs: number;
  readonly #maxPending: number;
  readonly #onError: ((error: unknown) => void) | undefined;
  #timer: NodeJS.Timeout | undefined;
  #flushing = false;

  constructor(options: UsageRecorderOptions = {}) {
    this.#flushIntervalMs = options.flushIntervalMs ?? 10_000;
    this.#maxPending = options.maxPending ?? 2_000;
    this.#onError = options.onError;
  }

  record(apiKeyId: string, url: string, statusCode: number, at: Date = new Date()): void {
    const key: PendingKey = {
      apiKeyId,
      bucketStart: hourBucket(at),
      endpoint: normaliseEndpoint(url),
      statusClass: statusClass(statusCode),
    };
    const id = pendingKeyOf(key);
    const existing = this.#pending.get(id);
    if (existing) existing.count += 1;
    else this.#pending.set(id, { key, count: 1 });

    if (this.#pending.size >= this.#maxPending) void this.flush();
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.flush(), this.#flushIntervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  get pendingSize(): number {
    return this.#pending.size;
  }

  /**
   * Writes and clears the buffer.
   *
   * The buffer is drained BEFORE the query rather than after it succeeds: a
   * failing write that put its counts back would replay them against the next
   * flush too, and a persistently failing table would grow the map until the
   * process died of it. Losing an interval of counts is recoverable; turning a
   * reporting outage into an OOM is not.
   */
  async flush(): Promise<void> {
    if (this.#flushing || this.#pending.size === 0) return;
    this.#flushing = true;

    const batch = [...this.#pending.values()];
    this.#pending.clear();

    try {
      const values: string[] = [];
      const params: unknown[] = [];
      for (const { key, count } of batch) {
        const base = params.length;
        values.push(
          `($${base + 1}::uuid, $${base + 2}::timestamptz, $${base + 3}, $${base + 4}, $${base + 5}::bigint)`,
        );
        params.push(key.apiKeyId, key.bucketStart.toISOString(), key.endpoint, key.statusClass, count);
      }

      await getPool().query(
        `INSERT INTO request_usage (api_key_id, bucket_start, endpoint, status_class, requests)
         VALUES ${values.join(', ')}
         ON CONFLICT (api_key_id, bucket_start, endpoint, status_class)
         DO UPDATE SET requests = request_usage.requests + EXCLUDED.requests`,
        params,
      );
    } catch (error) {
      // Never surfaced to a caller: usage recording failing must not fail, slow
      // or error a request that already succeeded.
      this.#onError?.(error);
    } finally {
      this.#flushing = false;
    }
  }
}

export interface UsagePoint {
  bucketStart: string;
  requests: number;
}

export interface UsageByEndpoint {
  endpoint: string;
  requests: number;
}

export interface UsageSummary {
  since: string;
  until: string;
  total: number;
  /** Requests the limiter rejected in the window. */
  rateLimited: number;
  errors: number;
  series: UsagePoint[];
  byEndpoint: UsageByEndpoint[];
}

/**
 * Usage for a set of keys over a window.
 *
 * Every aggregate is computed by the database over the (api_key_id,
 * bucket_start) index rather than by pulling rows back and summing in JS: a
 * month of hourly buckets across a busy key is thousands of rows, and three
 * passes over them in Node is three unbounded result sets for four numbers.
 */
export async function summariseUsage(apiKeyIds: string[], since: Date, until: Date): Promise<UsageSummary> {
  if (apiKeyIds.length === 0) {
    return {
      since: since.toISOString(),
      until: until.toISOString(),
      total: 0,
      rateLimited: 0,
      errors: 0,
      series: [],
      byEndpoint: [],
    };
  }

  const pool = getPool();
  const params = [apiKeyIds, since.toISOString(), until.toISOString()];

  const [totals, series, byEndpoint] = await Promise.all([
    pool.query<{ total: string; rate_limited: string; errors: string }>(
      `SELECT COALESCE(SUM(requests), 0) AS total,
              COALESCE(SUM(requests) FILTER (WHERE status_class = '429'), 0) AS rate_limited,
              COALESCE(SUM(requests) FILTER (WHERE status_class IN ('4xx','5xx')), 0) AS errors
         FROM request_usage
        WHERE api_key_id = ANY($1::uuid[]) AND bucket_start >= $2 AND bucket_start < $3`,
      params,
    ),
    pool.query<{ bucket_start: Date; requests: string }>(
      `SELECT bucket_start, SUM(requests) AS requests
         FROM request_usage
        WHERE api_key_id = ANY($1::uuid[]) AND bucket_start >= $2 AND bucket_start < $3
        GROUP BY bucket_start
        ORDER BY bucket_start`,
      params,
    ),
    // Bounded: an instance cannot have more endpoint families than it has
    // routes, but the limit is stated rather than assumed so a malformed row
    // cannot turn this into an unbounded response.
    pool.query<{ endpoint: string; requests: string }>(
      `SELECT endpoint, SUM(requests) AS requests
         FROM request_usage
        WHERE api_key_id = ANY($1::uuid[]) AND bucket_start >= $2 AND bucket_start < $3
        GROUP BY endpoint
        ORDER BY SUM(requests) DESC
        LIMIT 50`,
      params,
    ),
  ]);

  const t = totals.rows[0];

  return {
    since: since.toISOString(),
    until: until.toISOString(),
    total: Number(t?.total ?? 0),
    rateLimited: Number(t?.rate_limited ?? 0),
    errors: Number(t?.errors ?? 0),
    series: series.rows.map((r) => ({
      bucketStart: (r.bucket_start instanceof Date ? r.bucket_start : new Date(r.bucket_start)).toISOString(),
      requests: Number(r.requests),
    })),
    byEndpoint: byEndpoint.rows.map((r) => ({ endpoint: r.endpoint, requests: Number(r.requests) })),
  };
}

/** Drop buckets older than the retention window. Called from the same sweep that expires jobs. */
export async function pruneUsage(olderThan: Date): Promise<number> {
  const { rowCount } = await getPool().query('DELETE FROM request_usage WHERE bucket_start < $1', [
    olderThan.toISOString(),
  ]);
  return rowCount ?? 0;
}
