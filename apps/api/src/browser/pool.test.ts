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
let imageHits = 0;
const headersSeen = new Map<string, Record<string, string | string[] | undefined>>();

/** What a page's own script reads about the browser, written into the DOM so `render` returns it. */
const PROBE_PAGE = `<html><body><pre id="out"></pre><script>
const c = document.createElement('canvas');
c.width = 64; c.height = 16;
const x = c.getContext('2d');
x.fillStyle = '#808080'; x.fillRect(0, 0, 64, 16);
x.fillStyle = '#123456'; x.fillText('helix', 2, 12);
const reads = [c.toDataURL(), c.toDataURL(), c.toDataURL()];
const get = Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency').get;
document.getElementById('out').textContent = JSON.stringify({
  ua: navigator.userAgent,
  webdriver: navigator.webdriver,
  chrome: typeof window.chrome,
  plugins: navigator.plugins.length,
  pluginsTag: Object.prototype.toString.call(navigator.plugins),
  pluginOwnKeys: Object.getOwnPropertyNames(navigator.plugins),
  brands: navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand) : null,
  stable: reads[0] === reads[1] && reads[1] === reads[2],
  canvas: reads[0],
  sources: [
    Function.prototype.toString.call(get),
    HTMLCanvasElement.prototype.toDataURL.toString(),
    WebGLRenderingContext.prototype.getParameter.toString(),
    Function.prototype.toString.toString(),
  ],
});
</script></body></html>`;

interface Probe {
  ua: string;
  webdriver: boolean;
  chrome: string;
  plugins: number;
  pluginsTag: string;
  pluginOwnKeys: string[];
  brands: string[] | null;
  stable: boolean;
  canvas: string;
  sources: string[];
}

function probeOf(html: string | undefined): Probe {
  const json = /<pre id="out">([\s\S]*?)<\/pre>/.exec(html ?? '')?.[1];
  if (!json) throw new Error(`probe page did not report: ${html?.slice(0, 200)}`);
  return JSON.parse(json) as Probe;
}

beforeAll(async () => {
  server = createServer((request, response) => {
    hits++;
    headersSeen.set(request.url ?? '', request.headers);
    if (request.url === '/hop') {
      // What a JS challenge does: answer, then submit itself once the document is parsed.
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        '<html><body><form action="/landing"><input name="solution" value="1"></form>' +
          '<script>document.addEventListener("DOMContentLoaded", () => document.forms[0].submit())</script></body></html>',
      );
      return;
    }
    if (request.url?.startsWith('/landing')) {
      setTimeout(() => {
        response.writeHead(403, { 'content-type': 'text/html', 'x-landed': '1' });
        response.end('<html><body><p>landed</p></body></html>');
      }, 300);
      return;
    }
    if (request.url === '/spin') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html><body><p>spin</p><script>for (;;) {}</script></body></html>');
      return;
    }
    if (request.url === '/stall') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.write('<html><body><p>stall');
      return;
    }
    if (request.url === '/probe') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(PROBE_PAGE);
      return;
    }
    if (request.url?.endsWith('.png')) {
      imageHits++;
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

  // A public-looking name that resolves to a private address is refused by
  // the guard itself (blocked by client), not by a failed lookup in the browser.
  it('refuses a name that resolves to a private address', async () => {
    const port = new URL(origin).port;
    const browsers = pool({
      lookup: async (host) => (host === 'rebind.helix-test' ? [{ address: '127.0.0.1', family: 4 }] : []),
    });
    try {
      const result = await browsers.render({ url: `http://rebind.helix-test:${port}/`, timeout: 20_000 });
      expect(result.error ?? '').toMatch(/BLOCKED_BY_CLIENT/i);
    } finally {
      await browsers.close();
    }
  }, 90_000);

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

describe('the chromium tier does not announce automation', () => {
  it('presents a headful UA, client hints and browser surface on a default render', async () => {
    const browsers = pool();
    try {
      const result = await browsers.render({ url: `${origin}probe`, allowPrivate: true, timeout: 20_000 });
      const probe = probeOf(result.html);
      const sent = headersSeen.get('/probe') ?? {};

      expect(sent['user-agent']).toMatch(/ Chrome\/\d+\.0\.0\.0 /);
      expect(String(sent['user-agent'])).not.toContain('Headless');
      expect(String(sent['sec-ch-ua'])).not.toContain('Headless');
      expect(sent['accept-language']).toBeTruthy();
      expect(probe.ua).toBe(sent['user-agent']);
      expect(probe.brands?.join(',')).not.toContain('Headless');
      expect(probe.webdriver).toBe(false);
      expect(probe.chrome).toBe('object');
      expect(probe.plugins).toBe(5);
      expect(probe.pluginsTag).toBe('[object PluginArray]');
      // A real PluginArray carries only its indexes and names as own keys.
      expect(probe.pluginOwnKeys).not.toContain('length');
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('sends the profile UA and its full Accept-Language', async () => {
    const browsers = pool();
    try {
      const result = await browsers.render({
        url: `${origin}probe`,
        profile: 'chrome-137',
        allowPrivate: true,
        timeout: 20_000,
      });
      const sent = headersSeen.get('/probe') ?? {};

      expect(result.profileUsed).toBe('chrome-137');
      expect(sent['user-agent']).toContain('Macintosh; Intel Mac OS X 10_15_7');
      expect(sent['user-agent']).toContain('Chrome/137.0.0.0');
      expect(sent['accept-language']).toBe('en-GB,en-US;q=0.9,en;q=0.8');
      expect(sent['sec-ch-ua']).toContain('"Google Chrome";v="137"');
      expect(sent['sec-ch-ua-platform']).toBe('"macOS"');
      expect(probeOf(result.html).ua).toBe(sent['user-agent']);
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('reports every override as native code', async () => {
    const browsers = pool();
    try {
      const result = await browsers.render({
        url: `${origin}probe`,
        profile: 'chrome-148',
        allowPrivate: true,
        timeout: 20_000,
      });
      expect(probeOf(result.html).sources).toEqual([
        'function get hardwareConcurrency() { [native code] }',
        'function toDataURL() { [native code] }',
        'function getParameter() { [native code] }',
        'function toString() { [native code] }',
      ]);
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('keeps the canvas hash stable across reads, and still perturbed', async () => {
    const browsers = pool();
    try {
      const masked = probeOf(
        (await browsers.render({ url: `${origin}probe`, profile: 'chrome-148', allowPrivate: true, timeout: 20_000 }))
          .html,
      );
      const bare = probeOf(
        (await browsers.render({ url: `${origin}probe`, allowPrivate: true, timeout: 20_000 })).html,
      );

      expect(masked.stable).toBe(true);
      expect(bare.stable).toBe(true);
      expect(masked.canvas).not.toBe(bare.canvas);
    } finally {
      await browsers.close();
    }
  }, 90_000);
});

describe('resource blocking', () => {
  const render = async (options: { blockResources?: boolean; screenshot?: boolean }): Promise<number> => {
    const browsers = pool();
    try {
      imageHits = 0;
      const result = await browsers.render({
        url: origin,
        allowPrivate: true,
        waitFor: 500,
        timeout: 20_000,
        ...options,
      });
      expect(result.error).toBeUndefined();
      expect(result.html).toContain('private');
      return imageHits;
    } finally {
      await browsers.close();
    }
  };

  it('loads images by default', async () => {
    expect(await render({})).toBeGreaterThan(0);
  }, 90_000);

  it('aborts images when asked', async () => {
    expect(await render({ blockResources: true })).toBe(0);
  }, 90_000);

  it('never blocks a render that takes a screenshot', async () => {
    expect(await render({ blockResources: true, screenshot: true })).toBeGreaterThan(0);
  }, 90_000);
});

describe('a page that navigates itself after load', () => {
  it('returns the document it lands on instead of failing mid-navigation', async () => {
    const browsers = pool();
    try {
      const result = await browsers.render({ url: `${origin}hop`, allowPrivate: true, timeout: 10_000 });
      expect(result.error).toBeUndefined();
      expect(result.html).toContain('landed');
      expect(result.finalUrl).toContain('/landing?solution=1');
      // The status and headers describe the document returned, not the one goto answered.
      expect(result.status).toBe(403);
      expect(result.headers['x-landed']).toBe('1');
    } finally {
      await browsers.close();
    }
  }, 60_000);
});

describe('the timeout is the whole budget', () => {
  // A renderer stuck in script (a JS challenge's proof of work, here a bare
  // loop) leaves page.close() waiting for minutes. The render must still
  // answer at its budget, and the browser must keep serving.
  for (const path of ['spin', 'stall']) {
    it(`answers a ${path} page at its budget and keeps the pool usable`, async () => {
      const browsers = pool();
      try {
        await browsers.start();
        const started = Date.now();
        const stuck = await browsers.render({ url: `${origin}${path}`, allowPrivate: true, timeout: 2_000 });
        expect(stuck.error).toMatch(/timeout/);
        expect(Date.now() - started).toBeLessThan(4_000);

        const next = await browsers.render({ url: origin, allowPrivate: true, timeout: 10_000 });
        expect(next.error).toBeUndefined();
        expect(next.html).toContain('private');
      } finally {
        await browsers.close();
      }
    }, 60_000);
  }
});
