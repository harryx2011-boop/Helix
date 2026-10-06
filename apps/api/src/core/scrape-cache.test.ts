import { describe, expect, it } from 'vitest';
import { ScrapeCache } from './scrape-cache.js';

describe('ScrapeCache', () => {
  it('returns an entry younger than maxAge', () => {
    let now = 0;
    const cache = new ScrapeCache<string>({ now: () => now });
    cache.set('k', 'v');
    now = 500;
    expect(cache.get('k', 1_000)).toEqual({ value: 'v', ageMs: 500 });
  });

  it('misses an entry older than maxAge', () => {
    let now = 0;
    const cache = new ScrapeCache<string>({ now: () => now });
    cache.set('k', 'v');
    now = 1_001;
    expect(cache.get('k', 1_000)).toBeUndefined();
  });

  it('evicts the oldest entry past its cap', () => {
    const cache = new ScrapeCache<string>({ maxEntries: 2 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(cache.get('a', 60_000)).toBeUndefined();
    expect(cache.get('c', 60_000)?.value).toBe('3');
  });
});
