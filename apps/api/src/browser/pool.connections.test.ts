import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The shared connection to an external browser (camoufox here; lightpanda and
 * a remote CDP endpoint go through the same `#connection`).
 *
 * Driven through the public ways in, `probeExternalTiers()` and `render()`,
 * with a fake `firefox.connect` that counts connects and lets a test drop a
 * connection.
 */

interface FakeBrowser {
  connected: boolean;
  onDisconnect: (() => void)[];
  isConnected: () => boolean;
  on: (event: string, handler: () => void) => void;
  close: () => Promise<void>;
  newContext: () => Promise<unknown>;
}

const fake = vi.hoisted(() => ({
  connects: 0,
  browsers: [] as FakeBrowser[],
}));

vi.mock('playwright', () => {
  const page = {
    close: async () => undefined,
    goto: async () => null,
    content: async () => '<html>ok</html>',
    url: () => 'https://example.com/',
    waitForTimeout: async () => undefined,
    on: () => undefined,
  };
  const context = {
    newPage: async () => page,
    close: async () => undefined,
    route: async () => undefined,
    addInitScript: async () => undefined,
  };
  const connect = async (): Promise<FakeBrowser> => {
    fake.connects += 1;
    const browser: FakeBrowser = {
      connected: true,
      onDisconnect: [],
      isConnected: () => browser.connected,
      on: (event, handler) => {
        if (event === 'disconnected') browser.onDisconnect.push(handler);
      },
      close: async () => undefined,
      newContext: async () => context,
    };
    fake.browsers.push(browser);
    return browser;
  };
  const unused = async () => {
    throw new Error('not used in this test');
  };
  return {
    chromium: { launch: unused, connectOverCDP: unused },
    firefox: { launch: unused, connect },
    webkit: { launch: unused },
  };
});

const { BrowserPool } = await import('./pool.js');

const camoufoxPool = () =>
  new BrowserPool({
    size: 0,
    maxContexts: 1,
    recycleAfter: 100,
    camoufoxEnabled: true,
    camoufoxUrl: 'ws://camoufox.test:9223',
  });

afterEach(() => {
  fake.connects = 0;
  fake.browsers = [];
});

describe('the external-tier probe', () => {
  it('runs on its own, without start(), so a remote-CDP instance still learns about camoufox', async () => {
    const pool = camoufoxPool();
    await pool.probeExternalTiers();
    expect(pool.camoufoxReady()).toBe(true);
    expect(fake.connects).toBe(1);
    await pool.close();
  });

  it('stops offering camoufox once its connection drops', async () => {
    const pool = camoufoxPool();
    await pool.probeExternalTiers();
    expect(pool.camoufoxReady()).toBe(true);

    const [browser] = fake.browsers;
    browser!.connected = false;
    for (const handler of browser!.onDisconnect) handler();

    expect(pool.camoufoxReady()).toBe(false);
    await pool.close();
  });
});

const camoufoxRender = { url: 'https://example.com/', engine: 'camoufox' as const, timeout: 2_000 };

describe('the shared connection', () => {
  it('serves two camoufox renders over one connect', async () => {
    const pool = camoufoxPool();
    const first = await pool.render(camoufoxRender);
    const second = await pool.render(camoufoxRender);

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(fake.connects).toBe(1);
    await pool.close();
  });

  it('offers camoufox again once a render has reconnected to it', async () => {
    const pool = camoufoxPool();
    await pool.probeExternalTiers();
    const [dropped] = fake.browsers;
    dropped!.connected = false;
    for (const handler of dropped!.onDisconnect) handler();
    expect(pool.camoufoxReady()).toBe(false);

    await pool.render(camoufoxRender);

    expect(fake.connects).toBe(2);
    expect(pool.camoufoxReady()).toBe(true);
    await pool.close();
  });

  it('reconnects once when two callers find the same stale connection', async () => {
    const pool = camoufoxPool();
    await pool.probeExternalTiers();
    expect(fake.connects).toBe(1);

    // Stale without the event having fired yet: Playwright reports the close
    // asynchronously, so both callers see the dead handle.
    fake.browsers[0]!.connected = false;

    await Promise.all([pool.probeExternalTiers(), pool.probeExternalTiers()]);

    // One reconnect shared by both. A second would leave a live connection
    // that nothing tracks and close() never closes.
    expect(fake.connects).toBe(2);
    await pool.close();
  });

  it('opens nothing once the pool is closing', async () => {
    const pool = camoufoxPool();
    await pool.close();

    await pool.probeExternalTiers();

    expect(fake.connects).toBe(0);
    expect(pool.camoufoxReady()).toBe(false);
  });
});
