import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';

const DEFAULT_DAYS = 90;
const MAX_DAYS = 90;
const CACHE_MS = 60_000;

export interface DayBucket {
  day: string;
  okPct: number | null;
  p50Ms: number | null;
  samples: number;
}

export interface ServiceHistory {
  service: string;
  days: DayBucket[];
}

interface SampleRow {
  service: string;
  day: string;
  ok_count: string;
  total_count: string;
  p50_ms: string | null;
}

function clampDays(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : DEFAULT_DAYS;
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, n));
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Buckets raw `(service, day)` rows into one entry per calendar day over the
 * requested range, ascending, even for days with no samples at all — a bar
 * chart with a gap in the middle needs to know the gap exists, not just skip it.
 */
export function bucketHistory(rows: SampleRow[], days: number, now: Date = new Date()): ServiceHistory[] {
  const byService = new Map<string, Map<string, SampleRow>>();
  const services = new Set<string>();

  for (const row of rows) {
    services.add(row.service);
    let byDay = byService.get(row.service);
    if (!byDay) {
      byDay = new Map();
      byService.set(row.service, byDay);
    }
    byDay.set(row.day, row);
  }

  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dayKeys.push(dayKey(d));
  }

  return Array.from(services)
    .sort()
    .map((service) => {
      const byDay = byService.get(service) ?? new Map<string, SampleRow>();
      const dayBuckets: DayBucket[] = dayKeys.map((day) => {
        const row = byDay.get(day);
        if (!row) return { day, okPct: null, p50Ms: null, samples: 0 };
        const total = Number.parseInt(row.total_count, 10);
        const ok = Number.parseInt(row.ok_count, 10);
        return {
          day,
          okPct: total > 0 ? (ok / total) * 100 : null,
          p50Ms: row.p50_ms !== null ? Math.round(Number.parseFloat(row.p50_ms)) : null,
          samples: total,
        };
      });
      return { service, days: dayBuckets };
    });
}

interface CacheEntry {
  expiresAt: number;
  body: { services: ServiceHistory[] };
}

let cache: Map<number, CacheEntry> | undefined;

/** `GET /status/history` — per-service daily uptime and p50 latency for the public status page. */
export async function registerStatus(app: FastifyInstance): Promise<void> {
  cache = new Map();

  app.get<{ Querystring: { days?: string } }>('/status/history', async (request, reply) => {
    const days = clampDays(request.query.days);
    const now = Date.now();

    const cached = cache!.get(days);
    if (cached && cached.expiresAt > now) {
      return reply.send(cached.body);
    }

    const result = await getPool().query<SampleRow>(
      `SELECT
         service,
         to_char(sampled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
         count(*) FILTER (WHERE ok) AS ok_count,
         count(*) AS total_count,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p50_ms
       FROM uptime_samples
       WHERE sampled_at >= now() - ($1 || ' days')::interval
       GROUP BY service, day
       ORDER BY day ASC`,
      [days],
    );

    const body = { services: bucketHistory(result.rows, days) };
    cache!.set(days, { expiresAt: now + CACHE_MS, body });
    return reply.send(body);
  });
}
