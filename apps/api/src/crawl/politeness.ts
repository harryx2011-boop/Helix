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
 *
 * Four signals feed the decrease, and they are deliberately not equal. A 429 or
 * a `Retry-After` is the host stating a limit, so it collapses to the floor and
 * waits exactly as long as it was told. A block verdict from the classifier is
 * worse than a 429 — the host has stopped answering honestly rather than asking
 * for less — so it collapses AND holds down through the ramp, because ramping
 * back into an anti-bot system is how a crawl converts a soft block into a hard
 * ban. A 5xx and a latency spike are both weak evidence, so they halve.
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
  /** Pause after a block verdict, before this host is touched again. */
  blockBackoffMs?: number | undefined;
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
  /**
   * Successes still owed before the ramp is allowed to move again.
   *
   * A block is evidence about the identity as much as the rate, and the rate is
   * the only thing this class controls. Holding the ramp down buys the session
   * pool time to retire the identity that earned the block, instead of racing
   * it back up to the concurrency that triggered one.
   */
  probation: number;
  blocks: number;
}

const DEFAULTS = {
  initialConcurrency: 4,
  maxConcurrency: 16,
  minConcurrency: 1,
  latencyDegradationFactor: 3,
  /** Successes needed at the current level before trying one more. */
  rampAfterSuccesses: 8,
  latencyWindow: 20,
  /** A block costs far more than a 429, so the pause is an order longer. */
  blockBackoffMs: 30_000,
  /** Clean fetches owed after a block before the ramp may move again. */
  probationSuccesses: 20,
} as const;

export interface RequestOutcome {
  statusCode?: number | undefined;
  latencyMs: number;
  retryAfterSeconds?: number | undefined;
  /**
   * The classifier said this response was a challenge or a block.
   *
   * Distinct from the status code on purpose: a Cloudflare interstitial is
   * routinely served as 200, so status alone would read it as a healthy fetch
   * and ramp straight into the wall.
   */
  blocked?: boolean | undefined;
}

/** Options after defaults are applied — every field is settled except the delay. */
interface ResolvedOptions {
  initialConcurrency: number;
  maxConcurrency: number;
  minConcurrency: number;
  latencyDegradationFactor: number;
  blockBackoffMs: number;
  fixedDelayMs: number | undefined;
}

export class PolitenessController {
  readonly #hosts = new Map<string, HostState>();
  readonly #options: ResolvedOptions;

  constructor(options: PolitenessOptions = {}) {
    // The clamps are resolved once, here, rather than trusted at each use.
    // A caller passing minConcurrency above maxConcurrency (or an operator
    // lowering the ceiling under a floor set earlier) would otherwise leave
    // every later Math.max/Math.min pair disagreeing about which one wins, and
    // the adaptive loop would settle above a ceiling it was given to respect.
    const ceiling = Math.max(1, options.maxConcurrency ?? DEFAULTS.maxConcurrency);
    const floor = Math.min(ceiling, Math.max(1, options.minConcurrency ?? DEFAULTS.minConcurrency));

    this.#options = {
      initialConcurrency: Math.min(
        ceiling,
        Math.max(floor, options.initialConcurrency ?? DEFAULTS.initialConcurrency),
      ),
      maxConcurrency: ceiling,
      minConcurrency: floor,
      latencyDegradationFactor:
        options.latencyDegradationFactor ?? DEFAULTS.latencyDegradationFactor,
      blockBackoffMs: options.blockBackoffMs ?? DEFAULTS.blockBackoffMs,
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
        probation: 0,
        blocks: 0,
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

    // Checked before the status code, because a challenge page is routinely
    // served as 200 and reading the status first would score it as a success.
    if (outcome.blocked) {
      state.concurrency = this.#options.minConcurrency;
      state.consecutiveSuccesses = 0;
      state.probation = DEFAULTS.probationSuccesses;
      state.blocks++;

      // Retry-After still wins if the host sent one: it is the only number here
      // the host actually stated, and guessing longer than asked wastes the
      // crawl while guessing shorter is what earned the block.
      const retryAfterMs = (outcome.retryAfterSeconds ?? 0) * 1000;
      state.backoffUntil = now + Math.max(retryAfterMs, this.#options.blockBackoffMs);
      return;
    }

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

    // Probation is paid off by clean fetches before the ramp is even consulted,
    // so a host that blocked once stays at the floor through a long run of
    // successes rather than climbing back on the first eight.
    if (state.probation > 0) {
      state.probation--;
      return;
    }

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

  /** Whether this host is serving its post-block probation. */
  onProbation(host: string): boolean {
    return this.#stateFor(host).probation > 0;
  }

  stats(): { hosts: number; totalInFlight: number; blockedHosts: number; blocks: number } {
    let totalInFlight = 0;
    let blockedHosts = 0;
    let blocks = 0;
    for (const state of this.#hosts.values()) {
      totalInFlight += state.inFlight;
      blocks += state.blocks;
      if (state.blocks > 0) blockedHosts++;
    }
    return { hosts: this.#hosts.size, totalInFlight, blockedHosts, blocks };
  }
}
