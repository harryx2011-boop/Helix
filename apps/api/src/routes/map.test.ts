import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { discoverUrls, registerMap, type MapRouteDeps } from './map.js';

/**
 * Link discovery had no host filter at all: every off-site link on the seed
 * page was recorded as part of the site's map, and `includeSubdomains` was
 * parsed from the request and then dropped before it reached this function.
 */
function deps(links: string[]): MapRouteDeps {
  return {
    userAgent: 'helix-test',
    fetchClient: {
      fetch: async () => ({ body: '<html></html>', status: 200, url: 'https://example.com' }),
    },
    extractClient: {
      extract: async () => ({ links, markdown: '', html: '', metadata: {} }),
    },
  } as unknown as MapRouteDeps;
}

const OPTIONS = {
  sitemap: 'skip' as const,
  limit: 100,
  ignoreQueryParameters: true,
};

describe('host scoping', () => {
  const LINKS = [
    'https://example.com/a',
    'https://example.com/b',
    'https://docs.example.com/c',
    'https://blog.example.com/d',
    'https://evil.test/e',
    'https://partner.org/f',
  ];

  it('keeps only the seed host by default', async () => {
    const { links } = await discoverUrls('https://example.com/', OPTIONS, deps(LINKS));
    const hosts = new Set(links.map((l) => new URL(l.url).hostname));

    expect(hosts).toEqual(new Set(['example.com']));
    expect(links).toHaveLength(2);
  });

  it('admits subdomains only when asked', async () => {
    const { links } = await discoverUrls(
      'https://example.com/',
      { ...OPTIONS, includeSubdomains: true },
      deps(LINKS),
    );
    const hosts = new Set(links.map((l) => new URL(l.url).hostname));

    expect(hosts).toEqual(new Set(['example.com', 'docs.example.com', 'blog.example.com']));
  });

  it('never admits an unrelated site, with or without the flag', async () => {
    for (const includeSubdomains of [false, true]) {
      const { links } = await discoverUrls(
        'https://example.com/',
        { ...OPTIONS, includeSubdomains },
        deps(LINKS),
      );
      const hosts = links.map((l) => new URL(l.url).hostname);

      expect(hosts, `includeSubdomains=${includeSubdomains}`).not.toContain('evil.test');
      expect(hosts, `includeSubdomains=${includeSubdomains}`).not.toContain('partner.org');
    }
  });

  it('does not treat a lookalike host as a subdomain', async () => {
    // notexample.com ends with "example.com" as a string but is a different site.
    const { links } = await discoverUrls(
      'https://example.com/',
      { ...OPTIONS, includeSubdomains: true },
      deps(['https://example.com/a', 'https://notexample.com/b', 'https://example.com.evil.test/c']),
    );
    const hosts = links.map((l) => new URL(l.url).hostname);

    expect(hosts).toEqual(['example.com']);
  });

  it('starts from a subdomain seed without losing its own pages', async () => {
    const { links } = await discoverUrls(
      'https://docs.example.com/',
      OPTIONS,
      deps(['https://docs.example.com/a', 'https://example.com/b']),
    );

    expect(links.map((l) => l.url)).toEqual(['https://docs.example.com/a']);
  });

  it('ignores an unparseable link rather than throwing', async () => {
    const { links } = await discoverUrls(
      'https://example.com/',
      OPTIONS,
      deps(['https://example.com/a', 'not a url', '']),
    );

    expect(links).toHaveLength(1);
  });
});

/**
 * The seed URL is the caller's choice of what this instance connects to.
 * Without the guard, `/map` fetches `http://127.0.0.1:<port>/` and returns the
 * links it found on an internal page.
 */
describe('POST /map egress guard', () => {
  let app: FastifyInstance | undefined;

  async function build(over: Partial<MapRouteDeps> = {}): Promise<FastifyInstance> {
    app = Fastify();
    await registerMap(app, { ...deps([]), ...over });
    return app;
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('refuses a private or link-local seed', async () => {
    const instance = await build();

    for (const url of ['http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/']) {
      const response = await instance.inject({ method: 'POST', url: '/map', payload: { url } });

      expect(response.statusCode).toBe(400);
      expect(response.json().field).toBe('url');
    }
  });

  it('maps a public seed as before', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/map',
      payload: { url: 'https://example.com/', sitemap: 'skip' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('maps a private seed when the operator allowed it', async () => {
    const instance = await build({ allowPrivateUrls: true });

    const response = await instance.inject({
      method: 'POST',
      url: '/map',
      payload: { url: 'http://127.0.0.1/', sitemap: 'skip' },
    });

    expect(response.statusCode).toBe(200);
  });
});
