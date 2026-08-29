import { describe, expect, it, vi } from 'vitest';
import { HelixClient } from './client.js';
import { HelixApiError } from './types.js';

const API_KEY = 'hx_test_key';
const BASE_URL = 'https://helix.example.test/v1';

function client(fetchImpl: typeof fetch): HelixClient {
  vi.stubGlobal('fetch', fetchImpl);
  return new HelixClient({ baseUrl: BASE_URL, apiKey: API_KEY });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('request construction', () => {
  it('defaults to localhost:7400 when no baseUrl is given', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchImpl);
    const c = new HelixClient({ apiKey: API_KEY });
    await c.health();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:7400/v1/health');
  });

  it('strips a trailing slash from an explicit baseUrl', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchImpl);
    const c = new HelixClient({ baseUrl: 'https://x.test/v1/', apiKey: API_KEY });
    await c.health();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://x.test/v1/health');
  });

  it('sends the bearer token on every request', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, links: [] }));
    const c = client(fetchImpl);
    await c.map({ url: 'https://example.com' });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
  });

  it('sends POST bodies as JSON with a Content-Type header', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, data: {}, warnings: [] }));
    const c = client(fetchImpl);
    await c.scrape({ url: 'https://example.com', formats: ['markdown'] });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/scrape`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com', formats: ['markdown'] });
  });

  it('encodes cursor and pagination params as a query string', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ id: 'j1', jobId: 'j1' }));
    const c = client(fetchImpl);
    await c.getCrawl('j1', 'page2');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE_URL}/crawl/j1?cursor=page2`);
  });

  it('omits the query string entirely when there is nothing to encode', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ id: 'j1', jobId: 'j1' }));
    const c = client(fetchImpl);
    await c.getJob('j1');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE_URL}/jobs/j1`);
  });
});

describe('per-method request shape', () => {
  it('parse() sends JSON when given a ParseRequest', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, data: { metadata: {} }, warnings: [] }));
    const c = client(fetchImpl);
    await c.parse({ url: 'https://example.com/report.pdf', formats: ['markdown'] });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com/report.pdf', formats: ['markdown'] });
  });

  it('parse() sends multipart/form-data when given a ParseUpload, without setting Content-Type itself', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, data: { metadata: {} }, warnings: [] }));
    const c = client(fetchImpl);
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await c.parse({ file, filename: 'report.pdf', formats: ['markdown', 'json'], jsonOptions: { prompt: 'Extract the total' } });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    const body = init.body as FormData;
    expect(body.get('formats')).toBe('markdown,json');
    expect(JSON.parse(body.get('jsonOptions') as string)).toEqual({ prompt: 'Extract the total' });
    expect(body.get('file')).toBeInstanceOf(Blob);
  });

  it('crawl() posts the full request body including nested scrapeOptions', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, id: 'c1', jobId: 'c1' }));
    const c = client(fetchImpl);
    await c.crawl({ url: 'https://docs.example.com', limit: 50, scrapeOptions: { formats: ['markdown'] } });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://docs.example.com',
      limit: 50,
      scrapeOptions: { formats: ['markdown'] },
    });
  });

  it('cancelCrawl() sends DELETE to /crawl/{jobId}', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ id: 'c1', jobId: 'c1', status: 'cancelled' }));
    const c = client(fetchImpl);
    await c.cancelCrawl('c1');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/crawl/c1`);
    expect(init.method).toBe('DELETE');
  });

  it('batchScrape() posts to /batch/scrape', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, id: 'b1', jobId: 'b1' }, 202));
    const c = client(fetchImpl);
    await c.batchScrape({ urls: ['https://a.test', 'https://b.test'] });
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/batch/scrape`);
  });

  it('saveProvider() PUTs to /providers/{provider}', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, provider: 'anthropic', last4: '9f2c' }));
    const c = client(fetchImpl);
    await c.saveProvider('anthropic', { apiKey: 'sk-ant-1234567890' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/providers/anthropic`);
    expect(init.method).toBe('PUT');
  });

  it('removeProvider() sends DELETE to /providers/{provider}', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true }));
    const c = client(fetchImpl);
    await c.removeProvider('openai');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/providers/openai`);
    expect(init.method).toBe('DELETE');
  });

  it('updateMonitor() sends PATCH to /monitor/{id}', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, id: 'm1', monitorId: 'm1' }));
    const c = client(fetchImpl);
    await c.updateMonitor('m1', { status: 'paused' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/monitor/m1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'paused' });
  });

  it('deleteMonitor() sends DELETE and resolves without a body on 204', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const c = client(fetchImpl);
    await expect(c.deleteMonitor('m1')).resolves.toBeUndefined();
  });

  it('monitorHistory() encodes cursor and limit as query params', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, monitorId: 'm1', entries: [], next: null }));
    const c = client(fetchImpl);
    await c.monitorHistory('m1', { cursor: 42, limit: 10 });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE_URL}/monitor/m1/history?cursor=42&limit=10`);
  });

  it('checkMonitor() posts to /monitor/{id}/check with no body', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, monitorId: 'm1', check: {}, webhookQueued: false }));
    const c = client(fetchImpl);
    await c.checkMonitor('m1');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/monitor/m1/check`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });

  it('openInteractSession() posts an empty object when called with no arguments', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, sessionId: 's1', expiresAt: 'x', idleExpiresAt: 'y', liveViewUrl: 'z' }, 201));
    const c = client(fetchImpl);
    await c.openInteractSession();
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe('{}');
  });

  it('interactLiveStreamUrl() builds the SSE URL with the token as a query param', () => {
    const c = client(vi.fn());
    expect(c.interactLiveStreamUrl('sess_abc', 'tok_123')).toBe(`${BASE_URL}/interact/live/sess_abc/stream?token=tok_123`);
  });

  it('health() sends no Authorization header', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ status: 'ok' }));
    const c = client(fetchImpl);
    await c.health();
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toEqual({});
  });
});

describe('typed failure handling', () => {
  it('scrape() resolves with a typed failure body on a 200 response, not a thrown error', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ success: false, warnings: [], failure: { reason: 'challenge', detail: 'Cloudflare interstitial' } }),
    );
    const c = client(fetchImpl);
    const result = await c.scrape({ url: 'https://blocked.example.com' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.reason).toBe('challenge');
    }
  });

  it('interact() resolves with a typed failure carrying the failing action index', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        success: false,
        sessionId: 's1',
        sessionOpen: false,
        failure: { reason: 'timeout', actionIndex: 2, actionType: 'click' },
      }),
    );
    const c = client(fetchImpl);
    const result = await c.interact({ url: 'https://example.com', actions: [{ type: 'click', selector: '#a' }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.actionIndex).toBe(2);
    }
  });

  it('agentSchema() resolves with a typed failure when no model is configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: false, failure: { reason: 'service_unavailable' } }));
    const c = client(fetchImpl);
    const result = await c.agentSchema({ prompt: 'Extract pricing plans' });
    expect(result.success).toBe(false);
  });

  it('parse() resolves with a typed failure for an unreachable URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: false, failure: { reason: 'dns' } }));
    const c = client(fetchImpl);
    const result = await c.parse({ url: 'https://nonexistent.invalid/f.pdf' });
    expect(result.success).toBe(false);
  });
});

describe('HTTP error mapping', () => {
  it('throws HelixApiError with the status and parsed body on a 4xx response', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: 'invalid_schema', message: '`minItems` is not supported', field: 'jsonOptions.schema' }, 400),
    );
    const c = client(fetchImpl);
    await expect(c.scrape({ url: 'https://example.com' })).rejects.toMatchObject({
      name: 'HelixApiError',
      status: 400,
      message: '`minItems` is not supported',
      body: { error: 'invalid_schema', field: 'jsonOptions.schema' },
    });
  });

  it('throws HelixApiError with a generic message when the error body is not JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('gateway timeout', { status: 504 }));
    const c = client(fetchImpl);
    await expect(c.scrape({ url: 'https://example.com' })).rejects.toMatchObject({
      status: 504,
      message: 'Request failed with status 504',
    });
  });

  it('throws HelixApiError with status 0 when fetch itself rejects', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    const c = client(fetchImpl);
    await expect(c.scrape({ url: 'https://example.com' })).rejects.toMatchObject({
      status: 0,
      message: 'fetch failed',
    });
  });

  it('propagates a 404 on getMonitor as HelixApiError', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: 'not_found', message: 'No such monitor' }, 404));
    const c = client(fetchImpl);
    await expect(c.getMonitor('missing')).rejects.toBeInstanceOf(HelixApiError);
  });

  it('propagates a 409 on cancelCrawl for an already-finished job', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: 'already_finished', message: 'The job had already finished.' }, 409));
    const c = client(fetchImpl);
    await expect(c.cancelCrawl('done-job')).rejects.toMatchObject({ status: 409 });
  });
});
