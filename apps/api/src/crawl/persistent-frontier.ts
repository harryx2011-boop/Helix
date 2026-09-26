import { randomUUID } from 'node:crypto';
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
 *
 * Claims are LEASES, not flags. A worker that exits cleanly returns its claims;
 * a worker that is killed cannot, and a bare 'running' status would strand those
 * rows forever — the crawl completes reporting fewer pages than it queued, with
 * no failure row to explain the gap. Every claim therefore carries an expiry
 * that the holder extends while it works, and any worker may reclaim a task
 * whose lease has passed. Expiry is decided by the database clock, never by the
 * worker's: two machines whose clocks disagree by a minute would otherwise
 * reclaim each other's live work.
 */

const FLUSH_THRESHOLD = 50;
const CLAIM_BATCH = 20;

/**
 * How long a claim is good for.
 *
 * Long enough that a slow chromium render plus its extraction finishes inside
 * it, short enough that a crashed worker's queue is recovered while the crawl
 * is still running. Too short is worse than too long: it hands live work to a
 * second worker and pays for the same page twice.
 */
const LEASE_SECONDS = 300;

/** Renewals are attempted at a third of the lease, so one lost round trip is survivable. */
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
  /**
   * Identifies this worker's claims so `release()` returns only its own.
   * Without it, a shutting-down worker would requeue tasks another worker had
   * legitimately reclaimed and is fetching right now.
   */
  readonly #workerId: string;
  #pendingWrites: PendingRow[] = [];
  /** Claimed in the database, not yet handed to a fetcher. */
  #claimed: FrontierItem[] = [];
  /**
   * Handed out and being fetched right now.
   *
   * Tracked separately from `#claimed` because these are the rows whose lease
   * most needs renewing and whose loss on shutdown actually costs a page. Before
   * this existed, `next()` spliced an item out of `#claimed` and the frontier
   * forgot a row that was still 'running' in Postgres — so a shutdown requeued
   * only the unstarted buffer, and every page mid-fetch was stranded.
   */
  #inFlight = new Map<string, FrontierItem>();
  #lastRenewal = 0;

  constructor(jobId: string, options: FrontierOptions, workerId: string = randomUUID()) {
    this.#jobId = jobId;
    this.#workerId = workerId;
    this.#frontier = new Frontier(options);
  }

  /**
   * Rebuild in-memory state from the queue after a restart.
   *
   * Completed URLs are re-added to the dedup filter — without that, a resumed
   * crawl would happily re-enqueue everything it had already finished.
   */
  async resume(): Promise<{ restored: number; alreadyDone: number; reclaimed: number }> {
    // Reclaim first: a task whose lease died with its worker is queued work,
    // and reading the queue before recovering it would leave it out of the
    // restored count and out of the crawl.
    const reclaimed = await this.reclaimExpired();

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

    return { restored: pending.length, alreadyDone: done.length, reclaimed };
  }

  /**
   * Return tasks whose lease has expired to the queue.
   *
   * Safe to run while other workers hold live leases: the WHERE clause only
   * matches rows whose expiry is already in the past by the database's own
   * clock, so a task being actively renewed is never taken from under its
   * holder. Comparing against a timestamp computed in Node would make that
   * guarantee depend on two machines agreeing about the time.
   *
   * A task that has burned through its attempts is failed rather than requeued.
   * A URL that kills three workers in a row will kill the fourth, and an
   * unbounded reclaim loop turns one poison page into a crawl that never ends.
   */
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

  /**
   * Push this worker's leases forward.
   *
   * Rate-limited by the caller's clock rather than run per fetch: the renewal
   * exists to outlive a slow page, not to be a round trip attached to every one.
   * `status = 'running'` in the WHERE means a lease already reclaimed by another
   * worker is not silently taken back — the row has moved on, and this worker's
   * result for it will be discarded by the same condition on completion.
   */
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
          idempotencyKey: `${item.key}::${item.depth}`,
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
      if (item) this.#inFlight.set(item.url, item);
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

    // The claim matches rows by URL, so any still buffered must exist first;
    // otherwise the claim misses, the fetch runs unowned and its result is dropped.
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

  /** Every URL this worker holds a lease on, buffered or in flight. */
  #leased(): string[] {
    return [...this.#claimed.map((item) => item.url), ...this.#inFlight.keys()];
  }

  /**
   * Record a finished page, but only while this worker still holds the claim.
   *
   * `claimed_by` is the same guard `release()` carries, and for the same reason:
   * a worker whose lease expired mid-fetch is no longer the owner of that row,
   * and flipping it to a terminal status would take the page away from the
   * worker now fetching it and store the document twice. The caller is told
   * whether the row moved so it can drop a result the queue has moved past.
   */
  async markCompleted(url: string): Promise<boolean> {
    this.#inFlight.delete(url);
    // The lease is cleared with the status. A terminal row keeping a stale
    // expiry is what a reclaim sweep would read as abandoned work.
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

  /** Return unfetched claims to the queue, so a shutdown loses nothing. */
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
