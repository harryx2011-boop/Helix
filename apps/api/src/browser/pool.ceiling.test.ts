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

const launches = vi.hoisted(() => ({ count: 0 }));

vi.mock('playwright', () => {
  const context = {
    newPage: async () => ({ close: async () => undefined }),
    close: async () => undefined,
    route: async () => undefined,
  };
  const browser = {
    newContext: async () => context,
    close: async () => undefined,
    isConnected: () => true,
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
