import { describe, expect, it, vi } from 'vitest';
import { SitemapFetcher } from './sitemap.js';

/**
 * Where the sitemap fetch is allowed to end up. A sitemap URL is quoted from a
 * remote robots.txt, so it is attacker-chosen twice over: once in the file and
 * again in whatever it redirects to.
 */

const URLSET = '<urlset><url><loc>https://example.com/a</loc></url></urlset>';

function respond(status: number, headers: Record<string, string>, body = ''): Response {
  return new Response(body, { status, headers });
}

describe('SitemapFetcher redirects', () => {
  it('refuses to follow a redirect to a private address', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).includes('example.com')) return respond(302, { location: 'http://127.0.0.1/x' });
      return respond(200, {}, URLSET);
    });

    const sitemaps = new SitemapFetcher('HelixBot/test', undefined, fetchImpl as unknown as typeof fetch);
    const entries = await sitemaps.fetch('https://example.com/sitemap.xml');

    expect(entries).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls.every((call) => !String(call[0]).includes('127.0.0.1'))).toBe(true);
  });

  it('refuses a sitemap URL that is itself private, before any fetch', async () => {
    const fetchImpl = vi.fn(async () => respond(200, {}, URLSET));

    const sitemaps = new SitemapFetcher('HelixBot/test', undefined, fetchImpl as unknown as typeof fetch);
    const entries = await sitemaps.fetch('http://169.254.169.254/sitemap.xml');

    expect(entries).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('follows a public redirect to a public address', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).includes('example.com')) {
        return respond(302, { location: 'https://cdn.example.net/sitemap.xml' });
      }
      return respond(200, {}, URLSET);
    });

    const sitemaps = new SitemapFetcher('HelixBot/test', undefined, fetchImpl as unknown as typeof fetch);
    const entries = await sitemaps.fetch('https://example.com/sitemap.xml');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(entries.map((e) => e.url)).toEqual(['https://example.com/a']);
  });

  it('asks for a manual redirect rather than letting fetch follow one', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => respond(200, {}, URLSET));

    const sitemaps = new SitemapFetcher('HelixBot/test', undefined, fetchImpl as unknown as typeof fetch);
    await sitemaps.fetch('https://example.com/sitemap.xml');

    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });
});
