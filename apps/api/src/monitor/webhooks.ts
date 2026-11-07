import type { Log } from '../core/logger.js';
import { retryDelayMs, WEBHOOK_MAX_ATTEMPTS } from '../webhooks/deliveries.js';
import { signPayload } from '../webhooks/signature.js';
import { assertPublicTarget, BlockedTargetError } from '../core/webhook-target.js';
import { pinnedFetch } from '../core/pinned-fetch.js';
import type { DeliveryRecord, MonitorStore } from './store.js';


export { signPayload };

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number }>;

export const postWebhook: FetchLike = async (url, init) => {
  await assertPublicTarget(url);
  const response = await pinnedFetch(url, { ...init, redirect: 'manual' });
  await response.body?.cancel().catch(() => undefined);
  return { status: response.status };
};

export function describeFailure(error: unknown): string {
  if (error instanceof BlockedTargetError) return `blocked: ${error.message}`;
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  return 'unreachable';
}

export interface DispatcherOptions {
  store: MonitorStore;
  fetch?: FetchLike | undefined;
  defaultSecret?: string | undefined;
  maxAttempts?: number | undefined;
  tickMs?: number | undefined;
  batch?: number | undefined;
  requestTimeoutMs?: number | undefined;
  logger?: Log | undefined;
  now?: (() => Date) | undefined;
}

export interface DeliveryAttempt {
  id: number;
  outcome: 'delivered' | 'retry' | 'dead';
  status: number | null;
}

export class WebhookDispatcher {
  readonly #store: MonitorStore;
  readonly #fetch: FetchLike;
  readonly #defaultSecret: string | undefined;
  readonly #maxAttempts: number;
  readonly #tickMs: number;
  readonly #batch: number;
  readonly #timeoutMs: number;
  readonly #logger: Log | undefined;
  readonly #now: () => Date;
  #timer: NodeJS.Timeout | undefined;
  #ticking = false;

  constructor(options: DispatcherOptions) {
    this.#store = options.store;
    this.#fetch = options.fetch ?? postWebhook;
    this.#defaultSecret = options.defaultSecret;
    this.#maxAttempts = options.maxAttempts ?? WEBHOOK_MAX_ATTEMPTS;
    this.#tickMs = options.tickMs ?? 5_000;
    this.#batch = options.batch ?? 20;
    this.#timeoutMs = options.requestTimeoutMs ?? 15_000;
    this.#logger = options.logger;
    this.#now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.tick(), this.#tickMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async tick(): Promise<DeliveryAttempt[]> {
    if (this.#ticking) return [];
    this.#ticking = true;
    try {
      const lease = this.#batch * this.#timeoutMs + 30_000;
      const due = await this.#store.claimDeliveries(this.#now(), this.#batch, lease);
      const results: DeliveryAttempt[] = [];
      for (const delivery of due) {
        results.push(await this.#attempt(delivery));
      }
      return results;
    } catch (error) {
      this.#logger?.error({ error }, 'webhook dispatcher tick failed');
      return [];
    } finally {
      this.#ticking = false;
    }
  }

  async #attempt(delivery: DeliveryRecord): Promise<DeliveryAttempt> {
    const monitor = await this.#store.get(delivery.monitorId);
    const secret = monitor?.webhook?.secret ?? this.#defaultSecret;
    const extraHeaders = monitor?.webhook?.headers ?? {};

    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(this.#now().getTime() / 1000);
    const headers: Record<string, string> = {
      ...extraHeaders,
      'content-type': 'application/json',
      'user-agent': 'Helix-Webhooks/0.1',
      'helix-event': delivery.eventType,
      'helix-delivery-id': String(delivery.id),
      'helix-monitor-id': delivery.monitorId,
    };
    if (secret) headers['helix-signature'] = signPayload(secret, timestamp, body);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

    let status: number | null = null;
    let error: string | undefined;
    let blocked = false;
    try {
      const response = await this.#fetch(delivery.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      status = response.status;
      if (status < 200 || status >= 300) error = `HTTP ${status}`;
    } catch (caught) {
      error = describeFailure(caught);
      blocked = caught instanceof BlockedTargetError;
    } finally {
      clearTimeout(timer);
    }

    if (!error) {
      await this.#store.markDelivered(delivery.id, status);
      return { id: delivery.id, outcome: 'delivered', status };
    }

    const attempts = delivery.attempts + 1;

    if (blocked || attempts >= this.#maxAttempts) {
      await this.#store.markDead(delivery.id, attempts, error, status);
      this.#logger?.warn({ deliveryId: delivery.id, url: delivery.url, error }, 'webhook dead-lettered');
      return { id: delivery.id, outcome: 'dead', status };
    }

    const nextRetryAt = new Date(this.#now().getTime() + retryDelayMs(attempts));
    await this.#store.markRetry(delivery.id, attempts, nextRetryAt, error, status);
    return { id: delivery.id, outcome: 'retry', status };
  }
}
