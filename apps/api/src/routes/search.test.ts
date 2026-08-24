import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerSearch, mapWithLimit, type SearchRouteDeps } from './search.js';
import type { SearchHit, SearchProvider, SearchQuery } from '../search/providers.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';

const pipeline = vi.hoisted(() => ({ runPipeline: vi.fn() }));
vi.mock('../core/pipeline.js', () => ({ runPipeline: pipeline.runPipeline }));

function hit(url: string, position: number, source: SearchHit['source'] = 'web'): SearchHit {
  return { title: `Title ${position}`, url, snippet: `Snippet ${position}`, position, source };
}

function providerReturning(hits: SearchHit[] | ((query: SearchQuery) => SearchHit[])): SearchProvider & {
  search: ReturnType<typeof vi.fn>;
} {
  return {
    name: 'fake',
    configured: () => true,
    search: vi.fn(async (query: SearchQuery) => (typeof hits === 'function' ? hits(query) : hits)),
  };
}

function success(url: string) {
  return {
    success: true as const,
    content: {
      markdown: `# ${url}`,
      text: `text of ${url}`,
      title: 'Read title',
      language: 'en',
      links: ['https://example.com/a'],
      extractorUsed: 'trafilatura',
      contentHash: 'hash',
      rawHtml: '<html></html>',
    },
    tier: 'plain' as const,
    tiersAttempted: ['plain' as const],
    statusCode: 200,
    finalUrl: url,
    timingMs: 5,
  };
}

function failure(url: string) {
  return {
    success: false as const,
    url,
    reason: 'blocked' as const,
    detail: 'WAF said no',
    detectedBy: ['cloudflare-interstitial'],
    tiersAttempted: ['plain' as const, 'tls' as const],
    escalationAvailable: false,
    timingMs: 5,
  };
}

async function build(overrides: Partial<SearchRouteDeps> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  await registerSearch(app, {
    provider: providerReturning([hit('https://a.test/1', 1), hit('https://b.test/2', 2)]),
    fetchClient: {} as FetchClient,
    extractClient: {} as ExtractClient,
    ...overrides,
  });
  return app;
}

async function post(app: FastifyInstance, body: unknown) {
  const response = await app.inject({ method: 'POST', url: '/search', payload: body as object });
  return { status: response.statusCode, body: response.json() };
}

describe('POST /search', () => {
  beforeEach(() => {
    pipeline.runPipeline.mockReset();
    pipeline.runPipeline.mockImplementation(async (options: { url: string }) => success(options.url));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing query with the typed envelope', async () => {
    const app = await build();
    const { status, body } = await post(app, { limit: 5 });

    expect(status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('query');
    expect(body.requestId).toBeTypeOf('string');
  });

  it('rejects a malformed tbs filter', async () => {
    const app = await build();
    const { status, body } = await post(app, { query: 'x', tbs: 'past-month' });

    expect(status).toBe(400);
    expect(body.field).toBe('tbs');
  });

  it('caps limit at the operator ceiling', async () => {
    const app = await build({ maxResults: 10 });
    const { status, body } = await post(app, { query: 'x', limit: 11 });

    expect(status).toBe(400);
    expect(body.field).toBe('limit');
    expect(body.message).toContain('10');
  });

  it('answers 503 when no backend is configured, naming what to set', async () => {
    const app = await build({ provider: undefined });
    const { status, body } = await post(app, { query: 'x' });

    expect(status).toBe(503);
    expect(body.error).toBe('search_unavailable');
    expect(body.message).toContain('SEARXNG_URL');
  });

  it('answers 502 when the backend throws', async () => {
    const provider = providerReturning([]);
    provider.search.mockRejectedValueOnce(new Error('upstream down'));
    const app = await build({ provider });
    const { status, body } = await post(app, { query: 'x' });

    expect(status).toBe(502);
    expect(body.error).toBe('search_failed');
    expect(body.message).toBe('upstream down');
  });

  it('returns data.web with url, title, description when scrapeOptions is omitted', async () => {
    const app = await build();
    const { status, body } = await post(app, { query: 'x' });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.web).toEqual([
      expect.objectContaining({ url: 'https://a.test/1', title: 'Title 1', description: 'Snippet 1', position: 1 }),
      expect.objectContaining({ url: 'https://b.test/2', title: 'Title 2', description: 'Snippet 2', position: 2 }),
    ]);
    expect(body.data.web[0].markdown).toBeUndefined();
    expect(body.warnings).toEqual([]);
    expect(pipeline.runPipeline).not.toHaveBeenCalled();
  });

  it('defaults limit to 5 and forwards lang, country and tbs to the backend', async () => {
    const provider = providerReturning([]);
    const app = await build({ provider });
    await post(app, { query: 'x', lang: 'EN', country: 'US', tbs: 'qdr:m' });

    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'x', limit: 5, lang: 'en', country: 'us', tbs: 'qdr:m', sources: ['web'] }),
    );
  });

  it('expands category shorthands into operators', async () => {
    const provider = providerReturning([]);
    const app = await build({ provider });
    await post(app, { query: 'zod', categories: ['github'] });

    expect(provider.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'zod site:github.com' }));
  });

  it('warns rather than failing when the backend returns nothing', async () => {
    const app = await build({ provider: providerReturning([]) });
    const { status, body } = await post(app, { query: 'x' });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.web).toEqual([]);
    expect(body.warnings).toHaveLength(1);
  });

  it('reads every result when scrapeOptions is set', async () => {
    const app = await build();
    const { body } = await post(app, { query: 'x', scrapeOptions: { formats: ['markdown', 'links'] } });

    expect(pipeline.runPipeline).toHaveBeenCalledTimes(2);
    expect(body.data.web[0]).toMatchObject({
      url: 'https://a.test/1',
      markdown: '# https://a.test/1',
      links: ['https://example.com/a'],
      metadata: expect.objectContaining({ statusCode: 200, tier: 'plain', sourceUrl: 'https://a.test/1' }),
    });
    expect(body.data.web[0].text).toBeUndefined();
    expect(body.data.web[0].rawHtml).toBeUndefined();
  });

  it('honours the pre-spec `scrape` alias', async () => {
    const app = await build();
    const { body } = await post(app, { query: 'x', scrape: { formats: ['text'] } });

    expect(pipeline.runPipeline).toHaveBeenCalledTimes(2);
    expect(body.data.web[0].text).toBe('text of https://a.test/1');
    expect(body.data.web[0].markdown).toBeUndefined();
  });

  it('passes scrape options through to the pipeline', async () => {
    const app = await build();
    await post(app, {
      query: 'x',
      scrapeOptions: { formats: ['markdown'], tier: 'chromium', onlyMainContent: false, timeout: 5000, extractor: 'readability' },
    });

    expect(pipeline.runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'chromium', onlyMainContent: false, timeout: 5000, extractor: 'readability' }),
      expect.anything(),
    );
  });

  it('keeps a failed page as a row with its typed failure and adds a warning', async () => {
    pipeline.runPipeline.mockImplementation(async (options: { url: string }) =>
      options.url.includes('b.test') ? failure(options.url) : success(options.url),
    );
    const app = await build();
    const { status, body } = await post(app, { query: 'x', scrapeOptions: {} });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.web).toHaveLength(2);
    expect(body.data.web[0].markdown).toBe('# https://a.test/1');
    expect(body.data.web[1].markdown).toBeUndefined();
    expect(body.data.web[1].failure).toMatchObject({ reason: 'blocked', detectedBy: ['cloudflare-interstitial'] });
    expect(body.warnings).toEqual(['https://b.test/2: blocked (WAF said no)']);
  });

  it('turns a thrown pipeline error into a per-row failure', async () => {
    pipeline.runPipeline.mockRejectedValue(new Error('boom'));
    const app = await build();
    const { body } = await post(app, { query: 'x', scrapeOptions: {} });

    expect(body.success).toBe(true);
    expect(body.data.web[0].failure).toMatchObject({ reason: 'http_error', detail: 'boom' });
    expect(body.warnings).toHaveLength(2);
  });

  it('never scrapes image results', async () => {
    const provider = providerReturning([hit('https://a.test/1', 1), hit('https://img.test/x.png', 1, 'images')]);
    const app = await build({ provider });
    const { body } = await post(app, { query: 'x', sources: ['web', 'images'], scrapeOptions: {} });

    expect(pipeline.runPipeline).toHaveBeenCalledTimes(1);
    expect(body.data.images).toEqual([expect.objectContaining({ url: 'https://img.test/x.png' })]);
    expect(body.data.images[0].markdown).toBeUndefined();
  });

  it('bounds concurrent page reads to the configured cap', async () => {
    const hits = Array.from({ length: 6 }, (_, i) => hit(`https://h.test/${i}`, i + 1));
    let inFlight = 0;
    let peak = 0;
    pipeline.runPipeline.mockImplementation(async (options: { url: string }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return success(options.url);
    });

    const app = await build({ provider: providerReturning(hits), scrapeConcurrency: 2 });
    const { body } = await post(app, { query: 'x', limit: 6, scrapeOptions: {} });

    expect(peak).toBe(2);
    expect(body.data.web.map((row: { position: number }) => row.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('serves identical queries from the cache within the window', async () => {
    const provider = providerReturning([hit('https://a.test/1', 1)]);
    const app = await build({ provider, cacheTtlMs: 60_000 });

    const first = await post(app, { query: 'same', country: 'us' });
    const second = await post(app, { query: 'same', country: 'us' });
    await post(app, { query: 'different' });

    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(first.body.metadata.fromCache).toBe(false);
    expect(second.body.metadata.fromCache).toBe(true);
  });

  it('bypasses the cache when the TTL is zero', async () => {
    const provider = providerReturning([]);
    const app = await build({ provider, cacheTtlMs: 0 });
    await post(app, { query: 'same' });
    await post(app, { query: 'same' });

    expect(provider.search).toHaveBeenCalledTimes(2);
  });
});

describe('mapWithLimit', () => {
  it('preserves input order regardless of completion order', async () => {
    const out = await mapWithLimit([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it('handles an empty input', async () => {
    expect(await mapWithLimit([], 4, async (x: number) => x)).toEqual([]);
  });
});
