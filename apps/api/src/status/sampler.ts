import type { Pool } from 'pg';
import type { Log } from '../core/logger.js';
import { runServiceChecks, type ServiceCheckDeps } from './checks.js';

export interface SamplerOptions extends ServiceCheckDeps {
  pool: Pool;
  intervalMs?: number;
  retentionDays?: number;
  logger?: Log;
}

const RETENTION_DAYS = 90;

/**
 * Runs the same checks `/health` runs, once a minute, and keeps a rolling
 * 90-day history for `/status/history`. A DB outage is not fatal to the
 * sampler itself — it just has nowhere to write this tick, so it logs once
 * and tries again next tick rather than crashing the process over a page
 * nobody has to see immediately.
 */
export class StatusSampler {
  readonly #deps: ServiceCheckDeps;
  readonly #pool: Pool;
  readonly #intervalMs: number;
  readonly #retentionDays: number;
  readonly #logger: Log | undefined;
  #timer: NodeJS.Timeout | undefined;
  #loggedFailure = false;

  constructor(options: SamplerOptions) {
    this.#deps = options;
    this.#pool = options.pool;
    this.#intervalMs = options.intervalMs ?? 60_000;
    this.#retentionDays = options.retentionDays ?? RETENTION_DAYS;
    this.#logger = options.logger;
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.tick(), this.#intervalMs);
    this.#timer.unref();
    void this.tick();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async tick(): Promise<void> {
    try {
      const services = await runServiceChecks(this.#deps);
      const client = await this.#pool.connect();
      try {
        await client.query('BEGIN');
        for (const [service, result] of Object.entries(services)) {
          await client.query(
            'INSERT INTO uptime_samples (service, ok, latency_ms) VALUES ($1, $2, $3)',
            [service, result.status !== 'unhealthy', result.latencyMs],
          );
        }
        await client.query(
          `DELETE FROM uptime_samples WHERE sampled_at < now() - ($1 || ' days')::interval`,
          [this.#retentionDays],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      this.#loggedFailure = false;
    } catch (error) {
      if (!this.#loggedFailure) {
        this.#logger?.error({ error }, 'status sampler could not write this tick — retrying next tick');
        this.#loggedFailure = true;
      }
    }
  }
}
