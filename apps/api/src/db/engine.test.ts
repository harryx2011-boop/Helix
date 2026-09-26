import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, createPool, getPool } from './pool.js';
import { migrate, type MigrationResult } from './migrate.js';
import { PgMonitorStore } from '../monitor/store.js';
import { PgVectorSink } from '../vectors/sink.js';

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

describe('pgvector sink on pglite', () => {
  // chunks.embedding is vector(384); a unit vector along one axis per chunk
  // makes the expected ranking exact.
  const axis = (i: number, lean = 0) => Array.from({ length: 384 }, (_, j) => (j === i ? 1 : j === i + 1 ? lean : 0));
  const sink = new PgVectorSink();

  beforeAll(async () => {
    await sink.store({
      url: 'https://docs.test/keys',
      collection: 'docs',
      model: 'm1',
      chunks: [
        { text: 'Rotate keys monthly.', anchor: '#rotate', tokens: 4, embedding: axis(0), headingPath: ['Keys', 'Rotation'] },
        { text: 'Revoke a key at once.', anchor: '#revoke', tokens: 5, embedding: axis(1) },
      ],
    });
    await sink.store({
      url: 'https://docs.test/billing',
      collection: 'docs',
      model: 'm1',
      chunks: [{ text: 'Invoices are monthly.', anchor: '#invoices', tokens: 4, embedding: axis(2) }],
    });
    await sink.store({
      url: 'https://docs.test/old',
      collection: 'legacy',
      chunks: [{ text: 'Stored before tracking.', anchor: '#old', tokens: 3, embedding: axis(3) }],
    });
  });

  it('returns the nearest chunks first, with score, anchor and heading path', async () => {
    const hits = await sink.query({ collection: 'docs', vector: axis(0, 0.1), k: 2 });

    expect(hits.map((h) => h.anchor)).toEqual(['#rotate', '#revoke']);
    expect(hits[0]).toMatchObject({ url: 'https://docs.test/keys', text: 'Rotate keys monthly.', headingPath: ['Keys', 'Rotation'] });
    expect(hits[0]!.score).toBeCloseTo(0.995, 2);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it('keeps to one page under a url filter', async () => {
    const hits = await sink.query({ collection: 'docs', vector: axis(0), k: 10, filter: { url: 'https://docs.test/billing' } });
    expect(hits.map((h) => h.anchor)).toEqual(['#invoices']);
  });

  it('reports the recorded model, a foreign one, and untracked chunks', async () => {
    await expect(sink.models('docs', 'm1')).resolves.toEqual({ exists: true, otherModel: undefined, untracked: false, dimensions: 384 });
    await expect(sink.models('docs', 'm2')).resolves.toMatchObject({ otherModel: 'm1' });
    await expect(sink.models('legacy', 'm1')).resolves.toMatchObject({ exists: true, untracked: true, dimensions: 384 });
    await expect(sink.models('nothing-here', 'm1')).resolves.toMatchObject({ exists: false });
  });
});
