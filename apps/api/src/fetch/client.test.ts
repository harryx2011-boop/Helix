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

  it("sends a caller's profile as an identity and reads back the one applied", async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json({ success: true, status: 200, headers: {}, body: '<html></html>', profile_used: 'chrome-148', timing_ms: 9 });
      }),
    );

    const result = await new FetchClient('http://127.0.0.1:7403').render({
      url: 'https://example.com',
      identity: {
        id: 'chrome-148',
        userAgent: 'UA',
        acceptLanguage: 'en-US',
        timezone: 'America/New_York',
        screen: { width: 1920, height: 1080 },
        initScript: '(() => {})()',
      },
    });

    expect(sent['identity']).toEqual({
      id: 'chrome-148',
      user_agent: 'UA',
      accept_language: 'en-US',
      timezone: 'America/New_York',
      screen: { width: 1920, height: 1080 },
      init_script: '(() => {})()',
    });
    expect(result.profileUsed).toBe('chrome-148');
  });

  it("S21: reads helix-scrape's challenge_ms as challengeMs", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: true, status: 200, headers: {}, body: '<html></html>', challenge_ms: 19_850, timing_ms: 21_000 })),
    );
    const result = await new FetchClient('http://127.0.0.1:7403').render({ url: 'https://example.com', solveCloudflare: true });
    expect(result.challengeMs).toBe(19_850);
  });

  it('reports an unreachable helix-scrape as a service problem, not a page problem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const result = await new FetchClient('http://127.0.0.1:7403').render({ url: 'https://example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fetch failed|helix-scrape/);
  });

  it('S1: sends /fetch to the fetch address and /render to the render address when they differ', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ success: true, status: 200, headers: {}, body: '' }), { status: 200 });
      }),
    );
    const client = new FetchClient('http://127.0.0.1:7401', undefined, undefined, 'http://127.0.0.1:7403/');
    await client.fetch({ url: 'https://example.com', impersonate: true });
    await client.render({ url: 'https://example.com' });
    expect(calls).toEqual(['http://127.0.0.1:7401/fetch', 'http://127.0.0.1:7403/render']);
  });

  it('S2: renders on the fetch address when no render address is set', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ success: true, status: 200, headers: {}, body: '' }), { status: 200 });
      }),
    );
    await new FetchClient('http://127.0.0.1:7403').render({ url: 'https://example.com' });
    expect(calls).toEqual(['http://127.0.0.1:7403/render']);
  });

  it('S3: reports unhealthy when the render service is down even if fetch answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('http://127.0.0.1:7403')) throw new TypeError('fetch failed');
        return new Response('{}', { status: 200 });
      }),
    );
    const client = new FetchClient('http://127.0.0.1:7401', undefined, undefined, 'http://127.0.0.1:7403');
    expect(await client.health()).toBe(false);
  });
});
