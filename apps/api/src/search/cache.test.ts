import { describe, expect, it } from 'vitest';
import { SearchCache } from './cache.js';
import type { SearchHit, SearchQuery } from './providers.js';

const hits: SearchHit[] = [{ title: 't', url: 'https://a.test', position: 1, source: 'web' }];
const base: SearchQuery = { query: 'Web Scraping', limit: 5, sources: ['web'] };

describe('SearchCache', () => {
  it('returns nothing when disabled', () => {
    const cache = new SearchCache(0);
    cache.set(base, hits);
    expect(cache.get(base)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('serves a hit inside the window and expires it after', () => {
    let now = 1000;
    const cache = new SearchCache(500, () => now);
    cache.set(base, hits);

    now = 1400;
    expect(cache.get(base)).toBe(hits);

    now = 1500;
    expect(cache.get(base)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('never stores an empty hit list', () => {
    const cache = new SearchCache(60_000);
    cache.set(base, []);
    expect(cache.get(base)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('keys on the full query, not just the text', () => {
    const cache = new SearchCache(60_000);
    cache.set(base, hits);

    expect(cache.get({ ...base, country: 'us' })).toBeUndefined();
    expect(cache.get({ ...base, lang: 'en' })).toBeUndefined();
    expect(cache.get({ ...base, tbs: 'qdr:m' })).toBeUndefined();
    expect(cache.get({ ...base, limit: 6 })).toBeUndefined();
  });

  it('normalises case and whitespace of the query text', () => {
    const cache = new SearchCache(60_000);
    cache.set(base, hits);
    expect(cache.get({ ...base, query: '  web scraping ' })).toBe(hits);
  });
});
