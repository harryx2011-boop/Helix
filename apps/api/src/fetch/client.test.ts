import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchClient } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FetchClient', () => {
  it('maps every Set-Cookie line helix-fetch returns', async () => {
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

    const result = await new FetchClient('http://127.0.0.1:7401').fetch({ url: 'https://example.com', impersonate: true });
    expect(result.setCookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });
});
