import type { Page } from 'playwright';

/**
 * Screenshots travel inline as base64 inside the JSON response, so their size
 * is response memory on both ends. A full-page capture of an endless feed is
 * otherwise attacker-sized: the page's height decides how much the server and
 * the dashboard hold. Height is clipped first; if the encoded result is still
 * over the byte cap, the viewport alone is returned.
 */

export const MAX_FULL_PAGE_HEIGHT = 4_096;
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export async function captureScreenshot(page: Page, fullPage: boolean): Promise<string> {
  if (fullPage) {
    const viewport = page.viewportSize() ?? DEFAULT_VIEWPORT;
    const documentHeight = await page
      .evaluate(() => document.documentElement.scrollHeight)
      .catch(() => viewport.height);
    const height = Math.min(Math.max(documentHeight, viewport.height), MAX_FULL_PAGE_HEIGHT);

    const buffer = await page.screenshot({
      type: 'png',
      fullPage: true,
      clip: { x: 0, y: 0, width: viewport.width, height },
    });
    if (buffer.length <= MAX_SCREENSHOT_BYTES) return buffer.toString('base64');
  }

  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  return buffer.toString('base64');
}
