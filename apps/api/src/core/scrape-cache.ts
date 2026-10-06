/**
 * Recent scrape results for `maxAge`. The caller states how stale an answer it
 * accepts; anything older is fetched again.
 */
export class ScrapeCache<T> {
  readonly #maxEntries: number;
  readonly #now: () => number;
  // Map keeps insertion order, so the first key is the oldest entry.
  readonly #entries = new Map<string, { value: T; at: number }>();

  constructor(options: { maxEntries?: number; now?: () => number } = {}) {
    this.#maxEntries = options.maxEntries ?? 500;
    this.#now = options.now ?? Date.now;
  }

  get(key: string, maxAgeMs: number): { value: T; ageMs: number } | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    const ageMs = this.#now() - entry.at;
    return ageMs <= maxAgeMs ? { value: entry.value, ageMs } : undefined;
  }

  set(key: string, value: T): void {
    this.#entries.delete(key);
    this.#entries.set(key, { value, at: this.#now() });
    if (this.#entries.size > this.#maxEntries) this.#entries.delete(this.#entries.keys().next().value!);
  }
}

// ponytail: process-local and entry-capped, not byte-capped; move to Postgres or cap bytes if large pages crowd memory.
export const scrapeCache = new ScrapeCache<Record<string, unknown>>();
