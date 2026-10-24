import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchClient } from '../fetch/client.js';
import { ExtractClient } from '../extract/client.js';

/** With a service token configured, the API sends it on every call to the fetch and extract services. */

function stubFetch(body: unknown) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', mock);
  return mock;
}

function sentHeaders(mock: ReturnType<typeof stubFetch>): Record<string, string> {
  const init = (mock.mock.calls[0] as unknown as [string, RequestInit])[1];
  return init.headers as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('service token', () => {
  it('rides on a fetch-service call', async () => {
    const mock = stubFetch({ success: true, status: 200, headers: {}, set_cookies: [], body: '', timing_ms: 1 });
    await new FetchClient('http://127.0.0.1:1', undefined, 'svc-token').fetch({ url: 'https://example.com', impersonate: false });

    expect(sentHeaders(mock)['x-helix-service-token']).toBe('svc-token');
  });

  it('rides on an extract-service call', async () => {
    const mock = stubFetch({ markdown: '', text: '', links: [], extractor_used: 'trafilatura', content_hash: 'x' });
    await new ExtractClient('http://127.0.0.1:1', undefined, 'svc-token').extract({ html: '<p>x</p>', url: 'https://example.com' });

    expect(sentHeaders(mock)['x-helix-service-token']).toBe('svc-token');
  });

  it('is absent when no token is configured', async () => {
    const mock = stubFetch({ success: true, status: 200, headers: {}, set_cookies: [], body: '', timing_ms: 1 });
    await new FetchClient('http://127.0.0.1:1').fetch({ url: 'https://example.com', impersonate: false });

    expect(sentHeaders(mock)['x-helix-service-token']).toBeUndefined();
  });
});
