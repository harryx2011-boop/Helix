import type { SearchHit, SearchQuery } from './providers.js';

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
    if (hits.length === 0) return;
    if (this.#entries.size >= 1000) {
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
