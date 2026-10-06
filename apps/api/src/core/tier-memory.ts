import type { Tier } from './escalation.js';

/**
 * Per-host floor for `tier: auto`: the tier a host last served a page at after
 * blocking a lower one. A repeat visit starts there instead of earning the same
 * block again, which also spares the IP's reputation the bot-scored first hop.
 *
 * Only block-driven climbs are learned. A climb for missing content is a fact
 * about one page (an SPA route), not about the host's bot wall.
 */
export class TierMemory {
  readonly #ttlMs: number;
  readonly #maxHosts: number;
  readonly #now: () => number;
  // Map keeps insertion order, so the first key is the oldest entry.
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

// ponytail: process-local, so a restart relearns each host once; persist to Postgres if that cost shows up.
export const tierMemory = new TierMemory();
