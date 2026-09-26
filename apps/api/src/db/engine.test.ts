import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, createPool, getPool } from './pool.js';
import { migrate, type MigrationResult } from './migrate.js';
import { PgMonitorStore } from '../monitor/store.js';

/**
 * The shipped migrations and queue SQL on the real engine, through the same
 * `createPool` the API boots with. No server, no Postgres: PGlite in memory.
 */

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

let result: MigrationResult;

beforeAll(async () => {
  createPool({ driver: 'pglite' });
  result = await migrate(MIGRATIONS);
}, 120_000);

afterAll(async () => {
  await closePool();
});

describe('migrate on pglite', () => {
  it('applies every migration file unchanged', async () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    expect(files.length).toBeGreaterThanOrEqual(12);
    expect(result.applied).toEqual(files);

    const { rows } = await getPool().query<{ n: string }>('SELECT count(*) AS n FROM schema_migrations', []);
    expect(Number(rows[0]!.n)).toBe(files.length);
  });

  it('creates chunks, which only happens when pgvector loaded', async () => {
    const { rows } = await getPool().query<{ t: string | null }>("SELECT to_regclass('chunks')::text AS t", []);
    expect(rows[0]!.t).toBe('chunks');
  });

  it('is a no-op the second time', async () => {
    const again = await migrate(MIGRATIONS);
    expect(again.applied).toEqual([]);
    expect(again.skipped).toEqual(result.applied);
  });
});

describe('queue claims on pglite', () => {
  // Verbatim from CrawlWorker.#claimJob.
  const CLAIM_JOB = `UPDATE jobs
          SET status = 'running',
              started_at = COALESCE(started_at, now()),
              lease_expires_at = now() + ($1 || ' seconds')::interval
        WHERE id = (
          SELECT id FROM jobs
           WHERE type IN ('crawl', 'batch_scrape')
             AND (
               status = 'queued'
               OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < now())
             )
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
        RETURNING id, request, api_key_id`;

  it('hands each claimer a different job, and nothing once the queue is empty', async () => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO jobs (type, request, created_at) VALUES
         ('crawl', '{"url":"https://a.test"}', now() - interval '2 minutes'),
         ('batch_scrape', '{"urls":["https://b.test"]}', now() - interval '1 minute')`,
      [],
    );

    const claims = await Promise.all([pool.query(CLAIM_JOB, [300]), pool.query(CLAIM_JOB, [300]), pool.query(CLAIM_JOB, [300])]);
    const claimed = claims.flatMap((c) => c.rows);

    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((r) => r.id)).size).toBe(2);
    expect(claimed.map((r) => r.request)).toEqual([{ url: 'https://a.test' }, { urls: ['https://b.test'] }]);
    const { rows } = await pool.query<{ status: string }>("SELECT DISTINCT status FROM jobs WHERE type IN ('crawl', 'batch_scrape')", []);
    expect(rows).toEqual([{ status: 'running' }]);
  });

  it('claims due monitors through transaction(), the SKIP LOCKED path the scheduler runs', async () => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO monitors (urls, schedule, next_check_at) VALUES
         (ARRAY['https://due.test'], '{"every":"1h"}', now() - interval '1 minute'),
         (ARRAY['https://later.test'], '{"every":"1h"}', now() + interval '1 hour')`,
      [],
    );
    const store = new PgMonitorStore(pool);

    const first = await store.claimDue(new Date(), 10);
    const second = await store.claimDue(new Date(), 10);

    expect(first.map((m) => m.url)).toEqual(['https://due.test']);
    expect(second).toEqual([]);
  });
});
