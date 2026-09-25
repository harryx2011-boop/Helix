/**
 * Characterization test for HelixClient.
 *
 * Pins the exact HTTP request every public method sends today: method, URL,
 * headers, and body shape. This is the safety net for the planned rewrite
 * (client generated from openapi.yaml) - every assertion here must still
 * hold, unchanged, once the client is regenerated.
 *
 * Not a spec: some of what is pinned (e.g. metadataScrub's AbortError
 * behaviour, noted inline) is known to be changing and is deliberately left
 * unpinned rather than asserted.
 */
import { describe, expect, it, vi } from 'vitest';
import { HelixClient } from './client.js';
import type {
  MetadataRequest,
  MetadataUpload,
  ParseRequest,
  ParseUpload,
} from './types.js';

const API_KEY = 'hx_char_key';
const BASE_URL = 'http://h.test/v1';
const AUTH = `Bearer ${API_KEY}`;

function client(fetchImpl: typeof fetch): HelixClient {
  vi.stubGlobal('fetch', fetchImpl);
  return new HelixClient({ baseUrl: BASE_URL, apiKey: API_KEY });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function noBodyResponse(status = 204): Response {
  return new Response(null, { status });
}

interface CapturedRequest {
  url: string;
  method: string;
  authorization: string | undefined;
  contentType: string | undefined;
  bodyText: string | undefined;
  formEntries: Array<[string, string | { filename: string }]> | undefined;
}

async function capture(init: RequestInit | undefined, url: string): Promise<CapturedRequest> {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const rawBody = init?.body;
  let bodyText: string | undefined;
  let formEntries: Array<[string, string | { filename: string }]> | undefined;

  if (typeof rawBody === 'string') {
    bodyText = rawBody;
  } else if (rawBody instanceof FormData) {
    formEntries = [];
    for (const [key, value] of rawBody.entries()) {
      if (value instanceof File) {
        formEntries.push([key, { filename: value.name }]);
      } else if (value instanceof Blob) {
        formEntries.push([key, { filename: '' }]);
      } else {
        formEntries.push([key, value]);
      }
    }
  }

  return {
    url,
    method: init?.method ?? 'GET',
    authorization: headers['Authorization'],
    contentType: headers['Content-Type'],
    bodyText,
    formEntries,
  };
}

async function record<T>(
  responseBody: unknown,
  status: number,
  run: (c: HelixClient) => Promise<T>,
): Promise<{ request: CapturedRequest; resolved: T }> {
  const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(responseBody, status));
  const c = client(fetchImpl);
  const resolved = await run(c);
  const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit | undefined];
  const request = await capture(init, url);
  return { request, resolved };
}

async function recordNoBody<T>(
  run: (c: HelixClient) => Promise<T>,
): Promise<{ request: CapturedRequest; resolved: T }> {
  const fetchImpl = vi.fn<typeof fetch>(async () => noBodyResponse());
  const c = client(fetchImpl);
  const resolved = await run(c);
  const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit | undefined];
  const request = await capture(init, url);
  return { request, resolved };
}

describe('HelixClient characterization: per-method request shape', () => {
  const responseBody = { marker: 'resp-1', nested: { a: 1 } };

  const cases: Array<{
    name: string;
    run: (c: HelixClient) => Promise<unknown>;
    method: string;
    url: string;
    auth: string | undefined;
    contentType: string | undefined;
    bodyText: string | undefined;
  }> = [
    {
      name: 'scrape',
      run: (c) => c.scrape({ url: 'https://example.com' }),
      method: 'POST',
      url: `${BASE_URL}/scrape`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://example.com' }),
    },
    {
      name: 'parse (JSON request)',
      run: (c) => c.parse({ url: 'https://example.com/r.pdf', formats: ['markdown'] }),
      method: 'POST',
      url: `${BASE_URL}/parse`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://example.com/r.pdf', formats: ['markdown'] }),
    },
    {
      name: 'metadataScan (JSON request)',
      run: (c) => c.metadataScan({ url: 'https://example.com/r.pdf' }),
      method: 'POST',
      url: `${BASE_URL}/metadata`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://example.com/r.pdf' }),
    },
    {
      name: 'map',
      run: (c) => c.map({ url: 'https://example.com', limit: 10 }),
      method: 'POST',
      url: `${BASE_URL}/map`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://example.com', limit: 10 }),
    },
    {
      name: 'search',
      run: (c) => c.search({ query: 'helix' }),
      method: 'POST',
      url: `${BASE_URL}/search`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ query: 'helix' }),
    },
    {
      name: 'enrich',
      run: (c) => c.enrich({ subject: 'Acme', fields: [{ name: 'ceo' }] }),
      method: 'POST',
      url: `${BASE_URL}/enrich`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ subject: 'Acme', fields: [{ name: 'ceo' }] }),
    },
    {
      name: 'crawl',
      run: (c) => c.crawl({ url: 'https://docs.example.com', limit: 5 }),
      method: 'POST',
      url: `${BASE_URL}/crawl`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://docs.example.com', limit: 5 }),
    },
    {
      name: 'estimateCrawl',
      run: (c) => c.estimateCrawl({ url: 'https://docs.example.com', estimate: true }),
      method: 'POST',
      url: `${BASE_URL}/crawl/estimate`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://docs.example.com', estimate: true }),
    },
    {
      name: 'resumeCrawl',
      run: (c) => c.resumeCrawl('job-1'),
      method: 'POST',
      url: `${BASE_URL}/crawl`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ resume: 'job-1' }),
    },
    {
      name: 'getCrawl (no cursor)',
      run: (c) => c.getCrawl('job-1'),
      method: 'GET',
      url: `${BASE_URL}/crawl/job-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: "getCrawl (cursor '')",
      run: (c) => c.getCrawl('job-1', ''),
      method: 'GET',
      url: `${BASE_URL}/crawl/job-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'getCrawl (with cursor)',
      run: (c) => c.getCrawl('job-1', 'page-2'),
      method: 'GET',
      url: `${BASE_URL}/crawl/job-1?cursor=page-2`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'cancelCrawl',
      run: (c) => c.cancelCrawl('job-1'),
      method: 'DELETE',
      url: `${BASE_URL}/crawl/job-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'batchScrape',
      run: (c) => c.batchScrape({ urls: ['https://a.test', 'https://b.test'] }),
      method: 'POST',
      url: `${BASE_URL}/batch/scrape`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ urls: ['https://a.test', 'https://b.test'] }),
    },
    {
      name: 'getBatchScrape (no cursor)',
      run: (c) => c.getBatchScrape('job-1'),
      method: 'GET',
      url: `${BASE_URL}/batch/scrape/job-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: "getBatchScrape (cursor '')",
      run: (c) => c.getBatchScrape('job-1', ''),
      method: 'GET',
      url: `${BASE_URL}/batch/scrape/job-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'getBatchScrape (with cursor)',
      run: (c) => c.getBatchScrape('job-1', 'page-2'),
      method: 'GET',
      url: `${BASE_URL}/batch/scrape/job-1?cursor=page-2`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'cancelBatchScrape',
      run: (c) => c.cancelBatchScrape('job-1'),
      method: 'DELETE',
      url: `${BASE_URL}/batch/scrape/job-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'getJob (no cursor)',
      run: (c) => c.getJob('job-1'),
      method: 'GET',
      url: `${BASE_URL}/jobs/job-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: "getJob (cursor '')",
      run: (c) => c.getJob('job-1', ''),
      method: 'GET',
      url: `${BASE_URL}/jobs/job-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'getJob (with cursor)',
      run: (c) => c.getJob('job-1', 'page-2'),
      method: 'GET',
      url: `${BASE_URL}/jobs/job-1?cursor=page-2`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'cancelJob',
      run: (c) => c.cancelJob('job-1'),
      method: 'DELETE',
      url: `${BASE_URL}/jobs/job-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'getJobErrors',
      run: (c) => c.getJobErrors('job-1'),
      method: 'GET',
      url: `${BASE_URL}/jobs/job-1/errors`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'document (plain object)',
      run: (c) => c.document({ op: 'parse', url: 'https://example.com' }),
      method: 'POST',
      url: `${BASE_URL}/document`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ op: 'parse', url: 'https://example.com' }),
    },
    {
      name: 'screenshot',
      run: (c) => c.screenshot({ url: 'https://example.com', fullPage: true }),
      method: 'POST',
      url: `${BASE_URL}/screenshot`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://example.com', fullPage: true }),
    },
    {
      name: 'extract',
      run: (c) => c.extract({ urls: ['https://example.com'], prompt: 'get the title' }),
      method: 'POST',
      url: `${BASE_URL}/extract`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ urls: ['https://example.com'], prompt: 'get the title' }),
    },
    {
      name: 'agentSchema',
      run: (c) => c.agentSchema({ prompt: 'Extract pricing plans' }),
      method: 'POST',
      url: `${BASE_URL}/agent/schema`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ prompt: 'Extract pricing plans' }),
    },
    {
      name: 'interact',
      run: (c) => c.interact({ url: 'https://example.com', actions: [{ type: 'click', selector: '#a' }] }),
      method: 'POST',
      url: `${BASE_URL}/interact`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://example.com', actions: [{ type: 'click', selector: '#a' }] }),
    },
    {
      name: 'openInteractSession (with request)',
      run: (c) => c.openInteractSession({ url: 'https://example.com' }),
      method: 'POST',
      url: `${BASE_URL}/interact/session`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://example.com' }),
    },
    {
      name: 'openInteractSession (no request)',
      run: (c) => c.openInteractSession(),
      method: 'POST',
      url: `${BASE_URL}/interact/session`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: '{}',
    },
    {
      name: 'getInteractSession',
      run: (c) => c.getInteractSession('sess-1'),
      method: 'GET',
      url: `${BASE_URL}/interact/session/sess-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'listMonitors',
      run: (c) => c.listMonitors(),
      method: 'GET',
      url: `${BASE_URL}/monitor`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'createMonitor',
      run: (c) => c.createMonitor({ url: 'https://example.com', schedule: '0 * * * *' }),
      method: 'POST',
      url: `${BASE_URL}/monitor`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ url: 'https://example.com', schedule: '0 * * * *' }),
    },
    {
      name: 'getMonitor',
      run: (c) => c.getMonitor('mon-1'),
      method: 'GET',
      url: `${BASE_URL}/monitor/mon-1`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'updateMonitor',
      run: (c) => c.updateMonitor('mon-1', { status: 'paused' }),
      method: 'PATCH',
      url: `${BASE_URL}/monitor/mon-1`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ status: 'paused' }),
    },
    {
      name: 'monitorHistory (cursor + limit)',
      run: (c) => c.monitorHistory('mon-1', { cursor: 0, limit: 5 }),
      method: 'GET',
      url: `${BASE_URL}/monitor/mon-1/history?cursor=0&limit=5`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'monitorHistory (limit only)',
      run: (c) => c.monitorHistory('mon-1', { limit: 5 }),
      method: 'GET',
      url: `${BASE_URL}/monitor/mon-1/history?limit=5`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'monitorHistory (no options)',
      run: (c) => c.monitorHistory('mon-1'),
      method: 'GET',
      url: `${BASE_URL}/monitor/mon-1/history`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'monitorSnapshot',
      run: (c) => c.monitorSnapshot('mon-1', 7),
      method: 'GET',
      url: `${BASE_URL}/monitor/mon-1/snapshots/7`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'checkMonitor',
      run: (c) => c.checkMonitor('mon-1'),
      method: 'POST',
      url: `${BASE_URL}/monitor/mon-1/check`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: '{}',
    },
    {
      name: 'monitorDeliveries',
      run: (c) => c.monitorDeliveries('mon-1'),
      method: 'GET',
      url: `${BASE_URL}/monitor/mon-1/deliveries`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'replayMonitorDelivery',
      run: (c) => c.replayMonitorDelivery('mon-1', 3),
      method: 'POST',
      url: `${BASE_URL}/monitor/mon-1/deliveries/3/replay`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: '{}',
    },
    {
      name: 'listProviders',
      run: (c) => c.listProviders(),
      method: 'GET',
      url: `${BASE_URL}/providers`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'saveProvider',
      run: (c) => c.saveProvider('anthropic', { apiKey: 'sk-ant-1234567890' }),
      method: 'PUT',
      url: `${BASE_URL}/providers/anthropic`,
      auth: AUTH,
      contentType: 'application/json',
      bodyText: JSON.stringify({ apiKey: 'sk-ant-1234567890' }),
    },
    {
      name: 'removeProvider',
      run: (c) => c.removeProvider('openai'),
      method: 'DELETE',
      url: `${BASE_URL}/providers/openai`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'usage (with hours)',
      run: (c) => c.usage({ hours: 24 }),
      method: 'GET',
      url: `${BASE_URL}/usage?hours=24`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'usage (no hours)',
      run: (c) => c.usage(),
      method: 'GET',
      url: `${BASE_URL}/usage`,
      auth: AUTH,
      contentType: undefined,
      bodyText: undefined,
    },
    {
      name: 'health',
      run: (c) => c.health(),
      method: 'GET',
      url: `${BASE_URL}/health`,
      auth: undefined,
      contentType: undefined,
      bodyText: undefined,
    },
  ];

  it.each(cases)('$name pins method, URL, headers, and body', async ({ run, method, url, auth, contentType, bodyText }) => {
    const { request, resolved } = await record(responseBody, 200, run);
    expect(request.method).toBe(method);
    expect(request.url).toBe(url);
    expect(request.authorization).toBe(auth);
    expect(request.contentType).toBe(contentType);
    expect(request.bodyText).toBe(bodyText);
    expect(resolved).toEqual(responseBody);
  });
});

describe('HelixClient characterization: 204 methods resolve undefined', () => {
  const noBodyCases: Array<{
    name: string;
    run: (c: HelixClient) => Promise<unknown>;
    method: string;
    url: string;
  }> = [
    {
      name: 'closeInteractSession',
      run: (c) => c.closeInteractSession('sess-1'),
      method: 'DELETE',
      url: `${BASE_URL}/interact/session/sess-1`,
    },
    {
      name: 'deleteMonitor',
      run: (c) => c.deleteMonitor('mon-1'),
      method: 'DELETE',
      url: `${BASE_URL}/monitor/mon-1`,
    },
  ];

  it.each(noBodyCases)('$name sends DELETE to $url and resolves undefined on 204', async ({ run, method, url }) => {
    const { request, resolved } = await recordNoBody(run);
    expect(request.method).toBe(method);
    expect(request.url).toBe(url);
    expect(request.authorization).toBe(AUTH);
    expect(resolved).toBeUndefined();
  });
});

describe('HelixClient characterization: interactLiveStreamUrl', () => {
  it('builds the SSE URL with an encoded token, no network call', () => {
    const c = client(vi.fn());
    expect(c.interactLiveStreamUrl('sess-1', 'tok/en=')).toBe(
      `${BASE_URL}/interact/live/sess-1/stream?token=${encodeURIComponent('tok/en=')}`,
    );
  });
});

describe('HelixClient characterization: parse upload variants', () => {
  it('parse() with a full ParseUpload sends multipart with every field set', async () => {
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const upload: ParseUpload = {
      file,
      filename: 'report.pdf',
      formats: ['markdown', 'json'],
      ocr: 'force',
      maxPages: 10,
      tables: 'high-fidelity',
      jsonOptions: { prompt: 'Extract the total' },
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, data: {}, warnings: [] }));
    const c = client(fetchImpl);
    await c.parse(upload);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const request = await capture(init, url);

    expect(request.method).toBe('POST');
    expect(request.url).toBe(`${BASE_URL}/parse`);
    expect(request.authorization).toBe(AUTH);
    expect(request.contentType).toBeUndefined();
    // Part order follows openapi.yaml's ParseUpload schema; the route reads each
    // field by name (routes/parse.ts), so only the set of parts is pinned.
    expect(request.formEntries[0]).toEqual(['file', { filename: 'report.pdf' }]);
    expect(request.formEntries).toEqual(
      expect.arrayContaining([
        ['formats', 'markdown,json'],
        ['ocr', 'force'],
        ['maxPages', '10'],
        ['tables', 'high-fidelity'],
        ['jsonOptions', JSON.stringify({ prompt: 'Extract the total' })],
      ]),
    );
    expect(request.formEntries).toHaveLength(6);
  });

  it('parse() with only `file` sends just the file field', async () => {
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const upload: ParseUpload = { file };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, data: {}, warnings: [] }));
    const c = client(fetchImpl);
    await c.parse(upload);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const request = await capture(init, url);

    expect(request.contentType).toBeUndefined();
    expect(request.formEntries).toEqual([['file', { filename: 'blob' }]]);
  });

  it('parse() with a ParseRequest (no file) sends JSON, not multipart', async () => {
    const requestBody: ParseRequest = { url: 'https://example.com/r.pdf', formats: ['markdown'] };
    const { request } = await record({ success: true, data: {}, warnings: [] }, 200, (c) => c.parse(requestBody));
    expect(request.contentType).toBe('application/json');
    expect(request.formEntries).toBeUndefined();
    expect(request.bodyText).toBe(JSON.stringify(requestBody));
  });
});

describe('HelixClient characterization: metadataScan upload variants', () => {
  it('metadataScan() with a full MetadataUpload sends multipart with file, filename, and timeout', async () => {
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const upload: MetadataUpload = { file, filename: 'doc.pdf', timeout: 30000 };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, data: {}, warnings: [] }));
    const c = client(fetchImpl);
    await c.metadataScan(upload);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const request = await capture(init, url);

    expect(request.method).toBe('POST');
    expect(request.url).toBe(`${BASE_URL}/metadata`);
    expect(request.contentType).toBeUndefined();
    expect(request.formEntries).toEqual([
      ['file', { filename: 'doc.pdf' }],
      ['timeout', '30000'],
    ]);
  });

  it('metadataScan() with only `file` sends just the file field', async () => {
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const upload: MetadataUpload = { file };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, data: {}, warnings: [] }));
    const c = client(fetchImpl);
    await c.metadataScan(upload);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const request = await capture(init, url);

    expect(request.formEntries).toEqual([['file', { filename: 'blob' }]]);
  });

  it('metadataScan() with a MetadataRequest (no file) sends JSON', async () => {
    const requestBody: MetadataRequest = { url: 'https://example.com/r.pdf' };
    const { request } = await record({ success: true, data: {}, warnings: [] }, 200, (c) => c.metadataScan(requestBody));
    expect(request.contentType).toBe('application/json');
    expect(request.formEntries).toBeUndefined();
    expect(request.bodyText).toBe(JSON.stringify(requestBody));
  });
});

describe('HelixClient characterization: document() argument variants', () => {
  it('document() with a plain object sends JSON', async () => {
    const requestBody = { op: 'parse' as const, url: 'https://example.com' };
    const { request } = await record({}, 200, (c) => c.document(requestBody));
    expect(request.contentType).toBe('application/json');
    expect(request.bodyText).toBe(JSON.stringify(requestBody));
    expect(request.formEntries).toBeUndefined();
  });

  it('document() with a FormData instance sends it untouched as multipart, no Content-Type set', async () => {
    const form = new FormData();
    form.set('op', 'scrub');
    form.set('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'x.pdf');
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}, 200));
    const c = client(fetchImpl);
    await c.document(form);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const request = await capture(init, url);

    expect(request.contentType).toBeUndefined();
    expect(request.formEntries).toEqual([
      ['op', 'scrub'],
      ['file', { filename: 'x.pdf' }],
    ]);
  });
});

describe('HelixClient characterization: metadataScrub custom response handling', () => {
  function scrubResponse(body: BodyInit, status: number, headers: Record<string, string>): Response {
    return new Response(body, { status, headers });
  }

  it('(a) JSON request, binary response with report + UTF-8 filename header -> {success:true, data:Blob, filename, report}', async () => {
    const report = {
      removed: [],
      retained: [],
      riskSummary: { high: 0, medium: 0, low: 0 },
      metadata: {
        filename: 'r.pdf',
        fileType: 'pdf',
        bytesBefore: 10,
        bytesAfter: 8,
        scrubbedAt: '2026-01-01T00:00:00Z',
        timingMs: 5,
      },
    };
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      scrubResponse(new Blob(['%PDF-scrubbed']), 200, {
        'content-type': 'application/pdf',
        'x-helix-metadata-report': JSON.stringify(report),
        'content-disposition': "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf",
      }),
    );
    const c = client(fetchImpl);
    const result = await c.metadataScrub({ url: 'https://example.com/r.pdf' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const request = await capture(init, url);

    expect(request.method).toBe('POST');
    expect(request.url).toBe(`${BASE_URL}/metadata/scrub`);
    expect(request.contentType).toBe('application/json');
    expect(request.bodyText).toBe(JSON.stringify({ url: 'https://example.com/r.pdf' }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(Blob);
      expect(result.filename).toBe('résumé.pdf');
      expect(result.report).toEqual(report);
    }
  });

  it('(b) a plain filename="a.pdf" disposition is used as-is', async () => {
    const report = { removed: [], retained: [], riskSummary: { high: 0, medium: 0, low: 0 }, metadata: {} };
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      scrubResponse(new Blob(['bytes']), 200, {
        'content-type': 'application/pdf',
        'x-helix-metadata-report': JSON.stringify(report),
        'content-disposition': 'attachment; filename="a.pdf"',
      }),
    );
    const c = client(fetchImpl);
    const result = await c.metadataScrub({ url: 'https://example.com/a.pdf' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.filename).toBe('a.pdf');
  });

  it("(b) no content-disposition header at all falls back to 'file.scrubbed'", async () => {
    const report = { removed: [], retained: [], riskSummary: { high: 0, medium: 0, low: 0 }, metadata: {} };
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      scrubResponse(new Blob(['bytes']), 200, {
        'content-type': 'application/pdf',
        'x-helix-metadata-report': JSON.stringify(report),
      }),
    );
    const c = client(fetchImpl);
    const result = await c.metadataScrub({ url: 'https://example.com/a.pdf' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.filename).toBe('file.scrubbed');
  });

  it('(c) a JSON content-type response is returned as parsed JSON, not unwrapped as a blob', async () => {
    const failureBody = { success: false, failure: { reason: 'dns' } };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(failureBody, 200));
    const c = client(fetchImpl);
    const result = await c.metadataScrub({ url: 'https://example.com/a.pdf' });
    expect(result).toEqual(failureBody);
  });

  it('(d) missing report header on a binary response -> HelixApiError status 502', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      scrubResponse(new Blob(['bytes']), 200, { 'content-type': 'application/pdf' }),
    );
    const c = client(fetchImpl);
    await expect(c.metadataScrub({ url: 'https://example.com/a.pdf' })).rejects.toMatchObject({
      name: 'HelixApiError',
      status: 502,
      message: 'The scrub returned a file without its metadata report.',
    });
  });

  it('(e) invalid JSON in the report header -> HelixApiError status 502', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      scrubResponse(new Blob(['bytes']), 200, {
        'content-type': 'application/pdf',
        'x-helix-metadata-report': '{not valid json',
      }),
    );
    const c = client(fetchImpl);
    await expect(c.metadataScrub({ url: 'https://example.com/a.pdf' })).rejects.toMatchObject({
      name: 'HelixApiError',
      status: 502,
      message: 'The scrub returned a metadata report that was not valid JSON.',
    });
  });

  it('(f) a non-2xx JSON error body -> HelixApiError with that status and message', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: 'invalid_request', message: 'file too large', field: 'file' }, 413),
    );
    const c = client(fetchImpl);
    await expect(c.metadataScrub({ url: 'https://example.com/a.pdf' })).rejects.toMatchObject({
      name: 'HelixApiError',
      status: 413,
      message: 'file too large',
      body: { error: 'invalid_request', field: 'file' },
    });
  });

  it('(g) fetch rejecting with a plain Error -> HelixApiError status 0', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('network down');
    });
    const c = client(fetchImpl);
    await expect(c.metadataScrub({ url: 'https://example.com/a.pdf' })).rejects.toMatchObject({
      name: 'HelixApiError',
      status: 0,
      message: 'network down',
    });
  });
});
