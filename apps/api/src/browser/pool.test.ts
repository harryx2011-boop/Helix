import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserPool } from './pool.js';
import { RENDER_ENGINES } from './engines.js';

/**
 * The pool tests that need a real browser.
 *
 * The private-address guard is a security control, and whether an engine
 * honours `context.route` is a property of that engine, not something a mock
 * can answer. So the guard is tested by pointing a real browser of each engine
 * at a real loopback server and asserting the server was never touched — an
 * assertion that fails loudly if a future Playwright drops routing support on
 * one of them.
 */

let server: Server;
let origin: string;
let hits = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    hits++;
    if (request.url?.endsWith('.png')) {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(Buffer.alloc(8));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><body><h1>private</h1><img src="/sub.png"></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function pool(overrides: Partial<ConstructorParameters<typeof BrowserPool>[0]> = {}) {
  return new BrowserPool({ size: 1, maxContexts: 4, recycleAfter: 100, ...overrides });
}

describe('the private-address guard holds on every engine', () => {
  for (const engine of RENDER_ENGINES) {
    it(`refuses a loopback target on ${engine}`, async () => {
      const browsers = pool({ defaultEngine: engine });
      try {
        hits = 0;
        const result = await browsers.render({ url: origin, timeout: 20_000 });

        // The render fails and, more importantly, nothing reached the server.
        expect(result.error).toBeTruthy();
        expect(hits).toBe(0);
        expect(result.html ?? '').not.toContain('private');
      } finally {
        await browsers.close();
      }
    }, 90_000);
  }

  it('lets the operator opt in, which proves the guard was what blocked it', async () => {
    const browsers = pool();
    try {
      hits = 0;
      const result = await browsers.render({ url: origin, timeout: 20_000, allowPrivate: true });
      expect(result.error).toBeUndefined();
      expect(result.html).toContain('private');
      expect(hits).toBeGreaterThan(0);
    } finally {
      await browsers.close();
    }
  }, 90_000);
});

describe('engine selection', () => {
  it('renders on the engine the request names, not the instance default', async () => {
    const browsers = pool({ defaultEngine: 'chromium' });
    try {
      const result = await browsers.render({
        url: origin,
        renderEngine: 'firefox',
        allowPrivate: true,
        timeout: 20_000,
      });
      expect(result.engineUsed).toBe('firefox');
      expect(result.html).toContain('private');
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('launches only the default engine at boot, and others on demand', async () => {
    const browsers = pool({ defaultEngine: 'chromium' });
    try {
      await browsers.start();
      // Launching all three eagerly would cost seconds and hundreds of MB for
      // engines most instances never ask for.
      expect(browsers.stats().engines).toEqual(['chromium']);

      await browsers.render({ url: origin, renderEngine: 'webkit', allowPrivate: true, timeout: 20_000 });
      expect(browsers.stats().engines.sort()).toEqual(['chromium', 'webkit']);
    } finally {
      await browsers.close();
    }
  }, 120_000);

  it('does not let one engine borrow another engine spare capacity', async () => {
    // A context inherits the process it is opened in, so a firefox request
    // needs a firefox browser however idle the chromium one is.
    const browsers = pool({ defaultEngine: 'chromium', size: 1 });
    try {
      await browsers.start();
      await browsers.render({ url: origin, renderEngine: 'firefox', allowPrivate: true, timeout: 20_000 });
      const stats = browsers.stats();
      expect(stats.browsers).toBe(2);
      expect(stats.engines.sort()).toEqual(['chromium', 'firefox']);
    } finally {
      await browsers.close();
    }
  }, 120_000);
});

describe('identity coherence', () => {
  it('drops a chrome identity on firefox rather than presenting a contradiction', async () => {
    const browsers = pool({ defaultEngine: 'firefox' });
    try {
      const result = await browsers.render({
        url: origin,
        profile: 'chrome-148',
        allowPrivate: true,
        timeout: 20_000,
      });
      expect(result.profileUsed).toBeUndefined();
      expect(result.warnings?.join(' ')).toMatch(/contradicts the firefox engine/);
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('applies a chrome identity on chromium', async () => {
    const browsers = pool({ defaultEngine: 'chromium' });
    try {
      const result = await browsers.render({
        url: origin,
        profile: 'chrome-148',
        allowPrivate: true,
        timeout: 20_000,
      });
      expect(result.profileUsed).toBe('chrome-148');
      expect(result.warnings).toBeUndefined();
    } finally {
      await browsers.close();
    }
  }, 90_000);
});

describe('mobile emulation', () => {
  it('says so when firefox cannot apply the phone viewport', async () => {
    const browsers = pool({ defaultEngine: 'firefox' });
    try {
      const result = await browsers.render({
        url: origin,
        mobile: true,
        allowPrivate: true,
        timeout: 20_000,
      });
      expect(result.warnings?.join(' ')).toMatch(/firefox engine does not emulate touch/);
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('applies it silently on chromium and webkit', async () => {
    for (const engine of ['chromium', 'webkit'] as const) {
      const browsers = pool({ defaultEngine: engine });
      try {
        const result = await browsers.render({
          url: origin,
          mobile: true,
          allowPrivate: true,
          timeout: 20_000,
        });
        expect(result.warnings ?? []).toEqual([]);
      } finally {
        await browsers.close();
      }
    }
  }, 120_000);
});

describe('optional tiers refuse clearly when they are off', () => {
  it('refuses camoufox when the operator has not enabled it', async () => {
    const browsers = pool();
    try {
      const result = await browsers.render({ url: 'https://example.com/', engine: 'camoufox' });
      expect(result.error).toBe('camoufox tier requested but not enabled');
      // Refused before anything is dialled, exactly as lightpanda refuses.
      expect(result.html).toBeUndefined();
    } finally {
      await browsers.close();
    }
  });

  it('refuses lightpanda when it is off, unchanged', async () => {
    const browsers = pool();
    try {
      const result = await browsers.render({ url: 'https://example.com/', engine: 'lightpanda' });
      expect(result.error).toBe('lightpanda tier requested but not enabled');
    } finally {
      await browsers.close();
    }
  });

  it('reports the endpoint being unreachable rather than falling back to a local browser', async () => {
    // A silent fallback would answer with a browser the operator did not ask
    // for, which is the opposite of what an anti-detect tier is for.
    const browsers = pool({ camoufoxEnabled: true, camoufoxUrl: 'ws://127.0.0.1:1/' });
    try {
      const result = await browsers.render({
        url: 'https://example.com/',
        engine: 'camoufox',
        timeout: 8_000,
      });
      expect(result.error).toBeTruthy();
      expect(result.html).toBeUndefined();
    } finally {
      await browsers.close();
    }
  }, 30_000);
});

describe('the remote browser backend', () => {
  it('refuses a non-chromium engine, because CDP cannot drive one', async () => {
    const browsers = pool({ remoteCdpUrl: 'http://127.0.0.1:1', defaultEngine: 'firefox' });
    try {
      const result = await browsers.render({ url: 'https://example.com/', timeout: 8_000 });
      expect(result.error).toMatch(/cannot drive the firefox engine/);
    } finally {
      await browsers.close();
    }
  }, 30_000);

  it('surfaces an unreachable remote instead of quietly launching locally', async () => {
    const browsers = pool({ remoteCdpUrl: 'http://127.0.0.1:1' });
    try {
      const result = await browsers.render({ url: 'https://example.com/', timeout: 8_000 });
      expect(result.error).toBeTruthy();
      expect(result.html).toBeUndefined();
      // Nothing was launched here: the remote path never touches the pool.
      expect(browsers.stats().browsers).toBe(0);
    } finally {
      await browsers.close();
    }
  }, 30_000);
});
