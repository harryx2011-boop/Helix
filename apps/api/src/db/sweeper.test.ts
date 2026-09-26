import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, createPool, getPool } from './pool.js';
import { migrate } from './migrate.js';
import { sweepExpired } from './sweeper.js';

/** The results sweeper on the real schema, PGlite in memory. */

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

beforeAll(async () => {
  createPool({ driver: 'pglite' });
  await migrate(MIGRATIONS);
}, 120_000);

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  await getPool().query('DELETE FROM documents', []);
  await getPool().query('DELETE FROM jobs', []);
});

async function job(label: string, status: string, age: string, lease: string | null = null): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO jobs (type, status, request, created_at, lease_expires_at)
     VALUES ('crawl', $1::job_status, $2, now() - $3::interval, now() + $4::interval)
     RETURNING id`,
    [status, JSON.stringify({ label }), age, lease],
  );
  return rows[0]!.id;
}

async function doc(jobId: string | null, url: string, age: string): Promise<void> {
  await getPool().query(
    `INSERT INTO documents (job_id, url, content_hash, tier, content, fetched_at)
     VALUES ($1, $2, 'h', 'http', '{}', now() - $3::interval)`,
    [jobId, url, age],
  );
}

describe('sweepExpired', () => {
  it('deletes what is older than the TTL by its own timestamp, whatever expires_at says', async () => {
    // expires_at keeps its 7-day default on every row here; only age decides.
    const old = await job('old', 'completed', '2 days');
    const fresh = await job('fresh', 'completed', '1 hour');
    const held = await job('held', 'running', '2 days', '5 minutes');
    const stranded = await job('stranded', 'running', '2 days', '-5 minutes');
    await getPool().query('INSERT INTO job_tasks (job_id, url, idempotency_key) VALUES ($1, $2, $3)', [
      old,
      'https://old.test/a',
      'k1',
    ]);
    await doc(old, 'https://old.test/a', '1 hour');
    await doc(fresh, 'https://fresh.test/a', '1 hour');
    await doc(null, 'https://scrape.test/old', '25 hours');
    await doc(null, 'https://scrape.test/new', '23 hours');

    const result = await sweepExpired({ ttlHours: 24 });

    expect(result).toEqual({ jobs: 2, documents: 1, vacuumed: false });
    const { rows: jobs } = await getPool().query<{ id: string }>('SELECT id FROM jobs', []);
    expect(new Set(jobs.map((r) => r.id))).toEqual(new Set([fresh, held]));
    expect(jobs.map((r) => r.id)).not.toContain(stranded);
    const { rows: docs } = await getPool().query<{ url: string }>('SELECT url FROM documents ORDER BY url', []);
    // The old job's own document went with it through the cascade.
    expect(docs.map((r) => r.url)).toEqual(['https://fresh.test/a', 'https://scrape.test/new']);
    const { rowCount } = await getPool().query('SELECT 1 FROM job_tasks WHERE job_id = $1', [old]);
    expect(rowCount).toBe(0);

    expect(await sweepExpired({ ttlHours: 24 })).toEqual({ jobs: 0, documents: 0, vacuumed: false });
  });

  it('spares the old documents of a job a worker still holds on a live lease', async () => {
    const held = await job('held', 'running', '1 hour', '5 minutes');
    const lapsed = await job('lapsed', 'running', '1 hour', '-5 minutes');
    await doc(held, 'https://held.test/a', '3 days');
    await doc(lapsed, 'https://lapsed.test/a', '3 days');

    const result = await sweepExpired({ ttlHours: 24 });

    expect(result.documents).toBe(1);
    const { rows } = await getPool().query<{ url: string }>('SELECT url FROM documents', []);
    expect(rows.map((r) => r.url)).toEqual(['https://held.test/a']);
  });

  it('deletes in batches until a batch comes back empty', async () => {
    for (let i = 0; i < 5; i++) await doc(null, `https://batch.test/${i}`, '2 days');

    expect(await sweepExpired({ ttlHours: 24, batchSize: 2 })).toEqual({ jobs: 0, documents: 5, vacuumed: false });
    const { rowCount } = await getPool().query('SELECT 1 FROM documents', []);
    expect(rowCount).toBe(0);
  });

  it('vacuums after a sweep that deleted rows, and not after one that deleted none', async () => {
    await doc(null, 'https://vacuum.test/a', '2 days');

    expect(await sweepExpired({ ttlHours: 24, vacuum: true })).toEqual({ jobs: 0, documents: 1, vacuumed: true });
    expect(await sweepExpired({ ttlHours: 24, vacuum: true })).toEqual({ jobs: 0, documents: 0, vacuumed: false });
  });
});
