import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyOperators,
  createSearchProvider,
  freshnessToTbs,
  resolveTbs,
  SearxngProvider,
  SerperProvider,
  tbsToSearxngRange,
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

describe('resolveTbs', () => {
  it('prefers an explicit tbs over freshness', () => {
    expect(resolveTbs({ query: 'x', limit: 1, sources: ['web'], tbs: 'qdr:y', freshness: '1d' })).toBe('qdr:y');
    expect(resolveTbs({ query: 'x', limit: 1, sources: ['web'], freshness: '7d' })).toBe('qdr:d7');
    expect(resolveTbs({ query: 'x', limit: 1, sources: ['web'] })).toBeUndefined();
  });
});

describe('tbsToSearxngRange', () => {
  it('rounds Google windows up to the SearXNG range that contains them', () => {
    expect(tbsToSearxngRange('qdr:h')).toBe('day');
    expect(tbsToSearxngRange('qdr:d')).toBe('day');
    expect(tbsToSearxngRange('qdr:d7')).toBe('month');
    expect(tbsToSearxngRange('qdr:w')).toBe('month');
    expect(tbsToSearxngRange('qdr:m')).toBe('month');
    expect(tbsToSearxngRange('qdr:m3')).toBe('year');
    expect(tbsToSearxngRange('qdr:y')).toBe('year');
    expect(tbsToSearxngRange(undefined)).toBeUndefined();
    expect(tbsToSearxngRange('nonsense')).toBeUndefined();
  });
});

describe('SearxngProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('is unconfigured without a URL and refuses to search', async () => {
    expect(new SearxngProvider(undefined).configured()).toBe(false);
    expect(new SearxngProvider('   ').configured()).toBe(false);
    await expect(
      new SearxngProvider(undefined).search({ query: 'x', limit: 5, sources: ['web'] }),
    ).rejects.toThrow(/SEARXNG_URL/);
  });

  it('queries the JSON API with category, locale and time range and maps the rows', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          results: [
            { url: 'https://a.test/1', title: 'A', content: 'first', publishedDate: '2026-01-02' },
            { url: 'https://b.test/2', title: 'B', content: '' },
            { title: 'no url' },
            { url: 'https://c.test/3', title: 'C', content: 'over the limit' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const { hits, failures } = await new SearxngProvider('http://searxng:8080/').search({
      query: 'web scraping',
      limit: 2,
      sources: ['web'],
      lang: 'en',
      country: 'us',
      tbs: 'qdr:w',
      excludeDomains: ['spam.com'],
    });

    const url = new URL(calls[0]!);
    expect(url.origin + url.pathname).toBe('http://searxng:8080/search');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('categories')).toBe('general');
    expect(url.searchParams.get('language')).toBe('en-US');
    expect(url.searchParams.get('time_range')).toBe('month');
    expect(url.searchParams.get('q')).toBe('web scraping -site:spam.com');

    expect(failures).toEqual([]);
    expect(hits).toEqual([
      { title: 'A', url: 'https://a.test/1', snippet: 'first', position: 1, source: 'web', publishedAt: '2026-01-02', imageUrl: undefined },
      { title: 'B', url: 'https://b.test/2', snippet: undefined, position: 2, source: 'web', publishedAt: undefined, imageUrl: undefined },
    ]);
  });

  it('reports a refused JSON format as a source failure, not as no results', async () => {
    globalThis.fetch = vi.fn(async () => new Response('forbidden', { status: 403 })) as typeof fetch;
    const result = await new SearxngProvider('http://searxng:8080').search({ query: 'x', limit: 5, sources: ['web'] });

    expect(result.hits).toEqual([]);
    expect(result.failures).toEqual([
      { source: 'web', message: expect.stringMatching(/HTTP 403.*search\.formats/) },
    ]);
  });

  it('reports an unreachable instance as a source failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const result = await new SearxngProvider('http://searxng:8080').search({ query: 'x', limit: 5, sources: ['web'] });

    expect(result.hits).toEqual([]);
    expect(result.failures).toEqual([{ source: 'web', message: 'searxng request for web fetch failed' }]);
  });

  it('keeps the sources that answered when another one fails', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('categories=news')
        ? new Response('down', { status: 502 })
        : new Response(JSON.stringify({ results: [{ url: 'https://a.test/1', title: 'A' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
    ) as typeof fetch;
    const result = await new SearxngProvider('http://searxng:8080').search({
      query: 'x',
      limit: 5,
      sources: ['web', 'news'],
    });

    expect(result.hits.map((h) => h.url)).toEqual(['https://a.test/1']);
    expect(result.failures).toEqual([{ source: 'news', message: 'searxng answered HTTP 502 for news' }]);
  });

  it('forwards the caller signal so an abandoned search stops at the backend', async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    globalThis.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      seen.push(init?.signal);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as typeof fetch;
    const controller = new AbortController();
    controller.abort(new Error('gone'));

    const result = await new SearxngProvider('http://searxng:8080').search(
      { query: 'x', limit: 5, sources: ['web'] },
      controller.signal,
    );

    expect(seen[0]?.aborted).toBe(true);
    expect(result.failures).toEqual([]);
  });
});

describe('createSearchProvider auto', () => {
  it('prefers SearXNG, then Serper, then SerpAPI, whichever has credentials', () => {
    expect(createSearchProvider('auto', { SEARXNG_URL: 'http://s', SERPER_API_KEY: 'k' })?.name).toBe('searxng');
    expect(createSearchProvider('auto', { SERPER_API_KEY: 'k', SERPAPI_KEY: 'k' })?.name).toBe('serper');
    expect(createSearchProvider('auto', { SERPAPI_KEY: 'k' })?.name).toBe('serpapi');
    expect(createSearchProvider('auto', {})).toBeUndefined();
  });

  it('builds a named SearXNG backend', () => {
    expect(createSearchProvider('searxng', { SEARXNG_URL: 'http://s' })?.name).toBe('searxng');
    expect(createSearchProvider('searxng', {})?.configured()).toBe(false);
  });
});
