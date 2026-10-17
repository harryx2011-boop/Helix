import {
  PolitenessController,
  type RequestOutcome,
} from "../crawl/politeness.js";
import { siteOf } from "../crawl/url.js";

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
 */
const ROUTE_POLITENESS = { blockBackoffMs: 0 } as const;

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
   */
  async run<T>(
    url: string,
    fn: () => Promise<T>,
    outcomeOf?: (
      value: T,
    ) => Pick<RequestOutcome, "statusCode" | "blocked" | "retryAfterSeconds">,
  ): Promise<T> {
    const host = siteOf(url);
    // An unparseable URL has no host to pace. The route's own guard rejects it
    // moments later; pacing it under the key "undefined" would only group
    // unrelated failures together.
    if (!host) return fn();

    const acquired = await this.#acquire(host);
    const started = Date.now();

    try {
      const value = await fn();
      if (acquired) {
        this.#politeness.release(host, {
          latencyMs: Date.now() - started,
          ...outcomeOf?.(value),
        });
      }
      return value;
    } catch (error) {
      // A throw here is this instance failing, not the host rate-limiting us,
      // so the slot is returned without a verdict: nothing was learned about
      // how fast the host wants to be asked.
      if (acquired)
        this.#politeness.release(host, { latencyMs: Date.now() - started });
      throw error;
    }
  }

  /** True when a slot was taken and must be released; false when the wait ran out. */
  async #acquire(host: string): Promise<boolean> {
    const deadline = Date.now() + this.#maxWaitMs;

    for (;;) {
      const { allowed, waitMs } = this.#politeness.tryAcquire(host);
      if (allowed) return true;

      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(waitMs || POLL_MS, remaining)),
      );
    }
  }

  stats(): ReturnType<PolitenessController["stats"]> {
    return this.#politeness.stats();
  }
}

/**
 * The instance's one gate. Shared on purpose: two routes pacing a host
 * separately is the same as not pacing it.
 */
export const hostGate = new HostGate();
