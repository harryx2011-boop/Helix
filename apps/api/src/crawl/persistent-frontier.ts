import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { Frontier, type FrontierItem, type FrontierOptions } from './frontier.js';


const FLUSH_THRESHOLD = 50;
const CLAIM_BATCH = 20;

const LEASE_SECONDS = 300;

const RENEW_INTERVAL_MS = (LEASE_SECONDS / 3) * 1000;

interface PendingRow {
  url: string;
  depth: number;
  site: string;
  idempotencyKey: string;
}

export class PersistentFrontier {
  readonly #frontier: Frontier;
  readonly #jobId: string;
  readonly #workerId: string;
  #pendingWrites: PendingRow[] = [];
  #claimed: FrontierItem[] = [];
  #inFlight = new Map<string, FrontierItem>();
  #lastRenewal = 0;

  constructor(jobId: string, options: FrontierOptions, workerId: string = randomUUID()) {
    this.#jobId = jobId;
    this.#workerId = workerId;
    this.#frontier = new Frontier(options);
  }

  async resume(): Promise<{ restored: number; alreadyDone: number; reclaimed: number }> {
    const reclaimed = await this.reclaimExpired();

    const { rows: done } = await getPool().query<{ url: string }>(
      `SELECT url FROM job_tasks WHERE job_id = $1 AND status IN ('completed', 'failed')`,
      [this.#jobId],
    );

    for (const row of done) {
      this.#frontier.add(row.url, 0);
    }
    this.#frontier.drain();

    const { rows: pending } = await getPool().query<{
      url: string;
      depth: number;
      site: string | null;
    }>(
      `SELECT url, depth, site FROM job_tasks
        WHERE job_id = $1 AND status = 'queued'
        ORDER BY depth, id`,
      [this.#jobId],
    );

    for (const row of pending) {
      this.#frontier.add(row.url, row.depth);
    }

    return { restored: pending.length, alreadyDone: done.length, reclaimed };
  }

  async reclaimExpired(): Promise<number> {
    const { rowCount } = await getPool().query(
      `UPDATE job_tasks
          SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed'::job_status
                            ELSE 'queued'::job_status END,
              attempts = attempts + 1,
              claimed_at = NULL,
              claimed_by = NULL,
              lease_expires_at = NULL
        WHERE job_id = $1
          AND status = 'running'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < now()`,
      [this.#jobId],
    );
    return rowCount ?? 0;
  }

  async renewLeases(now = Date.now()): Promise<number> {
    const urls = this.#leased();
    if (urls.length === 0) return 0;
    if (this.#lastRenewal !== 0 && now - this.#lastRenewal < RENEW_INTERVAL_MS) return 0;
    this.#lastRenewal = now;

    const { rowCount } = await getPool().query(
      `UPDATE job_tasks
          SET lease_expires_at = now() + ($3 || ' seconds')::interval
        WHERE job_id = $1 AND url = ANY($2) AND status = 'running'`,
      [this.#jobId, urls, LEASE_SECONDS],
    );
    return rowCount ?? 0;
  }

  add(url: string, depth: number): boolean {
    const before = this.#frontier.enqueued;
    const accepted = this.#frontier.add(url, depth);

    if (accepted && this.#frontier.enqueued > before) {
      const item = this.#frontier.peekLast();
      if (item) {
        this.#pendingWrites.push({
          url: item.url,
          depth: item.depth,
          site: item.site,
          idempotencyKey: `${item.key}::${item.depth}`,
        });
      }
    }

    return accepted;
  }

  async flush(): Promise<void> {
    if (this.#pendingWrites.length === 0) return;

    const batch = this.#pendingWrites;
    this.#pendingWrites = [];

    const values: unknown[] = [];
    const tuples: string[] = [];

    batch.forEach((row, index) => {
      const base = index * 5;
      tuples.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      values.push(this.#jobId, row.url, row.depth, row.site, row.idempotencyKey);
    });

    await getPool().query(
      `INSERT INTO job_tasks (job_id, url, depth, site, idempotency_key)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (job_id, idempotency_key) DO NOTHING`,
      values,
    );
  }

  async maybeFlush(): Promise<void> {
    if (this.#pendingWrites.length >= FLUSH_THRESHOLD) await this.flush();
  }

  async next(canFetch: (site: string) => boolean): Promise<FrontierItem | undefined> {
    const ready = this.#claimed.findIndex((item) => canFetch(item.site));
    if (ready >= 0) {
      const [item] = this.#claimed.splice(ready, 1);
      if (item) this.#inFlight.set(item.url, item);
      return item;
    }

    const batch: FrontierItem[] = [];
    for (let i = 0; i < CLAIM_BATCH; i++) {
      const item = this.#frontier.next(() => true);
      if (!item) break;
      batch.push(item);
    }

    if (batch.length === 0) return undefined;

    await this.flush();

    await getPool().query(
      `UPDATE job_tasks
          SET status = 'running',
              claimed_at = now(),
              claimed_by = $3,
              lease_expires_at = now() + ($4 || ' seconds')::interval
        WHERE job_id = $1 AND url = ANY($2) AND status = 'queued'`,
      [this.#jobId, batch.map((item) => item.url), this.#workerId, LEASE_SECONDS],
    );

    this.#claimed.push(...batch);

    const index = this.#claimed.findIndex((item) => canFetch(item.site));
    if (index < 0) return undefined;

    const [item] = this.#claimed.splice(index, 1);
    if (item) this.#inFlight.set(item.url, item);
    return item;
  }

  #leased(): string[] {
    return [...this.#claimed.map((item) => item.url), ...this.#inFlight.keys()];
  }

  async markCompleted(url: string): Promise<boolean> {
    this.#inFlight.delete(url);
    const { rowCount } = await getPool().query(
      `UPDATE job_tasks
          SET status = 'completed', claimed_at = NULL, claimed_by = NULL, lease_expires_at = NULL
        WHERE job_id = $1 AND url = $2 AND claimed_by = $3`,
      [this.#jobId, url, this.#workerId],
    );
    return (rowCount ?? 0) > 0;
  }

  async markFailed(url: string): Promise<boolean> {
    this.#inFlight.delete(url);
    const { rowCount } = await getPool().query(
      `UPDATE job_tasks
          SET status = 'failed', attempts = attempts + 1,
              claimed_at = NULL, claimed_by = NULL, lease_expires_at = NULL
        WHERE job_id = $1 AND url = $2 AND claimed_by = $3`,
      [this.#jobId, url, this.#workerId],
    );
    return (rowCount ?? 0) > 0;
  }

  async release(): Promise<void> {
    const urls = this.#leased();
    if (urls.length === 0) return;

    await getPool().query(
      `UPDATE job_tasks
          SET status = 'queued', claimed_at = NULL, claimed_by = NULL, lease_expires_at = NULL
        WHERE job_id = $1 AND url = ANY($2) AND status = 'running' AND claimed_by = $3`,
      [this.#jobId, urls, this.#workerId],
    );

    this.#claimed = [];
    this.#inFlight.clear();
  }

  get pending(): number {
    return this.#frontier.pending + this.#claimed.length + this.#inFlight.size;
  }

  get enqueued(): number {
    return this.#frontier.enqueued;
  }

  get atLimit(): boolean {
    return this.#frontier.atLimit;
  }

  rejections(): Record<string, number> {
    return this.#frontier.rejections();
  }
}
