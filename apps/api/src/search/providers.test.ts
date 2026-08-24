import { describe, expect, it } from 'vitest';
import {
  applyOperators,
  createSearchProvider,
  freshnessToTbs,
  SerperProvider,
} from './providers.js';

describe('applyOperators', () => {
  const base = { query: 'web scraping', limit: 10, sources: ['web'] as const };

  it('leaves a plain query alone', () => {
    expect(applyOperators({ ...base, sources: ['web'] })).toBe('web scraping');
  });

  it('adds a bare site filter for one domain', () => {
    const result = applyOperators({
      ...base,
      sources: ['web'],
      includeDomains: ['example.com'],
    });

    expect(result).toBe('web scraping site:example.com');
  });

  it('groups several domains so the OR binds correctly', () => {
    // Without the parentheses the OR would apply to the query terms too.
    const result = applyOperators({
      ...base,
      sources: ['web'],
      includeDomains: ['a.com', 'b.com'],
    });

    expect(result).toBe('web scraping (site:a.com OR site:b.com)');
  });

  it('negates excluded domains individually', () => {
    const result = applyOperators({
      ...base,
      sources: ['web'],
      excludeDomains: ['spam.com', 'ads.com'],
    });

    expect(result).toBe('web scraping -site:spam.com -site:ads.com');
  });
});

describe('freshnessToTbs', () => {
  it('maps a single unit without a redundant 1', () => {
    // Google expects `qdr:d`, not `qdr:d1`.
    expect(freshnessToTbs('1d')).toBe('qdr:d');
    expect(freshnessToTbs('1w')).toBe('qdr:w');
  });

  it('keeps the count for multiples', () => {
    expect(freshnessToTbs('7d')).toBe('qdr:d7');
    expect(freshnessToTbs('24h')).toBe('qdr:h24');
  });

  it('ignores anything it cannot parse', () => {
    expect(freshnessToTbs('last tuesday')).toBeUndefined();
    expect(freshnessToTbs('')).toBeUndefined();
    expect(freshnessToTbs(undefined)).toBeUndefined();
  });
});

describe('provider configuration', () => {
  it('reports itself unconfigured without a key', () => {
    expect(new SerperProvider(undefined).configured()).toBe(false);
    expect(new SerperProvider('key').configured()).toBe(true);
  });

  it('refuses to search without a key rather than returning nothing', async () => {
    // Silently returning zero results would look like "the web has no answer".
    await expect(
      new SerperProvider(undefined).search({ query: 'x', limit: 5, sources: ['web'] }),
    ).rejects.toThrow(/SERPER_API_KEY/);
  });

  it('builds the provider named in configuration', () => {
    expect(createSearchProvider('serper', { SERPER_API_KEY: 'k' })?.name).toBe('serper');
    expect(createSearchProvider('serpapi', { SERPAPI_KEY: 'k' })?.name).toBe('serpapi');
    expect(createSearchProvider('nonesuch', {})).toBeUndefined();
  });
});
