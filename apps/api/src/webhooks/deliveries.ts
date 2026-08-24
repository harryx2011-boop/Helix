/**
 * Webhook deliveries: what gets queued, and when it is retried.
 *
 * The queue is the `webhook_deliveries` table. Rows are at-least-once by
 * design, so every one carries a dedupe key and receivers are told to be
 * idempotent. Nothing here talks HTTP; the dispatcher does.
 */

export const WEBHOOK_EVENTS = ['started', 'page', 'changed', 'completed', 'failed'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string> | undefined;
  events?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface Queryable {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  jobId: string | null;
  monitorId: string | null;
  timestamp: string;
  data: unknown;
  metadata: Record<string, unknown> | null;
}

/** Whether the config subscribes to an event. No `events` list means all of them. */
export function wantsEvent(config: WebhookConfig, event: WebhookEvent): boolean {
  if (!config.events || config.events.length === 0) return true;
  return config.events.includes(event);
}

const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

/**
 * Exponential backoff: one minute, doubling, capped at six hours. Twenty
 * attempts span roughly three days, which is the window a receiver that is
 * down for a weekend needs. Not three retries over twenty minutes.
 */
export function retryDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
}

export interface EnqueueInput {
  config: WebhookConfig;
  event: WebhookEvent;
  jobId?: string | undefined;
  monitorId?: string | undefined;
  /** Disambiguates events of the same type within one job, e.g. the page URL. */
  key?: string | undefined;
  data: unknown;
}

export function dedupeKey(input: EnqueueInput): string {
  const owner = input.jobId ?? input.monitorId ?? 'none';
  return [owner, input.event, input.key ?? '', input.config.url].join('|');
}

/**
 * Queue one delivery. Returns false when the config does not subscribe to the
 * event or the row already exists — the queue is at-least-once and a resumed
 * crawl may try to re-emit an event it already emitted.
 */
export async function enqueueDelivery(db: Queryable, input: EnqueueInput): Promise<boolean> {
  if (!wantsEvent(input.config, input.event)) return false;

  const payload = {
    event: input.event,
    jobId: input.jobId ?? null,
    monitorId: input.monitorId ?? null,
    data: input.data,
    metadata: input.config.metadata ?? null,
    headers: input.config.headers ?? null,
  };

  const { rowCount } = await db.query(
    `INSERT INTO webhook_deliveries (job_id, monitor_id, url, event_type, payload, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      input.jobId ?? null,
      input.monitorId ?? null,
      input.config.url,
      input.event,
      JSON.stringify(payload),
      dedupeKey(input),
    ],
  );

  return (rowCount ?? 0) > 0;
}

/**
 * Drop delivered and dead rows older than the retention window. Dead letters
 * stay inspectable for as long as the results they refer to; after that the
 * table would only grow.
 */
export async function purgeSettledDeliveries(db: Queryable, olderThanHours: number): Promise<number> {
  const { rowCount } = await db.query(
    `DELETE FROM webhook_deliveries
      WHERE status IN ('delivered', 'dead')
        AND created_at < now() - ($1::int * interval '1 hour')`,
    [olderThanHours],
  );
  return rowCount ?? 0;
}
