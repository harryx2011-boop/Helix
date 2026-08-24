import type { Log } from '../core/logger.js';
import { nextRun } from './schedule.js';
import type { MonitorRecord, MonitorStore } from './store.js';

/**
 * The monitor scheduler.
 *
 * Due monitors live in Postgres (`next_check_at`), not in process memory, so
 * a restart picks up where it left off and two API processes share the work
 * without a broker. Cron parsing and "when next" come from croner; the tick
 * is a plain interval that asks the store what is due.
 */

export interface SchedulerOptions {
  store: MonitorStore;
  check: (monitor: MonitorRecord) => Promise<unknown>;
  /** Checks running at once across all monitors. */
  concurrency?: number | undefined;
  tickMs?: number | undefined;
  logger?: Log | undefined;
  now?: (() => Date) | undefined;
}

export class MonitorScheduler {
  readonly #store: MonitorStore;
  readonly #check: (monitor: MonitorRecord) => Promise<unknown>;
  readonly #concurrency: number;
  readonly #tickMs: number;
  readonly #logger: Log | undefined;
  readonly #now: () => Date;
  #timer: NodeJS.Timeout | undefined;
  #inFlight = 0;

  constructor(options: SchedulerOptions) {
    this.#store = options.store;
    this.#check = options.check;
    this.#concurrency = Math.max(1, options.concurrency ?? 2);
    this.#tickMs = options.tickMs ?? 15_000;
    this.#logger = options.logger;
    this.#now = options.now ?? (() => new Date());
  }

  get inFlight(): number {
    return this.#inFlight;
  }

  async start(): Promise<void> {
    if (this.#timer) return;
    await this.releaseStuck();
    this.#timer = setInterval(() => void this.tick(), this.#tickMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /**
   * A monitor whose claim was never released was mid-check when the process
   * died. Give it a next time again rather than leaving it silent forever.
   */
  async releaseStuck(): Promise<number> {
    const stuck = await this.#store.listStuck();
    for (const monitor of stuck) {
      await this.#store.update(monitor.id, { nextCheckAt: nextRun(monitor.schedule, this.#now()) });
    }
    if (stuck.length > 0) this.#logger?.info({ count: stuck.length }, 'released stuck monitors');
    return stuck.length;
  }

  /** Run every due check, up to the concurrency cap. Returns how many ran. */
  async tick(): Promise<number> {
    const slots = this.#concurrency - this.#inFlight;
    if (slots <= 0) return 0;

    let due: MonitorRecord[];
    try {
      due = await this.#store.claimDue(this.#now(), slots);
    } catch (error) {
      this.#logger?.error({ error }, 'monitor scheduler could not claim due monitors');
      return 0;
    }

    await Promise.all(due.map((monitor) => this.#run(monitor)));
    return due.length;
  }

  async #run(monitor: MonitorRecord): Promise<void> {
    this.#inFlight += 1;
    try {
      await this.#check(monitor);
    } catch (error) {
      this.#logger?.error({ error, monitorId: monitor.id }, 'monitor check threw');
      await this.#store
        .update(monitor.id, { lastError: error instanceof Error ? error.message : String(error), status: 'error' })
        .catch(() => undefined);
    } finally {
      this.#inFlight -= 1;
      // Whatever happened, the monitor gets its next slot. A paused or deleted
      // monitor is left alone: the update is a no-op for a deleted one and
      // `claimDue` ignores paused ones.
      const current = await this.#store.get(monitor.id).catch(() => undefined);
      if (current && current.status !== 'paused') {
        await this.#store
          .update(monitor.id, { nextCheckAt: nextRun(current.schedule, this.#now()) })
          .catch((error) => this.#logger?.error({ error, monitorId: monitor.id }, 'could not reschedule monitor'));
      }
    }
  }
}
