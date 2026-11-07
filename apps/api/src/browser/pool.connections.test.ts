import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The shared connection to a remote CDP browser (`#connection`).
 *
 * Driven through `render()`, with a fake `chromium.connectOverCDP` that
 * counts connects and lets a test drop a connection.
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
    chromium: { launch: unused, connectOverCDP: connect },
    firefox: { launch: unused },
    webkit: { launch: unused },
  };
});

const { BrowserPool } = await import('./pool.js');

const remotePool = () =>
  new BrowserPool({
    size: 0,
    maxContexts: 1,
    recycleAfter: 100,
    remoteCdpUrl: 'ws://remote.test:9222',
  });

const remoteRender = { url: 'https://example.com/', timeout: 2_000, allowPrivate: true };

afterEach(() => {
  fake.connects = 0;
  fake.browsers = [];
});

describe('the shared connection', () => {
  it('serves two renders over one connect', async () => {
    const pool = remotePool();
    const first = await pool.render(remoteRender);
    const second = await pool.render(remoteRender);

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(fake.connects).toBe(1);
    await pool.close();
  });

  it('reconnects once a connection has dropped', async () => {
    const pool = remotePool();
    await pool.render(remoteRender);
    const [dropped] = fake.browsers;
    dropped!.connected = false;
    for (const handler of dropped!.onDisconnect) handler();

    await pool.render(remoteRender);

    expect(fake.connects).toBe(2);
    await pool.close();
  });

  it('reconnects once when two callers find the same stale connection', async () => {
    const pool = remotePool();
    await pool.render(remoteRender);
    expect(fake.connects).toBe(1);

    fake.browsers[0]!.connected = false;

    await Promise.all([pool.render(remoteRender), pool.render(remoteRender)]);

    expect(fake.connects).toBe(2);
    await pool.close();
  });

  it('opens nothing once the pool is closing', async () => {
    const pool = remotePool();
    await pool.close();

    const result = await pool.render(remoteRender);

    expect(result.error).toBeDefined();
    expect(fake.connects).toBe(0);
  });
});
