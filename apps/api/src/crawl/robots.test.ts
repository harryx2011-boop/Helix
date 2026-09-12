import { describe, expect, it, vi } from 'vitest';
import { RobotsCache } from './robots.js';

/**
 * Where the robots.txt fetch is allowed to end up.
 *
 * A public host answering 302 to an internal address is the usual way around a
 * check made only on the first URL, so redirects are followed by hand and every
 * hop is checked.
 */

function respond(status: number, headers: Record<string, string>, body = ''): Response {
  return new Response(body, { status, headers });
}

describe('RobotsCache redirects', () => {
  it('refuses to follow a redirect to a private address', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).includes('example.com')) {
        return respond(302, { location: 'http://127.0.0.1/x' });
      }
      return respond(200, {}, 'User-agent: *\nDisallow: /');
    });

    const robots = new RobotsCache('HelixBot/test', undefined, fetchImpl as unknown as typeof fetch);
    const rules = await robots.forUrl('https://example.com/page');

    // The hop was refused, so no rules were read: everything is permitted.
    expect(rules.isAllowed('https://example.com/page')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls.every((call) => !String(call[0]).includes('127.0.0.1'))).toBe(true);
  });

  it('follows a public redirect to a public address', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).includes('example.com')) {
        return respond(302, { location: 'https://cdn.example.net/robots.txt' });
      }
      return respond(200, {}, 'User-agent: *\nDisallow: /admin');
    });

    const robots = new RobotsCache('HelixBot/test', undefined, fetchImpl as unknown as typeof fetch);
    const rules = await robots.forUrl('https://example.com/page');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(rules.isAllowed('https://example.com/admin/x')).toBe(false);
    expect(rules.isAllowed('https://example.com/page')).toBe(true);
  });

  it('asks for a manual redirect rather than letting fetch follow one', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      respond(200, {}, 'User-agent: *\nDisallow:'),
    );

    const robots = new RobotsCache('HelixBot/test', undefined, fetchImpl as unknown as typeof fetch);
    await robots.forUrl('https://example.com/page');

    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('gives up rather than following a redirect chain without end', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => respond(302, { location: `https://example.com/${++n}` }));

    const robots = new RobotsCache('HelixBot/test', undefined, fetchImpl as unknown as typeof fetch);
    const rules = await robots.forUrl('https://example.com/page');

    expect(rules.isAllowed('https://example.com/page')).toBe(true);
    expect(fetchImpl.mock.calls.length).toBeLessThan(12);
  });
});
