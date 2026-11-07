import type { Page } from 'playwright';


export const MAX_FULL_PAGE_HEIGHT = 4_096;
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

export interface ScreenshotOptions {
  fullPage?: boolean | undefined;
  format?: ScreenshotFormat | undefined;
  quality?: number | undefined;
  selector?: string | undefined;
  omitBackground?: boolean | undefined;
  clip?: { x: number; y: number; width: number; height: number } | undefined;
}

export interface ScreenshotResult {
  data: string;
  format: ScreenshotFormat;
  bytes: number;
  warning?: string;
}

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

export async function capture(page: Page, options: ScreenshotOptions): Promise<ScreenshotResult> {
  const encode = encodeOptions(options);
  const format = encode.type;

  if (options.selector) {
    const element = await page.$(options.selector);
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
