import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerDiff, type DiffRouteDeps } from './diff.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';

function fetchClientReturning(body: string): FetchClient {
  return {
    fetch: vi.fn(async () => ({ success: true, status: 200, headers: {}, body, timingMs: 10 })),
    health: vi.fn(async () => true),
  } as unknown as FetchClient;
}

function browserPoolReturning(html: string): BrowserPool {
  return {
    render: vi.fn(async () => ({ html, status: 200, headers: {}, finalUrl: undefined, screenshot: undefined, timingMs: 100 })),
    stats: () => ({ browsers: 1, activeContexts: 0, pagesServed: 1, engines: ['chromium' as const] }),
    close: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
  } as unknown as BrowserPool;
}

function extractClientReturning(markdown: string): ExtractClient {
  return {
    extract: vi.fn(async () => ({
      markdown,
      text: markdown,
      title: 'Title',
      language: 'en',
      links: [],
      extractorUsed: 'trafilatura',
      contentHash: 'abc',
    })),
    health: vi.fn(async () => true),
  } as unknown as ExtractClient;
}

let app: FastifyInstance | undefined;

async function build(over: Partial<DiffRouteDeps> = {}): Promise<FastifyInstance> {
  const deps: DiffRouteDeps = {
    fetchClient: fetchClientReturning('<html><body>content</body></html>'),
    extractClient: extractClientReturning('content'),
    browserPool: browserPoolReturning('<html><body>content</body></html>'),
    resolveHost: async () => ['93.184.216.34'],
    ...over,
  };
  app = Fastify();
  await registerDiff(app, deps);
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('POST /diff', () => {
  it('rejects a request missing before/after', async () => {
    const instance = await build();

    const response = await instance.inject({ method: 'POST', url: '/diff', payload: {} });

    expect(response.statusCode).toBe(400);
  });

  it('diffs two literal texts at word granularity by default', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/diff',
      payload: {
        before: { text: 'Standard $29/month billed annually' },
        after: { text: 'Standard $34/month billed annually' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.diff.granularity).toBe('word');
    expect(body.diff.added).toBeGreaterThan(0);
    expect(body.diff.removed).toBeGreaterThan(0);
  });

  it('reports no changes when both texts are identical', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/diff',
      payload: { before: { text: 'same' }, after: { text: 'same' } },
    });

    expect(response.json().diff.changeRatio).toBe(0);
  });

  it('honours an explicit granularity', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/diff',
      payload: { before: { text: 'abc' }, after: { text: 'axyz' }, granularity: 'character' },
    });

    expect(response.json().diff.granularity).toBe('character');
  });

  it('fetches and diffs two urls through the normal pipeline', async () => {
    const fetchClient: FetchClient = {
      fetch: vi.fn(async ({ url }: { url: string }) => ({
        success: true,
        status: 200,
        headers: {},
        body: url.endsWith('/a') ? '<html><body>version one</body></html>' : '<html><body>version two</body></html>',
        timingMs: 10,
      })),
      health: vi.fn(async () => true),
    } as unknown as FetchClient;
    const extractClient: ExtractClient = {
      extract: vi.fn(async ({ html }: { html: string }) => {
        const markdown = html.includes('version one') ? 'version one' : 'version two';
        return { markdown, text: markdown, title: 't', language: 'en', links: [], extractorUsed: 'trafilatura', contentHash: markdown };
      }),
      health: vi.fn(async () => true),
    } as unknown as ExtractClient;
    const browserPool: BrowserPool = {
      render: vi.fn(async ({ url }: { url: string }) => ({
        html: url.endsWith('/a') ? '<html><body>version one</body></html>' : '<html><body>version two</body></html>',
        status: 200,
        headers: {},
        finalUrl: undefined,
        screenshot: undefined,
        timingMs: 100,
      })),
      stats: () => ({ browsers: 1, activeContexts: 0, pagesServed: 1, engines: ['chromium' as const] }),
      close: vi.fn(async () => undefined),
      start: vi.fn(async () => undefined),
    } as unknown as BrowserPool;
    const instance = await build({ fetchClient, extractClient, browserPool });

    const response = await instance.inject({
      method: 'POST',
      url: '/diff',
      payload: {
        before: { url: 'https://example.com/a' },
        after: { url: 'https://example.com/b' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.diff.added).toBeGreaterThan(0);
  });

  it('mixes a literal text and a url', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/diff',
      payload: { before: { text: 'content' }, after: { url: 'https://example.com' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().diff.changeRatio).toBe(0);
  });

  it('rejects a private url on the before side rather than fetching it', async () => {
    const instance = await build({ resolveHost: async () => ['127.0.0.1'] });

    const response = await instance.inject({
      method: 'POST',
      url: '/diff',
      payload: { before: { url: 'https://internal.example' }, after: { text: 'x' } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('before.url');
  });

  it('reports a typed fetch failure on a url side as a 400 naming the side', async () => {
    const fetchClient: FetchClient = {
      fetch: vi.fn(async () => ({ success: false, error: 'ECONNREFUSED', headers: {}, timingMs: 5 })),
      health: vi.fn(async () => true),
    } as unknown as FetchClient;
    const browserPool: BrowserPool = {
      render: vi.fn(async () => ({ html: '', status: 0, headers: {}, error: 'ECONNREFUSED', timingMs: 5 })),
      stats: () => ({ browsers: 1, activeContexts: 0, pagesServed: 0, engines: ['chromium' as const] }),
      close: vi.fn(async () => undefined),
      start: vi.fn(async () => undefined),
    } as unknown as BrowserPool;
    const instance = await build({ fetchClient, browserPool });

    const response = await instance.inject({
      method: 'POST',
      url: '/diff',
      payload: { before: { url: 'https://example.com/down' }, after: { text: 'x' } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('before');
    expect(response.json().message).toContain('https://example.com/down');
  });

  it('diffs two JSON values field by field in json mode', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/diff',
      payload: { mode: 'json', before: { plan: 'Standard', price: 29 }, after: { plan: 'Standard', price: 34 } },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.diff.granularity).toBe('json');
    expect(body.diff.fields).toEqual([{ path: 'price', before: 29, after: 34 }]);
  });

  it('bounds a very large text diff rather than returning it whole', async () => {
    const instance = await build();
    const before = 'a'.repeat(200_000);
    const after = 'b'.repeat(200_000);

    const response = await instance.inject({
      method: 'POST',
      url: '/diff',
      payload: { before: { text: before }, after: { text: after }, granularity: 'character' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().diff.truncated).toBe(true);
  });
});
