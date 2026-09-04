import { describe, expect, it, vi, beforeEach } from 'vitest';

const JOB_ID = '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

interface TaskRow {
  url: string;
  depth: number;
  site: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  claimedBy: string | null;
  leaseExpiresAt: number | null;
}

/**
 * A fake job_tasks table.
 *
 * It models the SQL the frontier actually issues rather than replaying fixed
 * rows, because every property under test here is about what a WHERE clause
 * does and does not match. `now` is settable so lease expiry can be reached
 * without waiting five minutes for it.
 */
const db = vi.hoisted(() => {
  const state = {
    rows: [] as TaskRow[],
    now: 1_000_000_000_000,
  };

  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    const t = text.replace(/\s+/g, ' ');

    if (t.includes('INSERT INTO job_tasks')) {
      for (let i = 0; i < values.length; i += 5) {
        const url = values[i + 1] as string;
        if (state.rows.some((r) => r.url === url)) continue;
        state.rows.push({
          url,
          depth: values[i + 2] as number,
          site: values[i + 3] as string,
          status: 'queued',
          attempts: 0,
          maxAttempts: 3,
          claimedBy: null,
          leaseExpiresAt: null,
        });
      }
      return { rows: [], rowCount: 0 };
    }

    // Reclaim: only rows whose lease is already past, by the database's clock.
    if (t.includes("SET status = CASE WHEN attempts + 1 >= max_attempts")) {
      const hit = state.rows.filter(
        (r) => r.status === 'running' && r.leaseExpiresAt !== null && r.leaseExpiresAt < state.now,
      );
      for (const row of hit) {
        row.attempts += 1;
        row.status = row.attempts >= row.maxAttempts ? 'failed' : 'queued';
        row.claimedBy = null;
        row.leaseExpiresAt = null;
      }
      return { rows: [], rowCount: hit.length };
    }

    if (t.includes("SET status = 'running'")) {
      const urls = values[1] as string[];
      const worker = values[2] as string;
      const seconds = values[3] as number;
      const hit = state.rows.filter((r) => urls.includes(r.url) && r.status === 'queued');
      for (const row of hit) {
        row.status = 'running';
        row.claimedBy = worker;
        row.leaseExpiresAt = state.now + seconds * 1000;
      }
      return { rows: [], rowCount: hit.length };
    }

    if (t.includes('SET lease_expires_at = now()')) {
      const urls = values[1] as string[];
      const seconds = values[2] as number;
      const hit = state.rows.filter((r) => urls.includes(r.url) && r.status === 'running');
      for (const row of hit) row.leaseExpiresAt = state.now + seconds * 1000;
      return { rows: [], rowCount: hit.length };
    }

    if (t.includes("SET status = 'queued', claimed_at = NULL")) {
      const urls = values[1] as string[];
      const worker = values[2] as string;
      const hit = state.rows.filter(
        (r) => urls.includes(r.url) && r.status === 'running' && r.claimedBy === worker,
      );
      for (const row of hit) {
        row.status = 'queued';
        row.claimedBy = null;
        row.leaseExpiresAt = null;
      }
      return { rows: [], rowCount: hit.length };
    }

    if (t.includes("SET status = 'completed'")) {
      const row = state.rows.find((r) => r.url === values[1]);
      if (row) {
        row.status = 'completed';
        row.claimedBy = null;
        row.leaseExpiresAt = null;
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }

    if (t.includes("SET status = 'failed'")) {
      const row = state.rows.find((r) => r.url === values[1]);
      if (row) {
        row.status = 'failed';
        row.attempts += 1;
        row.claimedBy = null;
        row.leaseExpiresAt = null;
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }

    if (t.includes("status IN ('completed', 'failed')")) {
      return {
        rows: state.rows
          .filter((r) => r.status === 'completed' || r.status === 'failed')
          .map((r) => ({ url: r.url })),
        rowCount: 0,
      };
    }

    if (t.includes("status = 'queued'") && t.includes('SELECT url, depth, site')) {
      const rows = state.rows
        .filter((r) => r.status === 'queued')
        .map((r) => ({ url: r.url, depth: r.depth, site: r.site }));
      return { rows, rowCount: rows.length };
    }

    return { rows: [], rowCount: 0 };
  });

  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { PersistentFrontier } from './persistent-frontier.js';

const options = { seedUrl: 'https://example.com', limit: 100 };

beforeEach(() => {
  db.state.rows = [];
  db.state.now = 1_000_000_000_000;
  db.query.mockClear();
});

describe('PersistentFrontier — leases', () => {
  it('stamps an expiry when a task is claimed', async () => {
    const frontier = new PersistentFrontier(JOB_ID, options, 'worker-a');
    frontier.add('https://example.com/a', 0);
    await frontier.flush();

    await frontier.next(() => true);

    const row = db.state.rows[0];
    expect(row?.status).toBe('running');
    expect(row?.claimedBy).toBe('worker-a');
    // A claim without an expiry is the flag this design exists to replace.
    expect(row?.leaseExpiresAt).toBeGreaterThan(db.state.now);
  });

  it('reclaims a task whose worker died without releasing it', async () => {
    const dead = new PersistentFrontier(JOB_ID, options, 'worker-dead');
    dead.add('https://example.com/a', 0);
    await dead.flush();
    await dead.next(() => true);

    // No release(): the process was killed, so nothing ran on the way out.
    db.state.now += 6 * 60 * 1000;

    const reclaimed = await new PersistentFrontier(JOB_ID, options, 'worker-b').reclaimExpired();

    expect(reclaimed).toBe(1);
    expect(db.state.rows[0]?.status).toBe('queued');
    expect(db.state.rows[0]?.claimedBy).toBeNull();
  });

  it('leaves a live lease alone', async () => {
    const holder = new PersistentFrontier(JOB_ID, options, 'worker-a');
    holder.add('https://example.com/a', 0);
    await holder.flush();
    await holder.next(() => true);

    // Well inside the lease. Taking this would hand live work to a second
    // worker and pay for the same page twice.
    db.state.now += 60 * 1000;

    expect(await new PersistentFrontier(JOB_ID, options, 'worker-b').reclaimExpired()).toBe(0);
    expect(db.state.rows[0]?.status).toBe('running');
  });

  it('keeps a lease alive across a long fetch when it is renewed', async () => {
    const frontier = new PersistentFrontier(JOB_ID, options, 'worker-a');
    frontier.add('https://example.com/a', 0);
    await frontier.flush();
    await frontier.next(() => true);

    db.state.now += 2 * 60 * 1000;
    await frontier.renewLeases(db.state.now);

    db.state.now += 4 * 60 * 1000;
    // Without the renewal the original lease would have expired by now.
    expect(await new PersistentFrontier(JOB_ID, options, 'worker-b').reclaimExpired()).toBe(0);
  });

  it('does not spend a round trip on every renewal call', async () => {
    const frontier = new PersistentFrontier(JOB_ID, options, 'worker-a');
    frontier.add('https://example.com/a', 0);
    await frontier.flush();
    await frontier.next(() => true);

    const first = await frontier.renewLeases(db.state.now);
    const second = await frontier.renewLeases(db.state.now + 100);

    expect(first).toBe(1);
    // The renewal exists to outlive a slow page, not to attach a query to each.
    expect(second).toBe(0);
  });

  it('counts a reclaim as an attempt and fails a task that keeps killing workers', async () => {
    const url = 'https://example.com/poison';

    const seed = new PersistentFrontier(JOB_ID, options, 'seeder');
    seed.add(url, 0);
    await seed.flush();

    // Three workers in turn: each resumes, claims the task, and is killed
    // before it can finish — the shape of a page that reliably OOMs a renderer.
    for (let round = 0; round < 3; round++) {
      const worker = new PersistentFrontier(JOB_ID, options, `worker-${round}`);
      await worker.resume();
      await worker.next(() => true);
      db.state.now += 6 * 60 * 1000;
      await worker.reclaimExpired();
    }

    // An unbounded reclaim loop turns one poison page into a crawl that never
    // ends, so a task that has burned its attempts is failed instead.
    expect(db.state.rows[0]?.status).toBe('failed');
    expect(db.state.rows[0]?.attempts).toBe(3);
  });

  it('releases only this worker claims on shutdown', async () => {
    const a = new PersistentFrontier(JOB_ID, options, 'worker-a');
    a.add('https://example.com/a', 0);
    await a.flush();
    await a.next(() => true);

    // Another worker legitimately reclaimed the row and is fetching it now.
    db.state.rows[0] = {
      ...(db.state.rows[0] as TaskRow),
      claimedBy: 'worker-b',
      leaseExpiresAt: db.state.now + 300_000,
    };

    await a.release();

    expect(db.state.rows[0]?.status).toBe('running');
    expect(db.state.rows[0]?.claimedBy).toBe('worker-b');
  });

  it('clears the lease when a task completes', async () => {
    const frontier = new PersistentFrontier(JOB_ID, options, 'worker-a');
    frontier.add('https://example.com/a', 0);
    await frontier.flush();
    await frontier.next(() => true);

    await frontier.markCompleted('https://example.com/a');

    // A terminal row keeping a stale expiry is what a reclaim sweep would read
    // as abandoned work, and the page would be fetched a second time.
    expect(db.state.rows[0]?.leaseExpiresAt).toBeNull();
    db.state.now += 60 * 60 * 1000;
    expect(await frontier.reclaimExpired()).toBe(0);
  });

  it('reports what it recovered when resuming', async () => {
    const dead = new PersistentFrontier(JOB_ID, options, 'worker-dead');
    dead.add('https://example.com/a', 0);
    dead.add('https://example.com/b', 0);
    await dead.flush();
    await dead.next(() => true);
    await dead.markCompleted('https://example.com/b');

    db.state.now += 6 * 60 * 1000;

    const resumed = await new PersistentFrontier(JOB_ID, options, 'worker-b').resume();

    expect(resumed.reclaimed).toBe(1);
    // Reclaimed before the queue is read, so the recovered task is restored too.
    expect(resumed.restored).toBe(1);
    expect(resumed.alreadyDone).toBe(1);
  });

  it('does not re-enqueue work a previous run finished', async () => {
    const first = new PersistentFrontier(JOB_ID, options, 'worker-a');
    first.add('https://example.com/a', 0);
    await first.flush();
    await first.next(() => true);
    await first.markCompleted('https://example.com/a');

    const second = new PersistentFrontier(JOB_ID, options, 'worker-b');
    await second.resume();

    // Persistent dedup: a completed URL stays seen across the restart.
    expect(second.add('https://example.com/a', 0)).toBe(false);
    expect(second.pending).toBe(0);
  });
});

describe('PersistentFrontier — in-flight work', () => {
  it('requeues a page that was being fetched when the worker shut down', async () => {
    const frontier = new PersistentFrontier(JOB_ID, options, 'worker-a');
    frontier.add('https://example.com/a', 0);
    await frontier.flush();

    // Handed to a fetcher and still in progress when SIGTERM arrives.
    const item = await frontier.next(() => true);
    expect(item?.url).toBe('https://example.com/a');

    await frontier.release();

    // A page mid-fetch is the one most worth recovering, and the one a queue
    // that forgets its handouts silently loses.
    expect(db.state.rows[0]?.status).toBe('queued');
    expect(db.state.rows[0]?.claimedBy).toBeNull();
  });

  it('renews the lease of a page currently being fetched', async () => {
    const frontier = new PersistentFrontier(JOB_ID, options, 'worker-a');
    frontier.add('https://example.com/a', 0);
    await frontier.flush();
    await frontier.next(() => true);

    // These are exactly the leases that need renewing: a slow render is what
    // pushes a fetch past the lease in the first place.
    expect(await frontier.renewLeases(db.state.now)).toBe(1);
  });

  it('stops tracking a page once it has completed', async () => {
    const frontier = new PersistentFrontier(JOB_ID, options, 'worker-a');
    frontier.add('https://example.com/a', 0);
    await frontier.flush();
    await frontier.next(() => true);
    await frontier.markCompleted('https://example.com/a');

    expect(frontier.pending).toBe(0);
    await frontier.release();
    expect(db.state.rows[0]?.status).toBe('completed');
  });

  it('counts in-flight work as pending so a crawl does not end early', async () => {
    const frontier = new PersistentFrontier(JOB_ID, options, 'worker-a');
    frontier.add('https://example.com/a', 0);
    await frontier.flush();
    await frontier.next(() => true);

    // The worker loop ends on pending === 0. Forgetting handed-out work here
    // would end the crawl while a page was still being fetched.
    expect(frontier.pending).toBe(1);
  });
});
