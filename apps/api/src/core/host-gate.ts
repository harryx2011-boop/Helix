import {
  PolitenessController,
  type RequestOutcome,
} from "../crawl/politeness.js";
import { siteOf } from "../crawl/url.js";
import type { PipelineResult } from "./pipeline.js";

/**
 * Per-host pacing for the single-page routes.
 *
 * A crawl has always been paced: `PolitenessController` (AIMD, see its header)
 * has governed `/crawl` since it existed. `/scrape` and `/extract` had nothing,
 * which made the limit easy to walk around — twenty `/extract` URLs on one host,
 * or an agent firing `/scrape` in a loop, hit that host as fast as the pool
 * allowed. The host sees one tool either way, so the limit belongs to the
 * instance, not to the route: one controller, shared.
 *
 * What this class adds over the controller is only the waiting. The controller
 * answers "may I, and if not how long" and expects the caller to own the loop;
 * the crawl loop does that itself against its own frontier, and a route cannot.
 */

/**
 * How long a single request will wait for its turn before going anyway.
 *
 * ponytail: a courtesy ceiling, not a contract. A crawl can afford to wait out
 * a 30-second block backoff because nobody is watching it; a caller who asked
 * for one page cannot, and failing their request to protect a host they
 * explicitly named is the wrong trade for a single-user tool. Make it a hard
 * limit (refuse with 429 past the wait) if Helix ever serves more than its
 * operator.
 *
 * The cost of that trade, stated: a host that sent `Retry-After` longer than
 * this ceiling is asked again at once, for as long as its backoff lasts, while
 * a shorter one is waited out. Sitting through the ceiling first would not
 * change that, only make every call to the host 10 s slower.
 */
const DEFAULT_MAX_WAIT_MS = 10_000;

/** Polling step while a slot is held by someone else. */
const POLL_MS = 50;

/**
 * The controller a route gets: AIMD pacing without the absolute freeze.
 *
 * A block collapses the host's concurrency to one and holds it there through
 * probation — that is the pacing, and it survives here. What does not is the
 * 30-second wall-clock backoff: it is right for an unattended crawl, and wrong
 * for a caller sitting in front of the request, who would wait out the ceiling
 * and have it proceed anyway. A `Retry-After` the host actually sent is still
 * honoured, because that is the host speaking rather than this side guessing.
 *
 * Capped at 2,000 hosts, as `TierMemory` is: this controller lives as long as
 * the process, and one entry per host ever asked would otherwise only grow.
 */
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

  /**
   * Run `fn` under this host's limit, reporting the outcome back to the
   * controller so a 429 or a block actually slows the next call.
   *
   * `outcomeOf` reads the status and block verdict out of whatever `fn`
   * returns; without it the call counts as a plain success, which is right for
   * a caller that has no response to report.
   *
   * `signal` ends the wait early: a caller that has gone away should not keep
   * a queue position, and its request should never start.
   *
   * `fn` is told how long it waited, so a caller with a timeout can spend
   * only what is left of it rather than adding the wait on top.
   */
  async run<T>(
    url: string,
    fn: (waitedMs: number) => Promise<T>,
    outcomeOf?: (
      value: T,
    ) => Pick<RequestOutcome, "statusCode" | "blocked" | "retryAfterSeconds">,
    signal?: AbortSignal,
  ): Promise<T> {
    const host = siteOf(url);
    // An unparseable URL has no host to pace. The route's own guard rejects it
    // moments later; pacing it under the key "undefined" would only group
    // unrelated failures together.
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
      // Scored as a server error: a throw may be this instance failing, but it
      // may as well be the host dropping the connection, and scoring it as a
      // success would ramp a flapping endpoint up instead of down.
      if (acquired)
        this.#politeness.release(host, {
          latencyMs: Date.now() - started,
          statusCode: 500,
        });
      throw error;
    }
  }

  /** True when a slot was taken and must be released; false when the wait ran out. */
  async #acquire(host: string, signal?: AbortSignal): Promise<boolean> {
    const deadline = Date.now() + this.#maxWaitMs;

    for (;;) {
      signal?.throwIfAborted();
      const { allowed, waitMs } = this.#politeness.tryAcquire(host);
      if (allowed) return true;

      // A wait longer than the ceiling (a stated Retry-After, usually) ends in
      // going ahead anyway, so sitting through the ceiling first protects nothing.
      const remaining = deadline - Date.now();
      if (remaining <= 0 || waitMs > remaining) return false;

      await sleep(waitMs || POLL_MS, signal);
    }
  }

  stats(): ReturnType<PolitenessController["stats"]> {
    return this.#politeness.stats();
  }
}

/**
 * What a pipeline result tells the gate about the host.
 *
 * A failure with no status (a timeout, a dead host, DNS) is scored as a server
 * error: left without a status it would take the controller's success path
 * and ramp a host that is not answering up. A request the caller abandoned
 * says nothing about the host, so it keeps no status.
 */
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

/** Waits `ms`, or rejects with the signal's reason as soon as it aborts. */
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

/**
 * The instance's one gate. Shared on purpose: two routes pacing a host
 * separately is the same as not pacing it.
 */
export const hostGate = new HostGate();
