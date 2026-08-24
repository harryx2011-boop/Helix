import { getPool } from '../db/pool.js';
import { Frontier, type FrontierItem, type FrontierOptions } from './frontier.js';

/**
 * A frontier that survives a restart.
 *
 * The in-memory {@link Frontier} owns scope rules and dedup; this wraps it with
 * a Postgres-backed queue so a worker that dies mid-crawl resumes where it
 * stopped instead of starting over. On a ten-thousand-page crawl that is the
 * difference between a blip and losing an hour of work.
 *
 * Writes are batched. One INSERT per discovered URL would make the database the
 * bottleneck long before the network was.
 */

const FLUSH_THRESHOLD = 50;
const CLAIM_BATCH = 20;

interface PendingRow {
  url: string;
  depth: number;
  site: string;
  idempotencyKey: string;
}

export class PersistentFrontier {
  readonly #frontier: Frontier;
  readonly #jobId: string;
  #pendingWrites: PendingRow[] = [];
  #claimed: FrontierItem[] = [];

  constructor(jobId: string, options: FrontierOptions) {
    this.#jobId = jobId;
    this.#frontier = new Frontier(options);
  }

  /**
   * Rebuild in-memory state from the queue after a restart.
   *
   * Completed URLs are re-added to the dedup filter — without that, a resumed
   * crawl would happily re-enqueue everything it had already finished.
   */
  async resume(): Promise<{ restored: number; alreadyDone: number }> {
    const { rows: done } = await getPool().query<{ url: string }>(
      `SELECT url FROM job_tasks WHERE job_id = $1 AND status IN ('completed', 'failed')`,
      [this.#jobId],
    );

    for (const row of done) {
      // Depth is irrelevant here: this only needs to mark the URL as seen.
      this.#frontier.add(row.url, 0);
    }
    // Those adds populated the queue as a side effect; drain it so only genuinely
    // pending work is dispensed.
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

    return { restored: pending.length, alreadyDone: done.length };
  }

  /** Offer a URL. Accepted URLs are queued for the next flush. */
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
          idempotencyKey: `${item.url}::${item.depth}`,
        });
      }
    }

    return accepted;
  }

  /** Write queued discoveries. Called on a threshold and before waiting. */
  async flush(): Promise<void> {
    if (this.#pendingWrites.length === 0) return;

    const batch = this.#pendingWrites;
    this.#pendingWrites = [];

    // One multi-row INSERT rather than N statements.
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

  /**
   * Take the next URL for a host with capacity, marking it claimed.
   *
   * Claims are batched: marking one row at a time would put a round trip in
   * front of every single fetch.
   */
  async next(canFetch: (site: string) => boolean): Promise<FrontierItem | undefined> {
    const ready = this.#claimed.findIndex((item) => canFetch(item.site));
    if (ready >= 0) {
      const [item] = this.#claimed.splice(ready, 1);
      return item;
    }

    // Pull a batch out of the in-memory queue regardless of host availability,
    // then hand back whichever of them a free host can take.
    const batch: FrontierItem[] = [];
    for (let i = 0; i < CLAIM_BATCH; i++) {
      const item = this.#frontier.next(() => true);
      if (!item) break;
      batch.push(item);
    }

    if (batch.length === 0) return undefined;

    await getPool().query(
      `UPDATE job_tasks SET status = 'running', claimed_at = now()
        WHERE job_id = $1 AND url = ANY($2) AND status = 'queued'`,
      [this.#jobId, batch.map((item) => item.url)],
    );

    this.#claimed.push(...batch);

    const index = this.#claimed.findIndex((item) => canFetch(item.site));
    if (index < 0) return undefined;

    const [item] = this.#claimed.splice(index, 1);
    return item;
  }

  async markCompleted(url: string): Promise<void> {
    await getPool().query(
      `UPDATE job_tasks SET status = 'completed' WHERE job_id = $1 AND url = $2`,
      [this.#jobId, url],
    );
  }

  async markFailed(url: string): Promise<void> {
    await getPool().query(
      `UPDATE job_tasks SET status = 'failed', attempts = attempts + 1
        WHERE job_id = $1 AND url = $2`,
      [this.#jobId, url],
    );
  }

  /** Return unfetched claims to the queue, so a shutdown loses nothing. */
  async release(): Promise<void> {
    if (this.#claimed.length === 0) return;

    await getPool().query(
      `UPDATE job_tasks SET status = 'queued', claimed_at = NULL
        WHERE job_id = $1 AND url = ANY($2) AND status = 'running'`,
      [this.#jobId, this.#claimed.map((item) => item.url)],
    );

    this.#claimed = [];
  }

  get pending(): number {
    return this.#frontier.pending + this.#claimed.length;
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
