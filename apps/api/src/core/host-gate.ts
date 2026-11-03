import {
  PolitenessController,
  type RequestOutcome,
} from "../crawl/politeness.js";
import { siteOf } from "../crawl/url.js";
import type { PipelineResult } from "./pipeline.js";


const DEFAULT_MAX_WAIT_MS = 10_000;

const POLL_MS = 50;

const ROUTE_POLITENESS = { blockBackoffMs: 0, maxHosts: 2_000 } as const;

export interface HostGateOptions {
  politeness?: PolitenessController | undefined;
  maxWaitMs?: number | undefined;
}

export class HostGate {
  readonly #politeness: PolitenessController;
  readonly #maxWaitMs: number;

  constructor(options: HostGateOptions = {}) {
    this.#politeness = options.politeness ?? new PolitenessController(ROUTE_POLITENESS);
    this.#maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  }

  async run<T>(
    url: string,
    fn: (waitedMs: number) => Promise<T>,
    outcomeOf?: (
      value: T,
    ) => Pick<RequestOutcome, "statusCode" | "blocked" | "retryAfterSeconds">,
    signal?: AbortSignal,
  ): Promise<T> {
    const host = siteOf(url);
    if (!host) return fn(0);

    const queued = Date.now();
    const acquired = await this.#acquire(host, signal);
    const started = Date.now();

    try {
      const value = await fn(started - queued);
      if (acquired) {
        this.#politeness.release(host, {
          latencyMs: Date.now() - started,
          ...outcomeOf?.(value),
        });
      }
      return value;
    } catch (error) {
      if (acquired)
        this.#politeness.release(host, {
          latencyMs: Date.now() - started,
          statusCode: 500,
        });
      throw error;
    }
  }

  async #acquire(host: string, signal?: AbortSignal): Promise<boolean> {
    const deadline = Date.now() + this.#maxWaitMs;

    for (;;) {
      signal?.throwIfAborted();
      const { allowed, waitMs } = this.#politeness.tryAcquire(host);
      if (allowed) return true;

      const remaining = deadline - Date.now();
      if (remaining <= 0 || waitMs > remaining) return false;

      await sleep(waitMs || POLL_MS, signal);
    }
  }

  stats(): ReturnType<PolitenessController["stats"]> {
    return this.#politeness.stats();
  }
}

export function gateOutcome(
  result: PipelineResult,
): Pick<RequestOutcome, "statusCode" | "blocked" | "retryAfterSeconds"> {
  if (result.success) return { statusCode: result.statusCode };

  const noResponse = result.statusCode === undefined && result.reason !== "aborted";
  return {
    statusCode: noResponse ? 500 : result.statusCode,
    blocked: result.reason === "blocked" || result.reason === "challenge",
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export const hostGate = new HostGate();
