import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Log } from '../core/logger.js';
import { fingerprintScript, getProfile, type BrowserProfile } from './profiles.js';
import { isPrivateHost } from '../core/url-guard.js';
import { capture, type ScreenshotOptions, type ScreenshotResult } from './screenshot.js';
import {
  browserTypeFor,
  launchArgsFor,
  profileMatchesEngine,
  supportsMobileEmulation,
  type RenderEngine,
} from './engines.js';

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

/**
 * `chromium` here names the heavy render tier, not necessarily Chrome: which
 * browser drives it is the `renderEngine` option. `camoufox` is a hardened
 * Firefox reached over its own endpoint, one rung above.
 */
export type Engine = 'chromium' | 'lightpanda' | 'camoufox';

/** A current phone-class viewport. Device scale stays at 1 so screenshots stay small. */
const MOBILE_CONTEXT = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
} as const;

export interface RenderOptions {
  url: string;
  engine?: Engine | undefined;
  /** Which browser drives the chromium tier. Ignored by the lightpanda and camoufox tiers. */
  renderEngine?: RenderEngine | undefined;
  waitFor?: number | undefined;
  timeout?: number | undefined;
  headers?: Record<string, string> | undefined;
  proxy?: string | undefined;
  screenshot?: boolean | undefined;
  fullPage?: boolean | undefined;
  /** Format, quality, element selector and clip. `fullPage` above still applies. */
  screenshotOptions?: ScreenshotOptions | undefined;
  /** Overrides the context viewport, for callers that need a specific device size. */
  viewport?: { width: number; height: number; deviceScaleFactor?: number | undefined } | undefined;
  actions?: unknown[] | undefined;
  /** Phone-sized viewport with touch events, for pages that serve a different layout to phones. */
  mobile?: boolean | undefined;
  /** Abort requests to known ad, tracker and consent-dialog hosts. */
  blockAds?: boolean | undefined;
  /** Emulate `prefers-color-scheme: dark`. Pages that ignore the query are unaffected. */
  darkMode?: boolean | undefined;
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
  /** Format, byte count and any warning from the capture. Absent when none was taken. */
  screenshotResult?: ScreenshotResult | undefined;
  /** The identity actually applied. Absent when the requested name matched nothing, or did not fit the engine. */
  profileUsed?: string | undefined;
  /** The browser that actually rendered, when the render tier ran one. */
  engineUsed?: RenderEngine | undefined;
  /** Said out loud when an option could not be honoured on the chosen engine. */
  warnings?: string[] | undefined;
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
  engine?: RenderEngine | undefined;
}

export interface BrowserPoolOptions {
  size: number;
  maxContexts: number;
  /** Recycle a browser after this many pages. */
  recycleAfter: number;
  lightpandaEnabled?: boolean | undefined;
  lightpandaUrl?: string | undefined;
  /** Engine the render tier uses when a request does not name one. */
  defaultEngine?: RenderEngine | undefined;
  camoufoxEnabled?: boolean | undefined;
  /** Playwright-protocol endpoint of a running Camoufox. */
  camoufoxUrl?: string | undefined;
  /** CDP endpoint of a remote browser the render tier connects to instead of launching locally. */
  remoteCdpUrl?: string | undefined;
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
/**
 * Hosts serving ads, trackers and consent dialogs.
 *
 * Deliberately a short list of the networks that actually change what a
 * screenshot looks like, not an EasyList clone: every entry costs a comparison
 * on every request the page makes, and a stale blocklist that silently breaks
 * a page is worse than a banner in the frame.
 */
const AD_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'adservice.google.com',
  'adnxs.com',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
  'scorecardresearch.com',
  'quantserve.com',
  'moatads.com',
  'cookielaw.org',
  'onetrust.com',
  'cookiebot.com',
  'usercentrics.eu',
  'trustarc.com',
  'hotjar.com',
  'facebook.net',
];

function isAdHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return AD_HOSTS.some((ad) => host === ad || host.endsWith(`.${ad}`));
}

/**
 * Abort every request bound for a loopback, link-local or private address, and
 * optionally every ad and consent-dialog host.
 *
 * The route already checked the URL the caller sent, including what its name
 * resolves to. This covers what the check cannot: redirects, and fetches the
 * page itself makes once it runs. It is a literal check (no DNS per request),
 * so a public name that resolves privately at render time is the one case it
 * does not close.
 *
 * Both filters share one handler deliberately. Playwright runs `route`
 * handlers most-recently-registered first and stops at the one that answers,
 * so two handlers that each call `continue()` would race to decide, and the
 * private-host check could be bypassed by whichever registered later.
 */
async function blockRequests(
  context: BrowserContext,
  options: { blockPrivate: boolean; blockAds: boolean },
): Promise<void> {
  if (!options.blockPrivate && !options.blockAds) return;
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
      if (!isHttp) return route.continue();
      if (options.blockPrivate && isPrivateHost(url)) return route.abort('blockedbyclient');
      if (options.blockAds && isAdHost(url.hostname)) return route.abort('blockedbyclient');
      return route.continue();
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
  let screenshotResult: ScreenshotResult | undefined;
  if (options.screenshot) {
    screenshotResult = await capture(page, {
      ...(options.screenshotOptions ?? {}),
      fullPage: options.screenshotOptions?.fullPage ?? options.fullPage ?? false,
    });
    screenshot = screenshotResult.data;
  }

  return {
    html,
    status: response?.status(),
    headers: response ? await response.allHeaders().catch(() => ({})) : {},
    finalUrl: page.url(),
    screenshot,
    screenshotResult,
  };
}

/**
 * Context options a profile contributes, plus the init script.
 *
 * Timezone and locale are Playwright's own context options rather than
 * script overrides: a page can read the real values through Intl in ways a
 * getter patch does not cover.
 */
/**
 * The profile to actually apply on this engine, plus anything that could not be
 * honoured.
 *
 * A profile naming a different browser family is dropped rather than forced:
 * see `profileMatchesEngine`. The caller is told, because a silently ignored
 * identity is the kind of thing an operator only discovers from a block.
 */
function resolveProfileForEngine(
  id: string | undefined,
  engine: RenderEngine,
  logger: Log | undefined,
): { profile: BrowserProfile | undefined; warnings: string[] } {
  const profile = getProfile(id, logger);
  if (!profile) return { profile: undefined, warnings: [] };
  if (profileMatchesEngine(profile, engine)) return { profile, warnings: [] };
  return {
    profile: undefined,
    warnings: [
      `profile: "${profile.id}" describes ${profile.browser}, which contradicts the ${engine} engine, so no identity was applied.`,
    ],
  };
}

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
  engine: RenderEngine;
  pagesServed: number;
  activeContexts: number;
  /** Set while the browser drains before being replaced. */
  retiring: boolean;
}

export class BrowserPool {
  readonly #options: BrowserPoolOptions;
  readonly #logger: Log | undefined;
  #browsers: PooledBrowser[] = [];
  /** Callers parked in `#acquire` because the fleet is at `size` and every
   * browser is full. Woken in arrival order as contexts close. */
  #waiters: (() => void)[] = [];
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

  /** The engine a request gets when it does not name one. */
  get defaultEngine(): RenderEngine {
    return this.#options.defaultEngine ?? 'chromium';
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;

    // Warm the pool up front, but only for the default engine. Cold-starting a
    // browser inside a request adds seconds to a page that should have taken
    // milliseconds — while launching all three eagerly would spend three
    // seconds and the better part of a gigabyte at boot to serve engines most
    // instances never ask for. A non-default engine is launched lazily on its
    // first request and then pooled exactly like the default, so only the first
    // caller pays, and only on an instance that actually uses it.
    await Promise.all(
      Array.from({ length: this.#options.size }, () => this.#launch(this.defaultEngine)),
    );

    this.#logger?.info(
      { size: this.#browsers.length, engine: this.defaultEngine },
      'browser pool ready',
    );
  }

  async #launch(engine: RenderEngine): Promise<PooledBrowser> {
    const args = launchArgsFor(engine);
    let browser: Browser;
    try {
      browser = await browserTypeFor(engine).launch({
        ...(args.length > 0 ? { args } : {}),
      });
    } catch (error) {
      // The container ships Chromium only unless it was built with
      // HELIX_BROWSER_ENGINES, so a request naming firefox or webkit fails here
      // rather than at validation. Playwright's own message says "Executable
      // doesn't exist" and names a cache path, which tells an operator nothing
      // about the build arg that would fix it.
      const message = error instanceof Error ? error.message : String(error);
      if (/executable doesn't exist|please run the following command/i.test(message)) {
        throw new Error(
          `The ${engine} browser is not installed in this deployment. ` +
            `Rebuild the image with --build-arg HELIX_BROWSER_ENGINES="chromium ${engine}", ` +
            `or use the chromium engine.`,
        );
      }
      throw error;
    }

    const pooled: PooledBrowser = {
      browser,
      engine,
      pagesServed: 0,
      activeContexts: 0,
      retiring: false,
    };

    this.#browsers.push(pooled);
    return pooled;
  }

  /**
   * Least-loaded non-retiring browser of the requested engine, launching one
   * only while this engine is under `size`.
   *
   * Pools are keyed by engine rather than shared: a context inherits the process
   * it is opened in, so a Firefox request cannot borrow a Chromium browser's
   * spare capacity however idle it is.
   *
   * `size` bounds the fleet, not just the boot sequence. It used to be spent by
   * `start()` and never consulted again, so a saturated pool launched a browser
   * per overflowing request — at the defaults, the 81st concurrent render
   * started a fifth Chrome and nothing stopped the sixth. Past the ceiling a
   * caller waits for a context to close instead, which is backpressure rather
   * than a queue of processes.
   */
  async #acquire(engine: RenderEngine): Promise<PooledBrowser> {
    for (;;) {
      const available = this.#browsers
        .filter((b) => b.engine === engine && !b.retiring && b.activeContexts < this.#options.maxContexts)
        .sort((a, b) => a.activeContexts - b.activeContexts);

      const chosen = available[0];
      if (chosen) return chosen;

      // Retiring browsers still hold their slot until they finish draining, so
      // they count: replacing one early is what the ceiling exists to prevent.
      const ofEngine = this.#browsers.filter((b) => b.engine === engine).length;
      if (ofEngine < this.#options.size) return this.#launch(engine);

      await new Promise<void>((resolve) => this.#waiters.push(resolve));
    }
  }

  /** Wakes one caller parked in `#acquire`, after a context frees a slot. */
  #releaseWaiter(): void {
    this.#waiters.shift()?.();
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

    const replacement = this.#closing ? undefined : this.#launch(pooled.engine);

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

    const engine = options.engine ?? this.defaultEngine;
    const pooled = await this.#acquire(engine);
    pooled.activeContexts++;

    try {
      const { profile } = resolveProfileForEngine(options.profile, engine, this.#logger);
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
          this.#releaseWaiter();
          void this.#maybeRecycle(pooled);
        },
      };
    } catch (error) {
      pooled.activeContexts--;
      this.#releaseWaiter();
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

    if (options.engine === 'camoufox') {
      if (!this.#options.camoufoxEnabled) {
        return {
          headers: {},
          timingMs: Date.now() - started,
          error: 'camoufox tier requested but not enabled',
        };
      }
      return this.#renderCamoufox(options, started, deadline);
    }

    const engine = options.renderEngine ?? this.defaultEngine;
    const warnings: string[] = [];

    // Firefox takes `isMobile` without honouring it: the viewport narrows but
    // touch never appears, so a page branching on touch still serves desktop.
    const mobile = options.mobile === true;
    const mobileApplied = mobile && supportsMobileEmulation(engine);
    if (mobile && !mobileApplied) {
      warnings.push(
        'mobile: the firefox engine does not emulate touch, so the phone viewport was not applied.',
      );
    }

    // Checked before the pool is warmed: an instance pointed at a remote browser
    // has moved its rendering off-box deliberately, and launching a local fleet
    // it will never use would spend the memory the remote exists to save.
    const remote = this.#options.remoteCdpUrl;
    if (remote) {
      return this.#renderRemote(options, engine, remote, warnings, started, deadline);
    }

    if (!this.#started) await this.start();

    const pooled = await this.#acquire(engine);
    pooled.activeContexts++;

    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let timer: NodeJS.Timeout | undefined;

    try {
      // A fresh context per request: separate cookies, storage and cache
      // without the cost of a separate process.
      const resolved = resolveProfileForEngine(options.profile, engine, this.#logger);
      const profile = resolved.profile;
      warnings.push(...resolved.warnings);
      context = await pooled.browser.newContext({
        ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
        ...(options.proxy ? { proxy: { server: options.proxy } } : {}),
        // A mobile viewport is the caller's explicit request; it wins over the
        // profile's desktop screen.
        ...profileContextOptions(profile),
        ...(mobileApplied ? MOBILE_CONTEXT : {}),
        ...(options.darkMode ? { colorScheme: 'dark' as const } : {}),
        // Last, so an explicit viewport wins over both the profile's screen and
        // the phone preset: a caller naming a size means that size.
        ...(options.viewport
          ? {
              viewport: { width: options.viewport.width, height: options.viewport.height },
              ...(options.viewport.deviceScaleFactor !== undefined
                ? { deviceScaleFactor: options.viewport.deviceScaleFactor }
                : {}),
            }
          : {}),
      });

      if (profile) await context.addInitScript(fingerprintScript(profile));
      await blockRequests(context, {
        blockPrivate: !options.allowPrivate,
        blockAds: options.blockAds === true,
      });

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
        engineUsed: engine,
        ...(warnings.length > 0 ? { warnings } : {}),
        timingMs: Date.now() - started,
      };
    } catch (error) {
      pooled.pagesServed++;
      return {
        headers: {},
        engineUsed: engine,
        ...(warnings.length > 0 ? { warnings } : {}),
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
      this.#releaseWaiter();
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
            await blockRequests(context, { blockPrivate: true, blockAds: false });
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

  /**
   * Camoufox — a hardened Firefox, one rung above the render tier.
   *
   * Connected to over a configured endpoint rather than bundled. Camoufox is a
   * patched Firefox shipping as a per-platform binary of a few hundred
   * megabytes; vendoring three of them would multiply the image size for a tier
   * that is off by default and that most instances never reach. This repo has
   * already refused a heavy native dependency on the same reasoning (MILESTONES
   * M3). An operator who wants the tier runs the binary and points the instance
   * at it, exactly as lightpanda works.
   *
   * It speaks the Playwright protocol rather than CDP, so it is `connect`, not
   * `connectOverCDP`. That is also what makes the guard below enforceable: the
   * routing API is the real one, not a CDP approximation of it.
   */
  async #renderCamoufox(
    options: RenderOptions,
    started: number,
    deadline: number,
  ): Promise<RenderResult> {
    try {
      const { firefox } = await import('playwright');
      const browser = await firefox.connect(this.#options.camoufoxUrl ?? 'ws://localhost:9223', {
        timeout: 5_000,
      });

      try {
        const context = await browser.newContext({
          ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
          ...(options.proxy ? { proxy: { server: options.proxy } } : {}),
        });

        if (!options.allowPrivate) {
          // Same rule as every other tier: no guard, no fetch. Camoufox patches
          // Firefox's internals, so its routing support is a property of the
          // build in front of us rather than something to assume.
          try {
            await blockRequests(context, { blockPrivate: true, blockAds: false });
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`camoufox tier cannot enforce the private-address guard (${detail})`);
          }
        }

        const page = await context.newPage();
        abortClosesPage(page, options.signal);
        const result = await drivePage(page, options, deadline);
        await context.close().catch(() => undefined);

        return { ...result, engineUsed: 'firefox', timingMs: Date.now() - started };
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
            : 'camoufox unreachable',
      };
    }
  }

  /**
   * A remote browser over CDP, so a small instance can burst without hosting
   * the browsers itself.
   *
   * Two things an operator must understand, and which no amount of care here
   * removes: the remote sees every page fetched and every header sent, and it
   * is on a network this instance does not control. The second is the one with
   * a technical answer — `blockRequests` classifies an address literally,
   * so it is the *remote's* loopback and private ranges that a caller would
   * reach, not this instance's. The guard still holds (the route is enforced by
   * the driver, not the browser), and it is refused outright when it cannot be
   * installed, but "private" now means private to somewhere else.
   *
   * CDP is Chromium's protocol, so a non-Chromium engine cannot be served this
   * way; asking for one is refused rather than silently answered by whatever
   * the endpoint happens to run.
   */
  async #renderRemote(
    options: RenderOptions,
    engine: RenderEngine,
    endpoint: string,
    warnings: string[],
    started: number,
    deadline: number,
  ): Promise<RenderResult> {
    if (engine !== 'chromium') {
      return {
        headers: {},
        timingMs: Date.now() - started,
        error: `the remote browser speaks CDP, which cannot drive the ${engine} engine; use chromium or unset the remote endpoint`,
      };
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      const browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });

      try {
        const resolved = resolveProfileForEngine(options.profile, engine, this.#logger);
        const profile = resolved.profile;
        warnings.push(...resolved.warnings);

        const context = await browser.newContext({
          ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
          ...(options.proxy ? { proxy: { server: options.proxy } } : {}),
          ...profileContextOptions(profile),
          ...(options.mobile ? MOBILE_CONTEXT : {}),
        });

        if (profile) await context.addInitScript(fingerprintScript(profile));

        if (!options.allowPrivate) {
          try {
            await blockRequests(context, { blockPrivate: true, blockAds: false });
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(
              `the remote browser cannot enforce the private-address guard (${detail})`,
            );
          }
        }

        const page = await context.newPage();
        abortClosesPage(page, options.signal);

        const expired = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`render exceeded the ${deadline - started}ms timeout`)),
            Math.max(0, deadline - Date.now()),
          );
        });

        const result = await Promise.race([drivePage(page, options, deadline), expired]);
        await context.close().catch(() => undefined);

        return {
          ...result,
          ...(profile ? { profileUsed: profile.id } : {}),
          engineUsed: engine,
          ...(warnings.length > 0 ? { warnings } : {}),
          timingMs: Date.now() - started,
        };
      } finally {
        await browser.close().catch(() => undefined);
      }
    } catch (error) {
      return {
        headers: {},
        engineUsed: engine,
        ...(warnings.length > 0 ? { warnings } : {}),
        timingMs: Date.now() - started,
        error: options.signal?.aborted
          ? abortMessage(options.signal)
          : error instanceof Error
            ? error.message
            : 'remote browser unreachable',
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  stats(): {
    browsers: number;
    activeContexts: number;
    pagesServed: number;
    engines: RenderEngine[];
  } {
    return {
      browsers: this.#browsers.length,
      activeContexts: this.#browsers.reduce((sum, b) => sum + b.activeContexts, 0),
      pagesServed: this.#browsers.reduce((sum, b) => sum + b.pagesServed, 0),
      engines: [...new Set(this.#browsers.map((b) => b.engine))],
    };
  }

  async close(): Promise<void> {
    this.#closing = true;
    // Parked callers are woken before the browsers go: one still waiting on a
    // slot that will never free would hold shutdown open indefinitely.
    for (const wake of this.#waiters.splice(0)) wake();
    await Promise.all(this.#browsers.map((b) => b.browser.close().catch(() => undefined)));
    this.#browsers = [];
    this.#started = false;
  }
}
