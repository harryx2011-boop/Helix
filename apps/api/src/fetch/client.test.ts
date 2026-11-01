import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchClient } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FetchClient', () => {
  it('maps every Set-Cookie line helix-scrape returns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          success: true,
          status: 200,
          headers: { 'set-cookie': 'b=2; Path=/' },
          set_cookies: ['a=1; Path=/', 'b=2; Path=/'],
          body: '<html></html>',
          profile_used: 'chrome-149',
          timing_ms: 12,
        }),
      ),
    );

    const result = await new FetchClient('http://127.0.0.1:7403').fetch({ url: 'https://example.com', impersonate: true });
    expect(result.setCookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it("sends a render in helix-scrape's snake_case and maps the reply back", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return Response.json({
          success: true,
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: '<html>rendered</html>',
          final_url: 'https://example.com/',
          cookies: [{ name: 'cf_clearance', value: 'x', domain: '.example.com', path: '/' }],
          timing_ms: 1500,
        });
      }),
    );

    const result = await new FetchClient('http://127.0.0.1:7403').render({
      url: 'https://example.com',
      timeoutMs: 20_000,
      waitMs: 500,
      stealth: true,
      solveCloudflare: true,
      blockAds: true,
      disableResources: true,
      proxy: 'http://p:1',
      headers: { 'Accept-Language': 'de' },
      allowPrivate: false,
    });

    expect(calls[0]?.url).toBe('http://127.0.0.1:7403/render');
    expect(calls[0]?.body).toEqual({
      url: 'https://example.com',
      timeout_ms: 20_000,
      wait_ms: 500,
      stealth: true,
      solve_cloudflare: true,
      block_ads: true,
      disable_resources: true,
      proxy: 'http://p:1',
      headers: { 'Accept-Language': 'de' },
      allow_private: false,
    });
    expect(result).toMatchObject({
      success: true,
      status: 200,
      body: '<html>rendered</html>',
      finalUrl: 'https://example.com/',
      timingMs: 1500,
    });
    expect(result.cookies?.[0]?.name).toBe('cf_clearance');
  });

  it('reports an unreachable helix-scrape as a service problem, not a page problem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const result = await new FetchClient('http://127.0.0.1:7403').render({ url: 'https://example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fetch failed|helix-scrape/);
  });
});
