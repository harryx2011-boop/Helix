import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `size` bounds the fleet, not just the boot sequence.
 *
 * `#acquire` picks the least-loaded browser below `maxContexts` and falls
 * through to `#launch` when every one of them is full. Nothing consults
 * `size` again after `start()` spent it, so saturation launches browsers
 * without a ceiling: at the shipped defaults (`size: 4`, `maxContexts: 20`)
 * the 81st concurrent render starts a fifth Chrome, the 101st a sixth, and so
 * on. The rate limiter defaults to 1000 req/min per key, so one caller stays
 * well inside its budget while the box runs out of memory — the exact failure
 * the file header says the design exists to prevent.
 *
 * A saturated pool must queue for a freed slot instead of launching.
 */

const launches = vi.hoisted(() => ({
  count: 0,
  pageCloseHangs: false,
  contextCloses: 0,
  onDisconnect: [] as (() => void)[],
}));

vi.mock('playwright', () => {
  const page = {
    close: () => (launches.pageCloseHangs ? new Promise(() => undefined) : Promise.resolve()),
    goto: async () => null,
    content: async () => '<html>ok</html>',
    url: () => 'https://example.com/',
    waitForTimeout: async () => undefined,
    on: () => undefined,
  };
  const context = {
    newPage: async () => page,
    close: async () => {
      launches.contextCloses += 1;
    },
    route: async () => undefined,
    addInitScript: async () => undefined,
  };
  const browser = {
    newContext: async () => context,
    close: async () => undefined,
    isConnected: () => true,
    on: (event: string, handler: () => void) => {
      if (event === 'disconnected') launches.onDisconnect.push(handler);
    },
  };
  const launch = async () => {
    launches.count += 1;
    return browser;
  };
  return {
    chromium: { launch, connectOverCDP: launch },
    firefox: { launch },
    webkit: { launch },
  };
});

const { BrowserPool } = await import('./pool.js');

afterEach(() => {
  launches.count = 0;
  launches.pageCloseHangs = false;
  launches.contextCloses = 0;
  launches.onDisconnect = [];
});

describe('the fleet respects `size` under saturation', () => {
  it('does not launch past `size` when every browser is full', async () => {
    const pool = new BrowserPool({ size: 1, maxContexts: 2, recycleAfter: 100 });
    await pool.start();
    expect(launches.count).toBe(1);

    // Two leases fill the single browser. The third has nowhere to go: it must
    // wait for one of them to close, not start a second Chrome.
    const first = await pool.lease();
    const second = await pool.lease();

    let thirdSettled = false;
    const third = pool.lease().then((lease) => {
      thirdSettled = true;
      return lease;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(thirdSettled, 'a saturated pool must queue rather than launch').toBe(false);
    expect(launches.count).toBe(1);

    await first.close();
    const granted = await third;
    expect(granted).toBeDefined();
    expect(launches.count, 'the freed slot serves the waiter').toBe(1);

    await second.close();
    await granted.close();
    await pool.close();
  });
});

describe('a recycle that replaces a browser wakes the queue', () => {
  it('grants a parked caller the replacement browser', async () => {
    const pool = new BrowserPool({ size: 1, maxContexts: 1, recycleAfter: 1 });
    await pool.start();

    const held = await pool.lease();
    const queued = pool.lease();

    // The close frees the only slot and trips the recycle threshold at once.
    // The freed slot belongs to a browser that is now retiring, so the parked
    // caller is served by the replacement or by nothing at all.
    await held.close();

    const granted = await Promise.race([
      queued,
      new Promise((resolve) => setTimeout(() => resolve('STARVED'), 1000)),
    ]);

    expect(granted, 'the replacement must wake the parked caller').not.toBe('STARVED');
    await (granted as Awaited<typeof queued>).close();
    await pool.close();
  });

  it('recycles without a parked caller to wake', async () => {
    const pool = new BrowserPool({ size: 1, maxContexts: 1, recycleAfter: 1 });
    await pool.start();

    const held = await pool.lease();
    await expect(held.close()).resolves.toBeUndefined();

    await pool.close();
  });
});

describe('cleanup never outlives the budget', () => {
  it('returns although page.close() never settles, and still disposes the context', async () => {
    // Chrome drops a Target.closeTarget that lands on a navigation commit, so
    // page.close() waits for a detach that never comes: reddit's JS challenge
    // held a 20 s render for 393 s. Disposing the context does not wait on it.
    launches.pageCloseHangs = true;
    const pool = new BrowserPool({ size: 1, maxContexts: 2, recycleAfter: 100 });
    await pool.start();
    const closesBefore = launches.contextCloses;

    const outcome = await Promise.race([
      pool.render({ url: 'https://example.com/', timeout: 1_000 }),
      new Promise((resolve) => setTimeout(() => resolve('HUNG'), 3_000)),
    ]);

    expect(outcome, 'render must answer within its budget').not.toBe('HUNG');
    expect(launches.contextCloses - closesBefore).toBe(1);
    expect(pool.stats().activeContexts).toBe(0);
    await pool.close();
  });
});

describe('a browser that dies leaves the pool', () => {
  it('launches a replacement instead of handing out the dead one', async () => {
    const pool = new BrowserPool({ size: 1, maxContexts: 2, recycleAfter: 100 });
    await pool.start();
    expect(launches.count).toBe(1);

    for (const handler of launches.onDisconnect) handler();
    expect(pool.stats().browsers).toBe(0);

    const lease = await pool.lease();
    expect(launches.count).toBe(2);
    await lease.close();
    await pool.close();
  });
});
