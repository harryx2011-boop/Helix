import type { Log } from '../core/logger.js';
import {
  purgeSettledDeliveries,
  retryDelayMs,
  WEBHOOK_MAX_ATTEMPTS,
  type Queryable,
  type WebhookEvent,
  type WebhookPayload,
} from './deliveries.js';
import { signPayload } from './signature.js';
import { resolvedTargetProblem, type Resolver } from './target.js';

/**
 * Delivers queued webhooks.
 *
 * Claims due rows by pushing their `next_retry_at` forward as a lease, so a
 * crashed dispatcher leaves nothing stuck: the lease expires and the row is
 * simply due again. A 2xx marks the row delivered. A failure that another
 * attempt could fix (a 5xx, a timeout, a dropped connection) schedules a retry
 * with backoff until the attempt ceiling. One that will not change (a 4xx, a
 * redirect, a private target) dead-letters at once: twenty attempts over three
 * days at a receiver answering 404 is not persistence, it is a flood. Dead rows
 * are kept for the retention window so they can be inspected and replayed.
 */

const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** Statuses a later attempt may turn into a 2xx. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Undici wraps network failures (refused, reset, DNS) in a TypeError carrying a
 * `cause`; a TypeError without one is the request itself being unsendable.
 */
function isPermanentError(error: unknown): boolean {
  return error instanceof TypeError && (error as { cause?: unknown }).cause === undefined;
}

export interface DeliveryRow {
  id: number | string;
  job_id: string | null;
  monitor_id: string | null;
  url: string;
  event_type: string;
  payload: {
    event: WebhookEvent;
    jobId: string | null;
    monitorId: string | null;
    data: unknown;
    metadata: Record<string, unknown> | null;
    headers: Record<string, string> | null;
  };
  attempts: number;
  created_at: Date | string;
}

export interface DispatcherDeps {
  db: Queryable;
  fetch?: typeof fetch;
  secret?: string | undefined;
  maxAttempts?: number;
  batchSize?: number;
  requestTimeoutMs?: number;
  leaseSeconds?: number;
  /** Delivered and dead rows older than this are deleted. Omitted means never. */
  retentionHours?: number | undefined;
  resolve?: Resolver;
  logger?: Log | undefined;
  now?: () => number;
}

export interface DeliveryOutcome {
  id: DeliveryRow['id'];
  status: 'delivered' | 'retry' | 'dead';
  attempts: number;
  statusCode?: number | undefined;
  error?: string | undefined;
}

export class WebhookDispatcher {
  readonly #db: Queryable;
  readonly #fetch: typeof fetch;
  readonly #secret: string | undefined;
  readonly #maxAttempts: number;
  readonly #batchSize: number;
  readonly #requestTimeoutMs: number;
  readonly #leaseSeconds: number;
  readonly #retentionHours: number | undefined;
  readonly #resolve: Resolver | undefined;
  readonly #logger: Log | undefined;
  readonly #now: () => number;
  #running = false;
  #stopping = false;
  #lastPurge = 0;

  constructor(deps: DispatcherDeps) {
    this.#db = deps.db;
    this.#fetch = deps.fetch ?? fetch;
    this.#secret = deps.secret;
    this.#maxAttempts = deps.maxAttempts ?? WEBHOOK_MAX_ATTEMPTS;
    this.#batchSize = deps.batchSize ?? 20;
    this.#requestTimeoutMs = deps.requestTimeoutMs ?? 10_000;
    this.#leaseSeconds = deps.leaseSeconds ?? 60;
    this.#retentionHours = deps.retentionHours;
    this.#resolve = deps.resolve;
    this.#logger = deps.logger;
    this.#now = deps.now ?? Date.now;
  }

  async #claim(): Promise<DeliveryRow[]> {
    const { rows } = await this.#db.query<DeliveryRow>(
      `UPDATE webhook_deliveries
          SET next_retry_at = now() + ($2::int * interval '1 second')
        WHERE id IN (
          SELECT id FROM webhook_deliveries
           WHERE status = 'pending' AND next_retry_at <= now()
           ORDER BY next_retry_at
           FOR UPDATE SKIP LOCKED
           LIMIT $1
        )
        RETURNING id, job_id, monitor_id, url, event_type, payload, attempts, created_at`,
      [this.#batchSize, this.#leaseSeconds],
    );
    return rows;
  }

  /** Deliver everything currently due. Returns one outcome per row claimed. */
  async runOnce(): Promise<DeliveryOutcome[]> {
    const rows = await this.#claim();
    const outcomes = await Promise.all(rows.map((row) => this.deliver(row)));
    return outcomes;
  }

  /**
   * A `page` event carries the page's markdown, which lives in `documents`.
   * It is read at send time rather than copied into the queue row, so a crawl
   * with a webhook stores each page once. A page purged before delivery sends
   * `null`.
   */
  async #hydrate(row: DeliveryRow): Promise<unknown> {
    const data = row.payload.data;
    if (row.payload.event !== 'page' || !row.job_id || typeof data !== 'object' || data === null) {
      return data;
    }
    const page = data as Record<string, unknown>;
    if (typeof page['url'] !== 'string' || page['markdown'] != null) return page;

    const { rows } = await this.#db.query<{ markdown: string | null }>(
      `SELECT content->>'markdown' AS markdown
         FROM documents
        WHERE job_id = $1 AND url = $2
        ORDER BY fetched_at DESC
        LIMIT 1`,
      [row.job_id, page['url']],
    );
    return { ...page, url: page['url'], markdown: rows[0]?.markdown ?? null };
  }

  async deliver(row: DeliveryRow): Promise<DeliveryOutcome> {
    const targetProblem = await resolvedTargetProblem(row.url, this.#resolve);
    if (targetProblem) {
      return this.#settle(row, row.attempts + 1, `target ${targetProblem}`, true, undefined);
    }

    const timestamp = Math.floor(this.#now() / 1000);
    const body: WebhookPayload = {
      id: String(row.id),
      event: row.payload.event,
      jobId: row.payload.jobId,
      monitorId: row.payload.monitorId,
      timestamp: new Date(timestamp * 1000).toISOString(),
      data: await this.#hydrate(row),
      metadata: row.payload.metadata,
    };
    const serialised = JSON.stringify(body);

    // Caller headers first, so the ones Helix promises cannot be replaced.
    const headers: Record<string, string> = {
      ...(row.payload.headers ?? {}),
      'content-type': 'application/json',
      'user-agent': 'Helix-Webhooks/1',
      'helix-event': row.payload.event,
      'helix-delivery-id': String(row.id),
    };
    if (this.#secret) headers['helix-signature'] = signPayload(this.#secret, timestamp, serialised);

    let statusCode: number | undefined;
    let error: string | undefined;
    let permanent = false;

    try {
      // A redirect is not followed: the target was checked, its Location was not.
      const response = await this.#fetch(row.url, {
        method: 'POST',
        headers,
        body: serialised,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
      statusCode = response.status;
      if (!response.ok) {
        const location = response.headers.get('location');
        error =
          response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)
            ? `HTTP ${response.status} redirect to ${location ?? '(no Location header)'} not followed; update the webhook URL`
            : `HTTP ${response.status}`;
        permanent = !isRetryableStatus(response.status);
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      permanent = isPermanentError(caught);
    }

    return this.#settle(row, row.attempts + 1, error, permanent, statusCode);
  }

  async #settle(
    row: DeliveryRow,
    attempts: number,
    error: string | undefined,
    permanent: boolean,
    statusCode: number | undefined,
  ): Promise<DeliveryOutcome> {
    if (error === undefined) {
      await this.#db.query(
        `UPDATE webhook_deliveries
            SET status = 'delivered', attempts = $2, delivered_at = now(), last_error = NULL
          WHERE id = $1`,
        [row.id, attempts],
      );
      return { id: row.id, status: 'delivered', attempts, statusCode };
    }

    if (permanent || attempts >= this.#maxAttempts) {
      await this.#db.query(
        `UPDATE webhook_deliveries
            SET status = 'dead', attempts = $2, last_error = $3
          WHERE id = $1`,
        [row.id, attempts, error],
      );
      this.#logger?.warn(
        { deliveryId: row.id, url: row.url, attempts, error, permanent },
        'webhook dead-lettered',
      );
      return { id: row.id, status: 'dead', attempts, statusCode, error };
    }

    const delayMs = retryDelayMs(attempts);
    await this.#db.query(
      `UPDATE webhook_deliveries
          SET attempts = $2, last_error = $3,
              next_retry_at = now() + ($4::int * interval '1 millisecond')
        WHERE id = $1`,
      [row.id, attempts, error, delayMs],
    );
    return { id: row.id, status: 'retry', attempts, statusCode, error };
  }

  /** Delete settled rows past retention, at most once an hour. */
  async purgeIfDue(): Promise<number> {
    if (this.#retentionHours === undefined) return 0;
    const now = this.#now();
    if (now - this.#lastPurge < PURGE_INTERVAL_MS) return 0;
    this.#lastPurge = now;
    const purged = await purgeSettledDeliveries(this.#db, this.#retentionHours);
    if (purged > 0) this.#logger?.info({ purged }, 'webhook deliveries purged');
    return purged;
  }

  /** Poll for due deliveries until stopped. */
  async start(intervalMs = 5_000): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#stopping = false;

    while (!this.#stopping) {
      try {
        await this.purgeIfDue();
        const outcomes = await this.runOnce();
        if (outcomes.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        this.#logger?.error({ error }, 'webhook dispatcher loop error');
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    this.#running = false;
  }

  stop(): void {
    this.#stopping = true;
  }
}
