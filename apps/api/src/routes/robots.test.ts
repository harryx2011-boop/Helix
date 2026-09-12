import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRobots, type RobotsRouteDeps } from './robots.js';
import { RobotsCache } from '../crawl/robots.js';

vi.mock('../crawl/robots.js', () => ({
  RobotsCache: vi.fn(),
}));

let app: FastifyInstance | undefined;

async function build(deps: RobotsRouteDeps = { userAgent: 'HelixBot/0.1' }): Promise<FastifyInstance> {
  app = Fastify();
  await registerRobots(app, deps);
  return app;
}

function mockRules(over: Partial<{ isAllowed: boolean; crawlDelaySeconds: number | undefined; sitemaps: string[] }> = {}) {
  const isAllowed = over.isAllowed ?? true;
  const crawlDelaySeconds = over.crawlDelaySeconds;
  const sitemaps = over.sitemaps ?? [];
  return {
    isAllowed: vi.fn(() => isAllowed),
    crawlDelaySeconds: vi.fn(() => crawlDelaySeconds),
    sitemaps: vi.fn(() => sitemaps),
  };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.clearAllMocks();
});

describe('POST /robots-check', () => {
  it('rejects a missing url', async () => {
    const instance = await build();

    const response = await instance.inject({ method: 'POST', url: '/robots-check', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('url');
  });

  it('rejects a non-url', async () => {
    const instance = await build();

    const response = await instance.inject({ method: 'POST', url: '/robots-check', payload: { url: 'not-a-url' } });

    expect(response.statusCode).toBe(400);
  });

  it('reports an allowed url with the instance user agent by default', async () => {
    const forUrl = vi.fn(async () => mockRules({ isAllowed: true }));
    vi.mocked(RobotsCache).mockImplementation(() => ({ forUrl }) as unknown as RobotsCache);
    const instance = await build({ userAgent: 'HelixBot/0.1' });

    const response = await instance.inject({
      method: 'POST',
      url: '/robots-check',
      payload: { url: 'https://example.com/private' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      url: 'https://example.com/private',
      userAgent: 'HelixBot/0.1',
      allowed: true,
      crawlDelaySeconds: null,
      sitemaps: [],
    });
    expect(RobotsCache).toHaveBeenCalledWith('HelixBot/0.1', expect.anything());
    expect(forUrl).toHaveBeenCalledWith('https://example.com/private');
  });

  it('reports a disallowed url', async () => {
    const forUrl = vi.fn(async () => mockRules({ isAllowed: false }));
    vi.mocked(RobotsCache).mockImplementation(() => ({ forUrl }) as unknown as RobotsCache);
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/robots-check',
      payload: { url: 'https://example.com/admin' },
    });

    expect(response.json().allowed).toBe(false);
  });

  it('uses a caller-supplied user agent instead of the instance default', async () => {
    const forUrl = vi.fn(async () => mockRules());
    vi.mocked(RobotsCache).mockImplementation(() => ({ forUrl }) as unknown as RobotsCache);
    const instance = await build({ userAgent: 'HelixBot/0.1' });

    const response = await instance.inject({
      method: 'POST',
      url: '/robots-check',
      payload: { url: 'https://example.com', userAgent: 'GPTBot' },
    });

    expect(response.json().userAgent).toBe('GPTBot');
    expect(RobotsCache).toHaveBeenCalledWith('GPTBot', expect.anything());
  });

  /* The URL is the caller's choice of what this instance connects to. Without
     the guard, `/robots-check` fetches `http://127.0.0.1:<port>/robots.txt` and
     reports on internal content. */
  it('refuses a private or link-local address', async () => {
    const forUrl = vi.fn(async () => mockRules());
    vi.mocked(RobotsCache).mockImplementation(() => ({ forUrl }) as unknown as RobotsCache);
    const instance = await build();

    for (const url of ['http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/']) {
      const response = await instance.inject({ method: 'POST', url: '/robots-check', payload: { url } });

      expect(response.statusCode).toBe(400);
      expect(response.json().field).toBe('url');
    }
    expect(forUrl).not.toHaveBeenCalled();
  });

  it('fetches a private address when the operator allowed it', async () => {
    const forUrl = vi.fn(async () => mockRules());
    vi.mocked(RobotsCache).mockImplementation(() => ({ forUrl }) as unknown as RobotsCache);
    const instance = await build({ userAgent: 'HelixBot/0.1', allowPrivateUrls: true });

    const response = await instance.inject({
      method: 'POST',
      url: '/robots-check',
      payload: { url: 'http://127.0.0.1/' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('reports the crawl delay and sitemaps when the site sets them', async () => {
    const forUrl = vi.fn(async () => mockRules({ crawlDelaySeconds: 5, sitemaps: ['https://example.com/sitemap.xml'] }));
    vi.mocked(RobotsCache).mockImplementation(() => ({ forUrl }) as unknown as RobotsCache);
    const instance = await build();

    const response = await instance.inject({ method: 'POST', url: '/robots-check', payload: { url: 'https://example.com' } });

    const body = response.json();
    expect(body.crawlDelaySeconds).toBe(5);
    expect(body.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });
});
