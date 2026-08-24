import type { SearchHit, SearchQuery } from './providers.js';

/**
 * Short-lived cache of backend hits, keyed on the full query. Identical
 * searches within the window reuse the ranked list instead of re-hitting the
 * backend; the pages themselves are always read fresh.
 */
export class SearchCache {
  readonly #ttlMs: number;
  readonly #entries = new Map<string, { hits: SearchHit[]; expiresAt: number }>();
  readonly #now: () => number;

  constructor(ttlMs: number, now: () => number = Date.now) {
    this.#ttlMs = Math.max(0, ttlMs);
    this.#now = now;
  }

  get(query: SearchQuery): SearchHit[] | undefined {
    if (this.#ttlMs === 0) return undefined;
    const key = SearchCache.key(query);
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry.hits;
  }

  set(query: SearchQuery, hits: SearchHit[]): void {
    if (this.#ttlMs === 0) return;
    // An empty list is not worth a slot: it is the shape a failed or degraded
    // backend call produces, and serving it for the whole window would hide a
    // recovery behind "no results".
    if (hits.length === 0) return;
    if (this.#entries.size >= 1000) {
      // Bounded: the oldest insertion goes first, which is close enough to LRU
      // for a cache measured in seconds.
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    this.#entries.set(SearchCache.key(query), { hits, expiresAt: this.#now() + this.#ttlMs });
  }

  get size(): number {
    return this.#entries.size;
  }

  static key(query: SearchQuery): string {
    return JSON.stringify([
      query.query.trim().toLowerCase(),
      query.limit,
      [...query.sources].sort(),
      query.lang ?? '',
      query.country ?? '',
      query.tbs ?? '',
      query.freshness ?? '',
      [...(query.includeDomains ?? [])].sort(),
      [...(query.excludeDomains ?? [])].sort(),
    ]);
  }
}
