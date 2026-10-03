import { describe, expect, it } from 'vitest';
import { pullImages, shapeResponse, type ImageBlock } from './shape.js';

const META = {
  tier: 'chromium',
  title: 'Example Domain',
  favicon: 'data:,',
  language: null,
  timingMs: 1007,
  extractor: 'trafilatura',
  escalations: [{ to: 'tls', from: 'plain', reason: 'content absent from raw HTML' }],
  tiersAttempted: ['plain', 'tls'],
  sourceUrl: 'https://example.com',
  finalUrl: 'https://example.com/',
  statusCode: 200,
  contentHash: 'abc',
  mobile: false,
  fromCache: false,
};

describe('pullImages', () => {
  it('moves a screenshot data URI into an image block and leaves a marker', () => {
    const png = `data:image/png;base64,${'A'.repeat(300)}`;
    const images: ImageBlock[] = [];
    const out = pullImages({ success: true, data: { screenshot: png, favicon: 'data:,', title: 'x' } }, images);
    expect(images).toEqual([{ type: 'image', data: 'A'.repeat(300), mimeType: 'image/png' }]);
    expect(out).toEqual({ success: true, data: { screenshot: '[image 1 attached]', favicon: 'data:,', title: 'x' } });
  });

  it('leaves ordinary strings and short data URIs alone', () => {
    const images: ImageBlock[] = [];
    expect(pullImages(['data:image/png;base64,AAAA', 'text'], images)).toEqual(['data:image/png;base64,AAAA', 'text']);
    expect(images).toEqual([]);
  });
});

describe('shapeResponse', () => {
  it('trims a scrape to its content and the metadata a model can use', () => {
    const body = { success: true, data: { markdown: 'Hello', metadata: { ...META, finalUrl: 'https://example.org/moved' } }, warnings: [] };
    expect(shapeResponse('helix_scrape', body, { url: 'https://example.com' })).toEqual({
      success: true,
      data: { markdown: 'Hello', metadata: { title: 'Example Domain', finalUrl: 'https://example.org/moved', statusCode: 200 } },
    });
  });

  it('drops a repeated final URL, and links the call did not ask for', () => {
    const body = { data: { markdown: 'Hi', links: ['https://a.example/'], metadata: META } };
    const plain = shapeResponse('helix_scrape', body, {}) as { data: Record<string, unknown> };
    expect(plain.data).not.toHaveProperty('links');
    expect(plain.data['metadata']).not.toHaveProperty('finalUrl');
    const asked = shapeResponse('helix_scrape', body, { formats: ['markdown', 'links'] }) as { data: Record<string, unknown> };
    expect(asked.data['links']).toEqual(['https://a.example/']);
  });

  it('drops the plain-text copy of a crawl page but keeps its links on a poll', () => {
    const job = {
      id: 'j1',
      jobId: 'j1',
      url: '/v1/crawl/j1',
      status: 'completed',
      error: null,
      next: null,
      warnings: [],
      data: [{ url: 'https://example.com/', text: 'Hello', links: ['https://a.example/'], markdown: 'Hello', metadata: META }],
      usage: { pagesFetched: 1, tierBreakdown: { chromium: 1 }, pagesUnchanged: 0 },
    };
    expect(shapeResponse('helix_get_crawl', job, {})).toEqual({
      id: 'j1',
      status: 'completed',
      data: [{ url: 'https://example.com/', links: ['https://a.example/'], markdown: 'Hello', metadata: { title: 'Example Domain', statusCode: 200 } }],
      usage: { pagesFetched: 1, pagesUnchanged: 0 },
    });
  });

  it('leaves the caller\'s own JSON alone, nulls included', () => {
    const body = {
      success: true,
      data: [{ plan: 'Pro', price: null, tags: [], _source: { url: 'https://example.com/' } }],
      dropped: [],
      warnings: [],
    };
    expect(shapeResponse('helix_extract', body, {})).toEqual({
      success: true,
      data: [{ plan: 'Pro', price: null, tags: [], _source: { url: 'https://example.com/' } }],
    });
    const scraped = { data: { markdown: 'x', json: { price: null, items: [] }, metadata: META } };
    expect((shapeResponse('helix_scrape', scraped, {}) as { data: { json: unknown } }).data.json).toEqual({ price: null, items: [] });
  });

  it('keeps tier data where it is the answer and everything for tools it does not name', () => {
    const ladder = { tiers: [{ tier: 'plain', timingMs: 4 }], none: null };
    expect(shapeResponse('helix_get_job_ladder', ladder, {})).toBe(ladder);
    expect(shapeResponse('helix_health', { a: null }, {})).toEqual({ a: null });
  });

  it('trims search rows and scraped results alike', () => {
    const body = { success: true, data: { web: [{ url: 'u', title: 't', publishedAt: null, markdown: 'm', links: ['l'], metadata: META }] }, metadata: { backend: 'searxng', fromCache: false } };
    expect(shapeResponse('helix_search', body, { scrapeOptions: { formats: ['markdown'] } })).toEqual({
      success: true,
      data: { web: [{ url: 'u', title: 't', markdown: 'm', metadata: { title: 'Example Domain', finalUrl: 'https://example.com/', statusCode: 200 } }] },
      metadata: { backend: 'searxng', fromCache: false },
    });
  });
});
