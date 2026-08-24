/**
 * Adaptive per-host politeness.
 *
 * AIMD, borrowed from TCP congestion control: ramp concurrency while a host
 * stays healthy, and cut it hard the moment it complains. Fast on hosts that
 * tolerate it, self-correcting on hosts that do not — without imposing a fixed
 * global slowdown on everyone to protect the weakest server.
 *
 * The alternative designs are both worse. A fixed low limit is slow everywhere
 * and still too fast for a struggling host. A fixed high limit gets users
 * IP-banned and earns the tool a reputation it cannot shed.
 */

export interface PolitenessOptions {
  /** Concurrency at the start, before anything is known about the host. */
  initialConcurrency?: number | undefined;
  maxConcurrency?: number | undefined;
  minConcurrency?: number | undefined;
  /** Fixed delay between requests, from `Crawl-delay`. Overrides adaptation. */
  fixedDelayMs?: number | undefined;
  /** Latency multiple over the rolling median that counts as degradation. */
  latencyDegradationFactor?: number | undefined;
}

interface HostState {
  concurrency: number;
  inFlight: number;
  /** Earliest time the next request to this host may start. */
  nextAvailableAt: number;
  recentLatencies: number[];
  consecutiveSuccesses: number;
  fixedDelayMs: number | undefined;
  backoffUntil: number;
}

const DEFAULTS = {
  initialConcurrency: 4,
  maxConcurrency: 16,
  minConcurrency: 1,
  latencyDegradationFactor: 3,
  /** Successes needed at the current level before trying one more. */
  rampAfterSuccesses: 8,
  latencyWindow: 20,
} as const;

export interface RequestOutcome {
  statusCode?: number | undefined;
  latencyMs: number;
  retryAfterSeconds?: number | undefined;
}

/** Options after defaults are applied — every field is settled except the delay. */
interface ResolvedOptions {
  initialConcurrency: number;
  maxConcurrency: number;
  minConcurrency: number;
  latencyDegradationFactor: number;
  fixedDelayMs: number | undefined;
}

export class PolitenessController {
  readonly #hosts = new Map<string, HostState>();
  readonly #options: ResolvedOptions;

  constructor(options: PolitenessOptions = {}) {
    this.#options = {
      initialConcurrency: options.initialConcurrency ?? DEFAULTS.initialConcurrency,
      maxConcurrency: options.maxConcurrency ?? DEFAULTS.maxConcurrency,
      minConcurrency: options.minConcurrency ?? DEFAULTS.minConcurrency,
      latencyDegradationFactor:
        options.latencyDegradationFactor ?? DEFAULTS.latencyDegradationFactor,
      fixedDelayMs: options.fixedDelayMs,
    };
  }

  #stateFor(host: string): HostState {
    let state = this.#hosts.get(host);
    if (!state) {
      state = {
        concurrency: this.#options.initialConcurrency,
        inFlight: 0,
        nextAvailableAt: 0,
        recentLatencies: [],
        consecutiveSuccesses: 0,
        fixedDelayMs: this.#options.fixedDelayMs,
        backoffUntil: 0,
      };
      this.#hosts.set(host, state);
    }
    return state;
  }

  /** Apply a `Crawl-delay` directive. A site's stated wish wins over adaptation. */
  setCrawlDelay(host: string, seconds: number): void {
    const state = this.#stateFor(host);
    state.fixedDelayMs = seconds * 1000;
    // A host asking to be paced is not a host to run parallel requests against.
    state.concurrency = 1;
  }

  /** Whether a request to this host may start now, and if not, when. */
  tryAcquire(host: string, now = Date.now()): { allowed: boolean; waitMs: number } {
    const state = this.#stateFor(host);

    if (now < state.backoffUntil) {
      return { allowed: false, waitMs: state.backoffUntil - now };
    }

    if (state.inFlight >= state.concurrency) {
      return { allowed: false, waitMs: 50 };
    }

    if (now < state.nextAvailableAt) {
      return { allowed: false, waitMs: state.nextAvailableAt - now };
    }

    state.inFlight++;
    if (state.fixedDelayMs !== undefined) {
      state.nextAvailableAt = now + state.fixedDelayMs;
    }

    return { allowed: true, waitMs: 0 };
  }

  /** Report how a request went, and adjust. */
  release(host: string, outcome: RequestOutcome, now = Date.now()): void {
    const state = this.#stateFor(host);
    state.inFlight = Math.max(0, state.inFlight - 1);

    const status = outcome.statusCode ?? 0;

    // An explicit rate-limit signal is not a hint to interpret. Obey it.
    if (status === 429 || status === 503) {
      state.concurrency = this.#options.minConcurrency;
      state.consecutiveSuccesses = 0;

      const retryAfterMs = (outcome.retryAfterSeconds ?? 0) * 1000;
      // Without a Retry-After, back off for a second — long enough to matter,
      // short enough not to stall a crawl on one unlucky response.
      state.backoffUntil = now + (retryAfterMs > 0 ? retryAfterMs : 1_000);
      return;
    }

    if (status >= 500) {
      // Multiplicative decrease: the host is struggling, so halve the pressure.
      state.concurrency = Math.max(
        this.#options.minConcurrency,
        Math.floor(state.concurrency / 2),
      );
      state.consecutiveSuccesses = 0;
      return;
    }

    state.recentLatencies.push(outcome.latencyMs);
    if (state.recentLatencies.length > DEFAULTS.latencyWindow) {
      state.recentLatencies.shift();
    }

    // Rising latency is a host asking for less, less explicitly than a 429.
    if (this.#latencyDegraded(state, outcome.latencyMs)) {
      state.concurrency = Math.max(
        this.#options.minConcurrency,
        Math.floor(state.concurrency / 2),
      );
      state.consecutiveSuccesses = 0;
      return;
    }

    // Additive increase: one more slot, only after sustained good behaviour.
    state.consecutiveSuccesses++;
    if (
      state.consecutiveSuccesses >= DEFAULTS.rampAfterSuccesses &&
      state.concurrency < this.#options.maxConcurrency &&
      state.fixedDelayMs === undefined
    ) {
      state.concurrency++;
      state.consecutiveSuccesses = 0;
    }
  }

  #latencyDegraded(state: HostState, latencyMs: number): boolean {
    // Needs a baseline before it can call anything a regression.
    if (state.recentLatencies.length < 5) return false;

    const sorted = [...state.recentLatencies].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? latencyMs;

    // A median near zero would make any latency look like a spike.
    if (median < 50) return false;

    return latencyMs > median * this.#options.latencyDegradationFactor;
  }

  concurrencyFor(host: string): number {
    return this.#stateFor(host).concurrency;
  }

  inFlightFor(host: string): number {
    return this.#stateFor(host).inFlight;
  }

  stats(): { hosts: number; totalInFlight: number } {
    let totalInFlight = 0;
    for (const state of this.#hosts.values()) totalInFlight += state.inFlight;
    return { hosts: this.#hosts.size, totalInFlight };
  }
}
