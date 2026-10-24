import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerScreenshot, type ScreenshotRouteDeps } from './screenshot.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';

function extractClient(): ExtractClient {
  return {
    extract: vi.fn(async () => ({
      markdown: '# Title\n\nSome real content here that is long enough to not look truncated at all.',
      text: 'Some real content here that is long enough to not look truncated at all.',
      title: 'Title',
      language: 'en',
      links: [],
      extractorUsed: 'trafilatura',
      contentHash: 'abc',
    })),
    health: vi.fn(async () => true),
  } as unknown as ExtractClient;
}

function browserPool(
  over: {
    screenshot?: string | undefined;
    noScreenshot?: boolean;
    html?: string;
    /** Echoed back as the capture result, so a test can assert what reached the pool. */
    result?: { format: string; bytes: number; warning?: string };
  } = {},
): BrowserPool {
  const html = over.html ?? '<html><body>Some real content here that is long enough to not look truncated at all.</body></html>';
  return {
    render: vi.fn(async () => ({
      html,
      status: 200,
      headers: {},
      finalUrl: 'https://example.com/',
      screenshot: over.noScreenshot ? undefined : (over.screenshot ?? 'iVBORw0KGgo='),
      ...(over.result
        ? { screenshotResult: { data: over.screenshot ?? 'iVBORw0KGgo=', ...over.result } }
        : {}),
      timingMs: 500,
    })),
    stats: () => ({ browsers: 1, activeContexts: 0, pagesServed: 1, engines: ['chromium' as const] }),
    close: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
  } as unknown as BrowserPool;
}

function fetchClientUnused(): FetchClient {
  return {
    fetch: vi.fn(async () => ({ success: true, status: 200, headers: {}, body: '', timingMs: 5 })),
    health: vi.fn(async () => true),
  } as unknown as FetchClient;
}

let app: FastifyInstance | undefined;

async function build(over: Partial<ScreenshotRouteDeps> = {}): Promise<FastifyInstance> {
  const deps: ScreenshotRouteDeps = {
    fetchClient: fetchClientUnused(),
    extractClient: extractClient(),
    browserPool: browserPool(),
    resolveHost: async () => ['93.184.216.34'],
    ...over,
  };
  app = Fastify();
  await registerScreenshot(app, deps);
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('POST /screenshot', () => {
  it('rejects a missing url', async () => {
    const instance = await build();

    const response = await instance.inject({ method: 'POST', url: '/screenshot', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('url');
  });

  it('rejects a private url', async () => {
    const instance = await build({ resolveHost: async () => ['127.0.0.1'] });

    const response = await instance.inject({ method: 'POST', url: '/screenshot', payload: { url: 'https://internal.example' } });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('url');
  });

  it.each(['http://169.254.169.254', 'http://127.0.0.1:7402', 'file:///etc/passwd'])(
    'rejects the caller proxy %s',
    async (proxy) => {
      const instance = await build();

      const response = await instance.inject({
        method: 'POST',
        url: '/screenshot',
        payload: { url: 'https://example.com', proxy },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().field).toBe('proxy');
    },
  );

  it('returns the screenshot as a data URI on success', async () => {
    const instance = await build();

    const response = await instance.inject({ method: 'POST', url: '/screenshot', payload: { url: 'https://example.com' } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.screenshot).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('never includes markdown, text or links in the response', async () => {
    const instance = await build();

    const response = await instance.inject({ method: 'POST', url: '/screenshot', payload: { url: 'https://example.com' } });

    const body = response.json();
    expect(body.data).not.toHaveProperty('markdown');
    expect(body.data).not.toHaveProperty('text');
    expect(body.data).not.toHaveProperty('links');
    expect(body.data).not.toHaveProperty('json');
  });

  it('warns and returns null when no image was captured', async () => {
    const instance = await build({ browserPool: browserPool({ noScreenshot: true }) });

    const response = await instance.inject({ method: 'POST', url: '/screenshot', payload: { url: 'https://example.com' } });

    const body = response.json();
    expect(body.data.screenshot).toBeNull();
    expect(body.warnings).toContain('screenshot: no image was captured at the tier that succeeded.');
  });

  it('reports a typed failure rather than an HTTP error when the fetch fails', async () => {
    const failingPool: BrowserPool = {
      render: vi.fn(async () => ({ html: '', status: 0, headers: {}, error: 'net::ERR_CONNECTION_REFUSED', timingMs: 5 })),
      stats: () => ({ browsers: 1, activeContexts: 0, pagesServed: 0, engines: ['chromium' as const] }),
      close: vi.fn(async () => undefined),
      start: vi.fn(async () => undefined),
    } as unknown as BrowserPool;
    const instance = await build({ browserPool: failingPool });

    const response = await instance.inject({ method: 'POST', url: '/screenshot', payload: { url: 'https://example.com' } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBeDefined();
  });

  it('passes mobile through to the pipeline and reports it applied', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/screenshot',
      payload: { url: 'https://example.com', mobile: true },
    });

    expect(response.json().data.metadata.mobile).toBe(true);
  });

  it('rejects a tier not offered for a screenshot-only fetch', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/screenshot',
      payload: { url: 'https://example.com', tier: 'plain' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('never calls extractClient.extract, since nothing in the response reads it', async () => {
    const extract = extractClient();
    const instance = await build({ extractClient: extract });

    const response = await instance.inject({ method: 'POST', url: '/screenshot', payload: { url: 'https://example.com' } });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(extract.extract).not.toHaveBeenCalled();
  });

  it('still fails a Cloudflare challenge page rendered at the screenshot tier', async () => {
    // The invariant this route must not weaken by skipping extraction: a
    // bot-challenge page must never come back as a successful screenshot.
    const challengeHtml =
      '<html><head><title>Just a moment...</title></head>' +
      '<body><div class="cf-browser-verification">Checking your browser before accessing</div></body></html>';
    const instance = await build({ browserPool: browserPool({ html: challengeHtml }) });

    const response = await instance.inject({ method: 'POST', url: '/screenshot', payload: { url: 'https://example.com' } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('challenge');
    expect(body.failure.detectedBy).toContain('cloudflare-challenge');
  });
});

describe('screenshot options', () => {
  it('carries fullPage, format, quality and the selector to the pool', async () => {
    const pool = browserPool();
    const instance = await build({ browserPool: pool });

    await instance.inject({
      method: 'POST',
      url: '/screenshot',
      payload: {
        url: 'https://example.com',
        fullPage: true,
        format: 'webp',
        quality: 70,
        selector: '#pricing',
        omitBackground: true,
      },
    });

    const call = (pool.render as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.screenshotOptions).toMatchObject({
      fullPage: true,
      format: 'webp',
      quality: 70,
      selector: '#pricing',
      omitBackground: true,
    });
  });

  it('carries the viewport, dpr, darkMode and blockAds to the pool', async () => {
    const pool = browserPool();
    const instance = await build({ browserPool: pool });

    await instance.inject({
      method: 'POST',
      url: '/screenshot',
      payload: {
        url: 'https://example.com',
        viewport: { width: 1440, height: 900, dpr: 2 },
        darkMode: true,
        blockAds: true,
      },
    });

    const call = (pool.render as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.viewport).toEqual({ width: 1440, height: 900, deviceScaleFactor: 2 });
    expect(call.darkMode).toBe(true);
    expect(call.blockAds).toBe(true);
  });

  it('reports the format and byte count it actually produced', async () => {
    const instance = await build({
      browserPool: browserPool({ result: { format: 'jpeg', bytes: 41_233 } }),
    });

    const response = await instance.inject({
      method: 'POST',
      url: '/screenshot',
      payload: { url: 'https://example.com', format: 'jpeg' },
    });

    const data = response.json().data;
    expect(data.format).toBe('jpeg');
    expect(data.bytes).toBe(41_233);
    expect(data.screenshot.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('surfaces a capture warning rather than returning a clipped image silently', async () => {
    const instance = await build({
      browserPool: browserPool({
        result: { format: 'png', bytes: 900, warning: 'fullPage: the page is 12000px tall; captured the top 4096px (the cap).' },
      }),
    });

    const response = await instance.inject({
      method: 'POST',
      url: '/screenshot',
      payload: { url: 'https://example.com', fullPage: true },
    });

    expect(response.json().warnings).toContain(
      'fullPage: the page is 12000px tall; captured the top 4096px (the cap).',
    );
  });

  it('rejects selector and clip together rather than picking one', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/screenshot',
      payload: {
        url: 'https://example.com',
        selector: '#a',
        clip: { x: 0, y: 0, width: 100, height: 100 },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('clip');
  });

  it('rejects an explicit viewport combined with mobile', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/screenshot',
      payload: { url: 'https://example.com', mobile: true, viewport: { width: 1440, height: 900 } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('viewport');
  });
});
