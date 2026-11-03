import { getPool } from '../db/pool.js';


export function statusClass(statusCode: number): string {
  if (statusCode === 429) return '429';
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  return '2xx';
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;

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
  flushIntervalMs?: number;
  maxPending?: number;
  onError?: (error: unknown) => void;
}

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
  rateLimited: number;
  errors: number;
  series: UsagePoint[];
  byEndpoint: UsageByEndpoint[];
}

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

export async function pruneUsage(olderThan: Date): Promise<number> {
  const { rowCount } = await getPool().query('DELETE FROM request_usage WHERE bucket_start < $1', [
    olderThan.toISOString(),
  ]);
  return rowCount ?? 0;
}
