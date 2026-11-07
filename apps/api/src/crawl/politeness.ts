
export interface PolitenessOptions {
  initialConcurrency?: number | undefined;
  maxConcurrency?: number | undefined;
  minConcurrency?: number | undefined;
  fixedDelayMs?: number | undefined;
  latencyDegradationFactor?: number | undefined;
  blockBackoffMs?: number | undefined;
  maxHosts?: number | undefined;
}

interface HostState {
  concurrency: number;
  inFlight: number;
  nextAvailableAt: number;
  recentLatencies: number[];
  consecutiveSuccesses: number;
  fixedDelayMs: number | undefined;
  backoffUntil: number;
  probation: number;
  blocks: number;
}

const DEFAULTS = {
  initialConcurrency: 4,
  maxConcurrency: 16,
  minConcurrency: 1,
  latencyDegradationFactor: 3,
  rampAfterSuccesses: 8,
  latencyWindow: 20,
  blockBackoffMs: 30_000,
  probationSuccesses: 20,
} as const;

export interface RequestOutcome {
  statusCode?: number | undefined;
  latencyMs: number;
  retryAfterSeconds?: number | undefined;
  blocked?: boolean | undefined;
}

interface ResolvedOptions {
  initialConcurrency: number;
  maxConcurrency: number;
  minConcurrency: number;
  latencyDegradationFactor: number;
  blockBackoffMs: number;
  fixedDelayMs: number | undefined;
  maxHosts: number | undefined;
}

export class PolitenessController {
  readonly #hosts = new Map<string, HostState>();
  readonly #options: ResolvedOptions;

  constructor(options: PolitenessOptions = {}) {
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
      maxHosts: options.maxHosts,
    };
  }

  #evictIdleHost(now: number): void {
    const max = this.#options.maxHosts;
    if (max === undefined || this.#hosts.size < max) return;
    for (const [host, state] of this.#hosts) {
      if (state.inFlight === 0 && state.backoffUntil <= now) {
        this.#hosts.delete(host);
        return;
      }
    }
  }

  #stateFor(host: string): HostState {
    let state = this.#hosts.get(host);
    if (!state) {
      this.#evictIdleHost(Date.now());
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

  setCrawlDelay(host: string, seconds: number): void {
    const state = this.#stateFor(host);
    state.fixedDelayMs = seconds * 1000;
    state.concurrency = 1;
  }

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

  release(host: string, outcome: RequestOutcome, now = Date.now()): void {
    const state = this.#stateFor(host);
    state.inFlight = Math.max(0, state.inFlight - 1);

    const status = outcome.statusCode ?? 0;

    if (outcome.blocked) {
      state.concurrency = this.#options.minConcurrency;
      state.consecutiveSuccesses = 0;
      state.probation = DEFAULTS.probationSuccesses;
      state.blocks++;

      const retryAfterMs = (outcome.retryAfterSeconds ?? 0) * 1000;
      state.backoffUntil = now + Math.max(retryAfterMs, this.#options.blockBackoffMs);
      return;
    }

    if (status === 429 || status === 503) {
      state.concurrency = this.#options.minConcurrency;
      state.consecutiveSuccesses = 0;

      const retryAfterMs = (outcome.retryAfterSeconds ?? 0) * 1000;
      state.backoffUntil = now + (retryAfterMs > 0 ? retryAfterMs : 1_000);
      return;
    }

    if (status >= 500) {
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

    if (this.#latencyDegraded(state, outcome.latencyMs)) {
      state.concurrency = Math.max(
        this.#options.minConcurrency,
        Math.floor(state.concurrency / 2),
      );
      state.consecutiveSuccesses = 0;
      return;
    }

    state.consecutiveSuccesses++;

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
    if (state.recentLatencies.length < 5) return false;

    const sorted = [...state.recentLatencies].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? latencyMs;

    if (median < 50) return false;

    return latencyMs > median * this.#options.latencyDegradationFactor;
  }

  concurrencyFor(host: string): number {
    return this.#stateFor(host).concurrency;
  }

  inFlightFor(host: string): number {
    return this.#stateFor(host).inFlight;
  }

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
