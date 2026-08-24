import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Log } from '../core/logger.js';

/**
 * Browser pool — tiers 2 and 3.
 *
 * The economics that dictate the design: launching Chrome costs about a second
 * and hundreds of megabytes, while opening a context in a running browser is
 * nearly free. So: one browser process, many contexts. Never one browser per job.
 *
 * Memory grows regardless, so each browser is recycled after a configured number
 * of pages. Left alone, a long-running pool climbs until the container dies —
 * a documented failure in comparable tools, where self-hosted instances go from
 * 13% to 85% RAM after ~30 crawls and never recover without a restart.
 */

export type Engine = 'chromium' | 'lightpanda';

export interface RenderOptions {
  url: string;
  engine?: Engine | undefined;
  waitFor?: number | undefined;
  timeout?: number | undefined;
  headers?: Record<string, string> | undefined;
  proxy?: string | undefined;
  screenshot?: boolean | undefined;
  fullPage?: boolean | undefined;
  actions?: unknown[] | undefined;
}

export interface RenderResult {
  html?: string | undefined;
  status?: number | undefined;
  headers: Record<string, string>;
  finalUrl?: string | undefined;
  screenshot?: string | undefined;
  error?: string | undefined;
  timingMs: number;
}

/**
 * A page held open across requests. Interact sessions lease a page instead of
 * rendering once: the same context (cookies, storage, focus) survives until the
 * lease is closed, and the pool accounts for it exactly like an in-flight render.
 */
export interface PageLease {
  page: Page;
  context: BrowserContext;
  close(): Promise<void>;
}

export interface LeaseOptions {
  headers?: Record<string, string> | undefined;
  proxy?: string | undefined;
  viewport?: { width: number; height: number } | undefined;
}

export interface BrowserPoolOptions {
  size: number;
  maxContexts: number;
  /** Recycle a browser after this many pages. */
  recycleAfter: number;
  lightpandaEnabled?: boolean | undefined;
  lightpandaUrl?: string | undefined;
  logger?: Log | undefined;
}

interface PooledBrowser {
  browser: Browser;
  pagesServed: number;
  activeContexts: number;
  /** Set while the browser drains before being replaced. */
  retiring: boolean;
}

export class BrowserPool {
  readonly #options: BrowserPoolOptions;
  readonly #logger: Log | undefined;
  #browsers: PooledBrowser[] = [];
  #started = false;
  #closing = false;

  constructor(options: BrowserPoolOptions) {
    this.#options = options;
    this.#logger = options.logger;
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;

    // Warm the pool up front. Cold-starting a browser inside a request adds
    // seconds to a page that should have taken milliseconds.
    await Promise.all(
      Array.from({ length: this.#options.size }, () => this.#launch()),
    );

    this.#logger?.info({ size: this.#browsers.length }, 'browser pool ready');
  }

  async #launch(): Promise<PooledBrowser> {
    const browser = await chromium.launch({
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    const pooled: PooledBrowser = {
      browser,
      pagesServed: 0,
      activeContexts: 0,
      retiring: false,
    };

    this.#browsers.push(pooled);
    return pooled;
  }

  /** Least-loaded non-retiring browser, launching one if all are saturated. */
  async #acquire(): Promise<PooledBrowser> {
    const available = this.#browsers
      .filter((b) => !b.retiring && b.activeContexts < this.#options.maxContexts)
      .sort((a, b) => a.activeContexts - b.activeContexts);

    const chosen = available[0];
    if (chosen) return chosen;

    return this.#launch();
  }

  /**
   * Retire a browser once it has served enough pages.
   *
   * Marked first so no new work arrives, then closed once in-flight contexts
   * drain — killing it mid-render would fail live requests.
   */
  async #maybeRecycle(pooled: PooledBrowser): Promise<void> {
    if (pooled.retiring) return;
    if (pooled.pagesServed < this.#options.recycleAfter) return;

    pooled.retiring = true;
    this.#logger?.debug({ pagesServed: pooled.pagesServed }, 'recycling browser');

    const replacement = this.#closing ? undefined : this.#launch();

    const drain = async (): Promise<void> => {
      while (pooled.activeContexts > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await pooled.browser.close().catch(() => undefined);
      this.#browsers = this.#browsers.filter((b) => b !== pooled);
    };

    void drain();
    await replacement;
  }

  async lease(options: LeaseOptions = {}): Promise<PageLease> {
    if (!this.#started) await this.start();

    const pooled = await this.#acquire();
    pooled.activeContexts++;

    try {
      const context = await pooled.browser.newContext({
        ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
        ...(options.proxy ? { proxy: { server: options.proxy } } : {}),
        ...(options.viewport ? { viewport: options.viewport } : {}),
      });
      const page = await context.newPage();

      let closed = false;
      return {
        page,
        context,
        close: async () => {
          if (closed) return;
          closed = true;
          await page.close().catch(() => undefined);
          await context.close().catch(() => undefined);
          pooled.pagesServed++;
          pooled.activeContexts--;
          void this.#maybeRecycle(pooled);
        },
      };
    } catch (error) {
      pooled.activeContexts--;
      throw error;
    }
  }

  async render(options: RenderOptions): Promise<RenderResult> {
    const started = Date.now();

    if (options.engine === 'lightpanda') {
      if (!this.#options.lightpandaEnabled) {
        return {
          headers: {},
          timingMs: Date.now() - started,
          error: 'lightpanda tier requested but not enabled',
        };
      }
      return this.#renderLightpanda(options, started);
    }

    if (!this.#started) await this.start();

    const pooled = await this.#acquire();
    pooled.activeContexts++;

    let context: BrowserContext | undefined;
    let page: Page | undefined;

    try {
      // A fresh context per request: separate cookies, storage and cache
      // without the cost of a separate process.
      context = await pooled.browser.newContext({
        ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
        ...(options.proxy ? { proxy: { server: options.proxy } } : {}),
      });

      page = await context.newPage();

      const response = await page.goto(options.url, {
        timeout: options.timeout ?? 30_000,
        waitUntil: 'domcontentloaded',
      });

      if (options.waitFor && options.waitFor > 0) {
        await page.waitForTimeout(Math.min(options.waitFor, 30_000));
      }

      if (options.actions && options.actions.length > 0) {
        const { runActions } = await import('./actions.js');
        await runActions(page, options.actions);
      }

      const html = await page.content();

      let screenshot: string | undefined;
      if (options.screenshot) {
        const buffer = await page.screenshot({
          fullPage: options.fullPage ?? false,
          type: 'png',
        });
        screenshot = buffer.toString('base64');
      }

      pooled.pagesServed++;

      return {
        html,
        status: response?.status(),
        headers: response ? await response.allHeaders().catch(() => ({})) : {},
        finalUrl: page.url(),
        screenshot,
        timingMs: Date.now() - started,
      };
    } catch (error) {
      pooled.pagesServed++;
      return {
        headers: {},
        timingMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'render failed',
      };
    } finally {
      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);
      pooled.activeContexts--;
      void this.#maybeRecycle(pooled);
    }
  }

  /**
   * Lightpanda over CDP.
   *
   * Roughly 11x faster and 9x lighter than Chromium because it skips layout,
   * compositing and font rendering — which is also why anything visual must not
   * be routed here. The escalation policy already refuses to send screenshot or
   * canvas work to this tier.
   */
  async #renderLightpanda(options: RenderOptions, started: number): Promise<RenderResult> {
    try {
      const browser = await chromium.connectOverCDP(
        this.#options.lightpandaUrl ?? 'http://localhost:9222',
        { timeout: 5_000 },
      );

      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const response = await page.goto(options.url, {
          timeout: options.timeout ?? 30_000,
          waitUntil: 'domcontentloaded',
        });

        if (options.waitFor && options.waitFor > 0) {
          await page.waitForTimeout(Math.min(options.waitFor, 10_000));
        }

        const html = await page.content();
        const finalUrl = page.url();
        const status = response?.status();

        await context.close().catch(() => undefined);

        return { html, status, headers: {}, finalUrl, timingMs: Date.now() - started };
      } finally {
        await browser.close().catch(() => undefined);
      }
    } catch (error) {
      return {
        headers: {},
        timingMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'lightpanda unreachable',
      };
    }
  }

  stats(): { browsers: number; activeContexts: number; pagesServed: number } {
    return {
      browsers: this.#browsers.length,
      activeContexts: this.#browsers.reduce((sum, b) => sum + b.activeContexts, 0),
      pagesServed: this.#browsers.reduce((sum, b) => sum + b.pagesServed, 0),
    };
  }

  async close(): Promise<void> {
    this.#closing = true;
    await Promise.all(this.#browsers.map((b) => b.browser.close().catch(() => undefined)));
    this.#browsers = [];
    this.#started = false;
  }
}
