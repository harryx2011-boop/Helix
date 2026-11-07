import type { Tier } from './escalation.js';

export class TierMemory {
  readonly #ttlMs: number;
  readonly #maxHosts: number;
  readonly #now: () => number;
  readonly #hosts = new Map<string, { tier: Tier; at: number }>();

  constructor(options: { ttlMs?: number; maxHosts?: number; now?: () => number } = {}) {
    this.#ttlMs = options.ttlMs ?? 30 * 60_000;
    this.#maxHosts = options.maxHosts ?? 2_000;
    this.#now = options.now ?? Date.now;
  }

  floor(url: string): Tier | undefined {
    const host = hostOf(url);
    const entry = host ? this.#hosts.get(host) : undefined;
    if (!entry) return undefined;
    if (this.#now() - entry.at > this.#ttlMs) {
      this.#hosts.delete(host!);
      return undefined;
    }
    return entry.tier;
  }

  learn(url: string, tier: Tier): void {
    const host = hostOf(url);
    if (!host) return;
    this.#hosts.delete(host);
    this.#hosts.set(host, { tier, at: this.#now() });
    if (this.#hosts.size > this.#maxHosts) this.#hosts.delete(this.#hosts.keys().next().value!);
  }

  forget(url: string): void {
    const host = hostOf(url);
    if (host) this.#hosts.delete(host);
  }
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export const tierMemory = new TierMemory();
