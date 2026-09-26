import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

async function job(label: string, status: string, expires: string, lease: string | null = null): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO jobs (type, status, request, expires_at, lease_expires_at)
     VALUES ('crawl', $1::job_status, $2, now() + $3::interval, now() + $4::interval)
     RETURNING id`,
    [status, JSON.stringify({ label }), expires, lease],
  );
  return rows[0]!.id;
}

async function doc(jobId: string | null, url: string, expires: string): Promise<void> {
  await getPool().query(
    `INSERT INTO documents (job_id, url, content_hash, tier, content, expires_at)
     VALUES ($1, $2, 'h', 'http', '{}', now() + $3::interval)`,
    [jobId, url, expires],
  );
}

describe('sweepExpired', () => {
  it('deletes expired jobs and documents, and keeps what has not expired or is still held', async () => {
    const expired = await job('expired', 'completed', '-1 hour');
    const fresh = await job('fresh', 'completed', '1 day');
    const held = await job('held', 'running', '-1 hour', '5 minutes');
    const stranded = await job('stranded', 'running', '-1 hour', '-5 minutes');
    await getPool().query('INSERT INTO job_tasks (job_id, url, idempotency_key) VALUES ($1, $2, $3)', [
      expired,
      'https://expired.test/a',
      'k1',
    ]);
    await doc(expired, 'https://expired.test/a', '1 day');
    await doc(fresh, 'https://fresh.test/a', '1 day');
    await doc(null, 'https://scrape.test/old', '-1 minute');
    await doc(null, 'https://scrape.test/new', '1 day');

    const result = await sweepExpired();

    expect(result).toEqual({ jobs: 2, documents: 1 });
    const { rows: jobs } = await getPool().query<{ id: string }>('SELECT id FROM jobs ORDER BY created_at', []);
    expect(new Set(jobs.map((r) => r.id))).toEqual(new Set([fresh, held]));
    expect(jobs.map((r) => r.id)).not.toContain(stranded);
    const { rows: docs } = await getPool().query<{ url: string }>('SELECT url FROM documents ORDER BY url', []);
    // The expired job's own document went with it through the cascade.
    expect(docs.map((r) => r.url)).toEqual(['https://fresh.test/a', 'https://scrape.test/new']);
    const { rowCount } = await getPool().query('SELECT 1 FROM job_tasks WHERE job_id = $1', [expired]);
    expect(rowCount).toBe(0);
  });

  it('finds nothing on a second pass', async () => {
    expect(await sweepExpired()).toEqual({ jobs: 0, documents: 0 });
  });
});
