import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Log } from '../core/logger.js';
import { fingerprintScript, getProfile, type BrowserProfile } from './profiles.js';
import { isPrivateHost } from '../core/url-guard.js';
import { captureScreenshot } from './screenshot.js';

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

/** A current phone-class viewport. Device scale stays at 1 so screenshots stay small. */
const MOBILE_CONTEXT = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
} as const;

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
  /** Phone-sized viewport with touch events, for pages that serve a different layout to phones. */
  mobile?: boolean | undefined;
  /** Browser identity to present to the page's own JavaScript. Unknown names are ignored. */
  profile?: string | undefined;
  /** Operator opt-in: let the page, its redirects and its subresources reach private addresses. */
  allowPrivate?: boolean | undefined;
  /** Closes the page mid-render when it fires, so the slot is freed at once. */
  signal?: AbortSignal | undefined;
}

function abortMessage(signal: AbortSignal): string {
  return signal.reason instanceof Error ? signal.reason.message : 'render cancelled';
}

/** Playwright has no cancellation token; closing the page rejects whatever is awaiting it. */
function abortClosesPage(page: Page, signal: AbortSignal | undefined): void {
  if (!signal) return;
  const close = (): void => {
    void page.close().catch(() => undefined);
  };
  signal.addEventListener('abort', close, { once: true });
  page.once('close', () => signal.removeEventListener('abort', close));
}

export interface RenderResult {
  html?: string | undefined;
  status?: number | undefined;
  headers: Record<string, string>;
  finalUrl?: string | undefined;
  screenshot?: string | undefined;
  /** The identity actually applied. Absent when the requested name matched nothing. */
  profileUsed?: string | undefined;
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
  profile?: string | undefined;
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

/**
 * Abort every request bound for a loopback, link-local or private address.
 *
 * The route already checked the URL the caller sent, including what its name
 * resolves to. This covers what the check cannot: redirects, and fetches the
 * page itself makes once it runs. It is a literal check (no DNS per request),
 * so a public name that resolves privately at render time is the one case it
 * does not close.
 */
async function blockPrivateHosts(context: BrowserContext): Promise<void> {
  await context.route(
    () => true,
    (route) => {
      let url: URL;
      try {
        url = new URL(route.request().url());
      } catch {
        return route.abort('blockedbyclient');
      }
      const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
      return isHttp && isPrivateHost(url) ? route.abort('blockedbyclient') : route.continue();
    },
  );
}

/** Navigate, wait, act and capture, each step bounded by the shared deadline. */
async function drivePage(
  page: Page,
  options: RenderOptions,
  deadline: number,
): Promise<Omit<RenderResult, 'timingMs'>> {
  // Never 0: Playwright reads a zero timeout as "no timeout".
  const remaining = (): number => Math.max(1, deadline - Date.now());

  const response = await page.goto(options.url, {
    timeout: remaining(),
    waitUntil: 'domcontentloaded',
  });

  if (options.waitFor && options.waitFor > 0) {
    await page.waitForTimeout(Math.min(options.waitFor, 30_000, remaining()));
  }

  if (options.actions && options.actions.length > 0) {
    const { runActions } = await import('./actions.js');
    await runActions(page, options.actions, { deadline });
  }

  const html = await page.content();

  let screenshot: string | undefined;
  if (options.screenshot) {
    screenshot = await captureScreenshot(page, options.fullPage ?? false);
  }

  return {
    html,
    status: response?.status(),
    headers: response ? await response.allHeaders().catch(() => ({})) : {},
    finalUrl: page.url(),
    screenshot,
  };
}

/**
 * Context options a profile contributes, plus the init script.
 *
 * Timezone and locale are Playwright's own context options rather than
 * script overrides: a page can read the real values through Intl in ways a
 * getter patch does not cover.
 */
function profileContextOptions(profile: BrowserProfile | undefined): Record<string, unknown> {
  if (!profile) return {};
  const options: Record<string, unknown> = {};
  if (profile.js.timezone) options['timezoneId'] = profile.js.timezone;
  if (profile.headers?.acceptLanguage) {
    options['locale'] = profile.headers.acceptLanguage.split(',')[0];
  }
  if (profile.js.screen) {
    options['screen'] = { width: profile.js.screen.width, height: profile.js.screen.height };
  }
  return options;
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

  /**
   * Both limits are re-read on every lease and every page close, so a change
   * takes effect on the next one. `size` is not settable: it is spent launching
   * the fleet at boot and cannot be revisited without restarting.
   */
  setLimits(limits: { maxContexts?: number; recycleAfter?: number }): void {
    if (limits.maxContexts !== undefined) this.#options.maxContexts = limits.maxContexts;
    if (limits.recycleAfter !== undefined) this.#options.recycleAfter = limits.recycleAfter;
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
      const profile = getProfile(options.profile, this.#logger);
      const context = await pooled.browser.newContext({
        ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
        ...(options.proxy ? { proxy: { server: options.proxy } } : {}),
        ...profileContextOptions(profile),
        ...(options.viewport ? { viewport: options.viewport } : {}),
      });
      if (profile) await context.addInitScript(fingerprintScript(profile));
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
    // `timeout` is the whole budget for the render: navigation, `waitFor`,
    // actions and the screenshot share it. Separate caps would add up, and a
    // context held for their sum is how a handful of slow requests empties the pool.
    const budgetMs = options.timeout ?? 30_000;
    const deadline = started + budgetMs;

    if (options.signal?.aborted) {
      return { headers: {}, timingMs: 0, error: abortMessage(options.signal) };
    }

    if (options.engine === 'lightpanda') {
      if (!this.#options.lightpandaEnabled) {
        return {
          headers: {},
          timingMs: Date.now() - started,
          error: 'lightpanda tier requested but not enabled',
        };
      }
      if (options.proxy) {
        // A per-context proxy travels over CDP, and whether Lightpanda honours
        // it is not observable from here. Declining is the only answer that
        // cannot leave from the instance's own address.
        return {
          headers: {},
          timingMs: Date.now() - started,
          error: 'lightpanda tier does not route through a proxy; use the chromium tier',
        };
      }
      return this.#renderLightpanda(options, started, deadline);
    }

    if (!this.#started) await this.start();

    const pooled = await this.#acquire();
    pooled.activeContexts++;

    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let timer: NodeJS.Timeout | undefined;

    try {
      // A fresh context per request: separate cookies, storage and cache
      // without the cost of a separate process.
      const profile = getProfile(options.profile, this.#logger);
      context = await pooled.browser.newContext({
        ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
        ...(options.proxy ? { proxy: { server: options.proxy } } : {}),
        // A mobile viewport is the caller's explicit request; it wins over the
        // profile's desktop screen.
        ...profileContextOptions(profile),
        ...(options.mobile ? MOBILE_CONTEXT : {}),
      });

      if (profile) await context.addInitScript(fingerprintScript(profile));
      if (!options.allowPrivate) await blockPrivateHosts(context);

      page = await context.newPage();
      abortClosesPage(page, options.signal);

      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`render exceeded the ${budgetMs}ms timeout`)),
          Math.max(0, deadline - Date.now()),
        );
      });

      const result = await Promise.race([drivePage(page, options, deadline), expired]);

      pooled.pagesServed++;

      return {
        ...result,
        ...(profile ? { profileUsed: profile.id } : {}),
        timingMs: Date.now() - started,
      };
    } catch (error) {
      pooled.pagesServed++;
      return {
        headers: {},
        timingMs: Date.now() - started,
        error: options.signal?.aborted
          ? abortMessage(options.signal)
          : error instanceof Error
            ? error.message
            : 'render failed',
      };
    } finally {
      if (timer) clearTimeout(timer);
      // Closing the page aborts whatever step the deadline interrupted.
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
   * be routed here. The escalation policy already refuses to send screenshot,
   * canvas or proxied work to this tier, and `mobile` is not applied because
   * there is no layout for a viewport to change; the route says so in a warning.
   */
  async #renderLightpanda(options: RenderOptions, started: number, deadline: number): Promise<RenderResult> {
    try {
      const browser = await chromium.connectOverCDP(
        this.#options.lightpandaUrl ?? 'http://localhost:9222',
        { timeout: 5_000 },
      );

      try {
        const context = await browser.newContext({
          ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
        });

        if (!options.allowPrivate) {
          // Request interception over CDP is what enforces the guard for every
          // hop and subresource. A build that lacks it declines the tier rather
          // than fetching unguarded.
          try {
            await blockPrivateHosts(context);
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`lightpanda tier cannot enforce the private-address guard (${detail})`);
          }
        }

        const page = await context.newPage();
        abortClosesPage(page, options.signal);
        const response = await page.goto(options.url, {
          timeout: Math.max(1, deadline - Date.now()),
          waitUntil: 'domcontentloaded',
        });

        if (options.waitFor && options.waitFor > 0) {
          await page.waitForTimeout(Math.min(options.waitFor, 10_000, Math.max(0, deadline - Date.now())));
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
        error: options.signal?.aborted
          ? abortMessage(options.signal)
          : error instanceof Error
            ? error.message
            : 'lightpanda unreachable',
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
