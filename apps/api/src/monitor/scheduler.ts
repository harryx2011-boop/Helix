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
 *
 * A check outside the schedule (`POST /monitor/:id/check`) goes through the
 * same claim and the same in-flight budget, so one monitor never runs two
 * checks at once and a burst of manual checks cannot exceed the cap.
 */

export interface SchedulerOptions<T> {
  store: MonitorStore;
  check: (monitor: MonitorRecord) => Promise<T>;
  /** Checks running at once across all monitors. */
  concurrency?: number | undefined;
  tickMs?: number | undefined;
  /** A claim older than this with no check running is treated as a crash. */
  stuckAfterMs?: number | undefined;
  logger?: Log | undefined;
  now?: (() => Date) | undefined;
}

export type RunNowResult<T> =
  | { ok: true; outcome: T }
  | { ok: false; reason: 'not_found' | 'paused' | 'in_progress' | 'busy' };

export class MonitorScheduler<T = unknown> {
  readonly #store: MonitorStore;
  readonly #check: (monitor: MonitorRecord) => Promise<T>;
  readonly #concurrency: number;
  readonly #tickMs: number;
  readonly #stuckAfterMs: number;
  readonly #logger: Log | undefined;
  readonly #now: () => Date;
  #timer: NodeJS.Timeout | undefined;
  #inFlight = 0;

  constructor(options: SchedulerOptions<T>) {
    this.#store = options.store;
    this.#check = options.check;
    this.#concurrency = Math.max(1, options.concurrency ?? 2);
    this.#tickMs = options.tickMs ?? 15_000;
    this.#stuckAfterMs = options.stuckAfterMs ?? 30 * 60_000;
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
   * A monitor whose claim was never released was mid-check when its process
   * died. Give it a next time again rather than leaving it silent forever.
   * Only claims older than `stuckAfterMs` qualify: a fresh one belongs to a
   * check that is running right now, possibly in another process.
   */
  async releaseStuck(): Promise<number> {
    const before = new Date(this.#now().getTime() - this.#stuckAfterMs);
    const stuck = await this.#store.listStuck(before);
    for (const monitor of stuck) {
      await this.#store.update(monitor.id, { nextCheckAt: nextRun(monitor.schedule, this.#now()) });
    }
    if (stuck.length > 0) this.#logger?.info({ count: stuck.length }, 'released stuck monitors');
    return stuck.length;
  }

  /** Run every due check, up to the concurrency cap. Returns how many ran. */
  async tick(): Promise<number> {
    await this.releaseStuck().catch((error) => this.#logger?.error({ error }, 'could not release stuck monitors'));

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

  /** Check one monitor now, under the same claim and budget as the schedule. */
  async runNow(id: string): Promise<RunNowResult<T>> {
    const monitor = await this.#store.get(id);
    if (!monitor) return { ok: false, reason: 'not_found' };
    if (monitor.status === 'paused') return { ok: false, reason: 'paused' };
    if (this.#inFlight >= this.#concurrency) return { ok: false, reason: 'busy' };

    const claimed = await this.#store.claim(id, this.#now());
    if (!claimed) return { ok: false, reason: 'in_progress' };

    const outcome = await this.#run(claimed);
    if (outcome === undefined) throw new Error('monitor check threw');
    return { ok: true, outcome: outcome.value };
  }

  async #run(monitor: MonitorRecord): Promise<{ value: T } | undefined> {
    this.#inFlight += 1;
    let result: { value: T } | undefined;
    try {
      result = { value: await this.#check(monitor) };
    } catch (error) {
      this.#logger?.error({ error, monitorId: monitor.id }, 'monitor check threw');
      await this.#store
        .update(monitor.id, { lastError: error instanceof Error ? error.message : String(error), checkOutcome: 'error' })
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
    return result;
  }
}
