import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import { runActions } from './actions.js';

function fakePage() {
  return {
    waitForTimeout: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    url: () => 'https://example.com/',
    content: async () => '<html></html>',
  } as unknown as Page;
}

describe('runActions deadline', () => {
  it('shortens every wait to what is left of the request budget', async () => {
    const page = fakePage();
    const deadline = Date.now() + 40;
    await runActions(page, [{ type: 'wait', milliseconds: 30_000 }], { deadline });
    const [ms] = (page.waitForTimeout as ReturnType<typeof vi.fn>).mock.calls[0] as [number];
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(40);
  });

  it('bounds selector waits and clicks by the same budget', async () => {
    const page = fakePage();
    const deadline = Date.now() + 25;
    await runActions(
      page,
      [
        { type: 'wait', selector: '#late' },
        { type: 'click', selector: '#go' },
      ],
      { deadline },
    );
    const [, waitOptions] = (page.waitForSelector as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { timeout: number },
    ];
    const [, clickOptions] = (page.click as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { timeout: number }];
    expect(waitOptions.timeout).toBeLessThanOrEqual(25);
    expect(clickOptions.timeout).toBeLessThanOrEqual(25);
    // Never zero: Playwright reads 0 as "no timeout".
    expect(clickOptions.timeout).toBeGreaterThan(0);
  });

  it('keeps the per-request wait cap when no deadline is given', async () => {
    const page = fakePage();
    await runActions(page, [
      { type: 'wait', milliseconds: 30_000 },
      { type: 'wait', milliseconds: 30_000 },
      { type: 'wait', milliseconds: 30_000 },
    ]);
    const waits = (page.waitForTimeout as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c as [number])[0]);
    expect(waits.reduce((a, b) => a + b, 0)).toBe(60_000);
  });
});
