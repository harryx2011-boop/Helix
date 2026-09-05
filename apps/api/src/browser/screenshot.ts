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

export type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

export interface ScreenshotOptions {
  fullPage?: boolean | undefined;
  format?: ScreenshotFormat | undefined;
  /** JPEG and WebP only; Playwright rejects it on PNG. */
  quality?: number | undefined;
  /** Capture this element instead of the page. A miss is reported, not silently full-page. */
  selector?: string | undefined;
  /** Transparent background where the page itself does not paint one. PNG and WebP only. */
  omitBackground?: boolean | undefined;
  clip?: { x: number; y: number; width: number; height: number } | undefined;
}

export interface ScreenshotResult {
  data: string;
  format: ScreenshotFormat;
  bytes: number;
  /** Set when the request could not be honoured exactly, so the caller is told rather than guessing. */
  warning?: string;
}

/**
 * Playwright refuses `quality` on PNG and `omitBackground` on JPEG, and both
 * are errors rather than warnings. Deciding here keeps the caller from having
 * to know which combinations are legal.
 */
function encodeOptions(options: ScreenshotOptions): {
  type: ScreenshotFormat;
  quality?: number;
  omitBackground?: boolean;
} {
  const type = options.format ?? 'png';
  const encode: { type: ScreenshotFormat; quality?: number; omitBackground?: boolean } = { type };
  if (options.quality !== undefined && type !== 'png') encode.quality = options.quality;
  if (options.omitBackground && type !== 'jpeg') encode.omitBackground = true;
  return encode;
}

export async function captureScreenshot(
  page: Page,
  fullPageOrOptions: boolean | ScreenshotOptions = false,
): Promise<string> {
  const options: ScreenshotOptions =
    typeof fullPageOrOptions === 'boolean' ? { fullPage: fullPageOrOptions } : fullPageOrOptions;
  return (await capture(page, options)).data;
}

/** `captureScreenshot` with the format, byte count and any warning kept. */
export async function capture(page: Page, options: ScreenshotOptions): Promise<ScreenshotResult> {
  const encode = encodeOptions(options);
  const format = encode.type;

  if (options.selector) {
    const element = await page.$(options.selector);
    // An unmatched selector returns the page instead — silently, which reads as
    // "the element looked like that". Say so, and return the viewport.
    if (!element) {
      const buffer = await page.screenshot({ ...encode, fullPage: false });
      return {
        data: buffer.toString('base64'),
        format,
        bytes: buffer.length,
        warning: `selector: nothing matched ${options.selector}; captured the viewport instead.`,
      };
    }
    const buffer = await element.screenshot(encode);
    return { data: buffer.toString('base64'), format, bytes: buffer.length };
  }

  if (options.clip) {
    const buffer = await page.screenshot({ ...encode, clip: options.clip });
    return { data: buffer.toString('base64'), format, bytes: buffer.length };
  }

  if (options.fullPage) {
    const viewport = page.viewportSize() ?? DEFAULT_VIEWPORT;
    const documentHeight = await page
      .evaluate(() => document.documentElement.scrollHeight)
      .catch(() => viewport.height);
    const height = Math.min(Math.max(documentHeight, viewport.height), MAX_FULL_PAGE_HEIGHT);

    const buffer = await page.screenshot({
      ...encode,
      fullPage: true,
      clip: { x: 0, y: 0, width: viewport.width, height },
    });
    if (buffer.length <= MAX_SCREENSHOT_BYTES) {
      return {
        data: buffer.toString('base64'),
        format,
        bytes: buffer.length,
        // A caller who asked for the whole page and got 4,096px of it has an
        // image that looks complete. The truncation has to be said out loud.
        ...(documentHeight > height
          ? {
              warning: `fullPage: the page is ${documentHeight}px tall; captured the top ${height}px (the cap).`,
            }
          : {}),
      };
    }

    const fallback = await page.screenshot({ ...encode, fullPage: false });
    return {
      data: fallback.toString('base64'),
      format,
      bytes: fallback.length,
      warning: `fullPage: the capture exceeded ${MAX_SCREENSHOT_BYTES} bytes; returned the viewport instead.`,
    };
  }

  const buffer = await page.screenshot({ ...encode, fullPage: false });
  return { data: buffer.toString('base64'), format, bytes: buffer.length };
}
