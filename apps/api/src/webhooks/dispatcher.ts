import type { Log } from '../core/logger.js';
import { retryDelayMs, type Queryable, type WebhookEvent, type WebhookPayload } from './deliveries.js';
import { signPayload } from './signature.js';

/**
 * Delivers queued webhooks.
 *
 * Claims due rows by pushing their `next_retry_at` forward as a lease, so a
 * crashed dispatcher leaves nothing stuck: the lease expires and the row is
 * simply due again. A 2xx marks the row delivered. Anything else schedules a
 * retry with backoff until the attempt ceiling, after which the row is dead —
 * kept, not deleted, so it can be inspected and replayed.
 */

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
  readonly #logger: Log | undefined;
  readonly #now: () => number;
  #running = false;
  #stopping = false;

  constructor(deps: DispatcherDeps) {
    this.#db = deps.db;
    this.#fetch = deps.fetch ?? fetch;
    this.#secret = deps.secret;
    this.#maxAttempts = deps.maxAttempts ?? 20;
    this.#batchSize = deps.batchSize ?? 20;
    this.#requestTimeoutMs = deps.requestTimeoutMs ?? 10_000;
    this.#leaseSeconds = deps.leaseSeconds ?? 60;
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

  async deliver(row: DeliveryRow): Promise<DeliveryOutcome> {
    const timestamp = Math.floor(this.#now() / 1000);
    const body: WebhookPayload = {
      id: String(row.id),
      event: row.payload.event,
      jobId: row.payload.jobId,
      monitorId: row.payload.monitorId,
      timestamp: new Date(timestamp * 1000).toISOString(),
      data: row.payload.data,
      metadata: row.payload.metadata,
    };
    const serialised = JSON.stringify(body);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'Helix-Webhooks/1',
      'helix-event': row.payload.event,
      'helix-delivery-id': String(row.id),
      ...(row.payload.headers ?? {}),
    };
    if (this.#secret) headers['helix-signature'] = signPayload(this.#secret, timestamp, serialised);

    let statusCode: number | undefined;
    let error: string | undefined;

    try {
      const response = await this.#fetch(row.url, {
        method: 'POST',
        headers,
        body: serialised,
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
      statusCode = response.status;
      if (!response.ok) error = `HTTP ${response.status}`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    const attempts = row.attempts + 1;

    if (error === undefined) {
      await this.#db.query(
        `UPDATE webhook_deliveries
            SET status = 'delivered', attempts = $2, delivered_at = now(), last_error = NULL
          WHERE id = $1`,
        [row.id, attempts],
      );
      return { id: row.id, status: 'delivered', attempts, statusCode };
    }

    if (attempts >= this.#maxAttempts) {
      await this.#db.query(
        `UPDATE webhook_deliveries
            SET status = 'dead', attempts = $2, last_error = $3
          WHERE id = $1`,
        [row.id, attempts, error],
      );
      this.#logger?.warn({ deliveryId: row.id, url: row.url, attempts, error }, 'webhook dead-lettered');
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

  /** Poll for due deliveries until stopped. */
  async start(intervalMs = 5_000): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#stopping = false;

    while (!this.#stopping) {
      try {
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
