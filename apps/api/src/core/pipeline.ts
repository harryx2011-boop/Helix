import type { Log } from './logger.js';
import {
  DEFAULT_MAX_TIER,
  minimumViableTier,
  shouldEscalate,
  TIER_ORDER,
  tierSupports,
  type Capabilities,
  type Tier,
} from './escalation.js';
import { classifyTransportError, detectBlock, type FailureReason, type ResponseFacts } from './block-detection.js';
import { resolveFavicon } from './favicon.js';
import type { TierMemory } from './tier-memory.js';
import type { CookieJar } from './cookie-jar.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient, ExtractResult } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';
import type { RenderEngine } from '../browser/engines.js';
import type { ScreenshotOptions, ScreenshotResult } from '../browser/screenshot.js';

/**
 * The scrape pipeline.
 *
 * Walks the fetch ladder from the cheapest viable tier, escalating only on
 * evidence, and returns either a document or a typed failure.
 *
 * The invariant this file exists to hold: a bot-challenge page NEVER comes back
 * as content. Whatever the upstream status said, if the classifier recognises an
 * interstitial the result is a failure carrying the reason and the tiers tried.
 */

export interface PipelineOptions {
  url: string;
  formats: string[];
  tier?: Tier | 'auto' | undefined;
  onlyMainContent?: boolean | undefined;
  includeSelectors?: string[] | undefined;
  excludeSelectors?: string[] | undefined;
  extractor?: 'trafilatura' | 'readability' | 'auto' | undefined;
  waitFor?: number | undefined;
  timeout?: number | undefined;
  headers?: Record<string, string> | undefined;
  profile?: string | undefined;
  proxy?: string | undefined;
  actions?: unknown[] | undefined;
  mobile?: boolean | undefined;
  /** Format, quality, element selector and clip for the screenshot format. */
  screenshotOptions?: ScreenshotOptions | undefined;
  /** Explicit device size, overriding both the profile's screen and the phone preset. */
  viewport?: { width: number; height: number; deviceScaleFactor?: number | undefined } | undefined;
  /** Abort requests to known ad, tracker and consent-dialog hosts. */
  blockAds?: boolean | undefined;
  /** Emulate `prefers-color-scheme: dark`. */
  darkMode?: boolean | undefined;
  /** Which browser drives the render tier. The pool's default when unset. */
  renderEngine?: RenderEngine | undefined;
  /** Operator opt-in: fetch loopback, link-local and private-range addresses. */
  allowPrivate?: boolean | undefined;
  /** Cancels the read between and during tier attempts; the reason becomes the failure detail. */
  signal?: AbortSignal | undefined;
  /**
   * Skips `extractClient.extract`. Only safe when no format needs extracted
   * text (screenshot-only requests) — `detectBlock`/`shouldEscalate` still work
   * without it, just without extracted-text as a corroborating signal.
   */
  skipExtraction?: boolean | undefined;
}

/** One climb up the ladder, and the evidence that caused it. */
export interface Escalation {
  from: Tier;
  to: Tier;
  reason: string;
}

export interface PipelineSuccess {
  success: true;
  content: ExtractResult & { rawHtml?: string | undefined; screenshot?: string | undefined; favicon?: string | undefined };
  tier: Tier;
  tiersAttempted: Tier[];
  /** Empty when the first tier served the page. */
  escalations: Escalation[];
  profileUsed?: string | undefined;
  engineUsed?: RenderEngine | undefined;
  /** Options the tier could not honour, e.g. a profile that did not fit the engine. */
  warnings?: string[] | undefined;
  statusCode?: number | undefined;
  finalUrl?: string | undefined;
  /** Format, byte count and any warning from the screenshot. Absent when none was taken. */
  screenshotResult?: ScreenshotResult | undefined;
  /** Every `Set-Cookie` the serving tier received, for a crawl session's jar. */
  setCookies?: string[] | undefined;
  /** Validators from the response, so a later crawl can ask "has this changed?". */
  etag?: string | undefined;
  lastModified?: string | undefined;
  /**
   * The host answered a conditional request with 304: the page is as the caller
   * already has it. `content` is empty, which is the answer, not a failure — the
   * caller keeps what it stored.
   */
  notModified?: boolean | undefined;
  timingMs: number;
}

export interface PipelineFailure {
  success: false;
  url: string;
  reason: FailureReason;
  detail?: string | undefined;
  statusCode?: number | undefined;
  detectedBy: string[];
  tier?: Tier | undefined;
  tiersAttempted: Tier[];
  profileUsed?: string | undefined;
  escalationAvailable: boolean;
  timingMs: number;
  /**
   * `Retry-After` as the host sent it, in seconds.
   *
   * Surfaced because it is the only backoff figure in the exchange the host
   * actually stated. Everything else a crawler could use is a guess, and
   * guessing shorter than asked is what earns the next block.
   */
  retryAfterSeconds?: number | undefined;
}

export type PipelineResult = PipelineSuccess | PipelineFailure;

export interface PipelineDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool | undefined;
  logger?: Log | undefined;
  /** Per-host floor learned from blocks; `auto` requests start there. */
  tierMemory?: TierMemory | undefined;
  /** Cookies hosts set, replayed to the same identity on the fetch tiers. */
  cookieJar?: CookieJar | undefined;
}

function capabilitiesFor(options: PipelineOptions): Capabilities {
  const caps: Capabilities = {};
  if (options.formats.includes('screenshot')) caps.screenshot = true;
  if (options.formats.includes('pdf')) caps.pdfRender = true;
  if (options.actions && options.actions.length > 0) caps.actions = true;
  if (options.waitFor !== undefined && options.waitFor > 0) caps.waitFor = options.waitFor;
  if (options.proxy) caps.proxy = true;
  return caps;
}

/** Formats whose output is the extracted main content. */
const EXTRACTED_TEXT_FORMATS = new Set(['markdown', 'text', 'json', 'chunks']);

/**
 * `Retry-After` in seconds, from either of the two forms the header takes.
 *
 * The HTTP-date form is the one implementations forget; a host that sends it and
 * is met with a one-second default backoff gets hammered through its own stated
 * cooldown. Anything unparseable, negative, or beyond a day is dropped rather
 * than clamped — a nonsense value should fall back to our own backoff, not
 * become a crawl that sleeps for a week.
 */
function retryAfterSeconds(headers: Record<string, string>): number | undefined {
  const key = Object.keys(headers).find((h) => h.toLowerCase() === 'retry-after');
  const raw = key ? headers[key]?.trim() : undefined;
  if (!raw) return undefined;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric >= 0 && numeric <= 86_400 ? numeric : undefined;
  }

  const at = Date.parse(raw);
  if (Number.isNaN(at)) return undefined;
  const seconds = Math.ceil((at - Date.now()) / 1000);
  return seconds > 0 && seconds <= 86_400 ? seconds : undefined;
}

/** The longest `Retry-After` the ladder waits out before its next tier; longer ends the request. */
const MAX_RETRY_AFTER_WAIT_MS = 10_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/** How long past its budget a tier may run before the ladder stops waiting for it. */
const TIER_OVERRUN_GRACE_MS = 1_000;

/**
 * A tier that ignores its own timeout (a render stuck past navigation) must not
 * hold the caller: past budget plus grace, the attempt counts as timed out. The
 * tier keeps running in the background until its own cleanup ends it.
 */
async function withinBudget(attempt: Promise<TierAttempt>, tier: Tier, budgetMs: number | undefined): Promise<TierAttempt> {
  if (budgetMs === undefined) return attempt;
  let timer: NodeJS.Timeout | undefined;
  const overrun = new Promise<TierAttempt>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          facts: { statusCode: 0, headers: {}, body: '' },
          transportError: `tier ${tier} timed out: no answer within its ${budgetMs} ms budget`,
        }),
      budgetMs + TIER_OVERRUN_GRACE_MS,
    );
  });
  try {
    return await Promise.race([attempt, overrun]);
  } finally {
    clearTimeout(timer);
  }
}

function abortDetail(signal: AbortSignal): string {
  return signal.reason instanceof Error ? signal.reason.message : 'the read was cancelled';
}

interface TierAttempt {
  facts: ResponseFacts;
  profileUsed?: string | undefined;
  engineUsed?: RenderEngine | undefined;
  warnings?: string[] | undefined;
  finalUrl?: string | undefined;
  screenshot?: string | undefined;
  screenshotResult?: ScreenshotResult | undefined;
  transportError?: string | undefined;
  setCookies?: string[] | undefined;
}

async function attemptTier(
  tier: Tier,
  options: PipelineOptions,
  deps: PipelineDeps,
  /** The host has blocked this request or a recent one; render it with every asset. */
  hostIsWalled = false,
): Promise<TierAttempt> {
  if (tier === 'plain' || tier === 'tls') {
    // The identity is the caller's profile; with none, helix-fetch's default,
    // which is fixed per tier.
    const identity = { url: options.url, proxy: options.proxy, tier, profile: options.profile };
    const callerCookie = Object.keys(options.headers ?? {}).some((h) => h.toLowerCase() === 'cookie');
    const jarCookie = callerCookie ? undefined : deps.cookieJar?.header(identity);
    const result = await deps.fetchClient.fetch({
      url: options.url,
      impersonate: tier === 'tls',
      profile: options.profile,
      proxy: options.proxy,
      headers: jarCookie ? { ...options.headers, Cookie: jarCookie } : options.headers,
      timeoutMs: options.timeout,
      allowPrivate: options.allowPrivate,
      signal: options.signal,
    });
    deps.cookieJar?.store(identity, result.setCookies);

    return {
      facts: {
        statusCode: result.status ?? 0,
        headers: result.headers,
        body: result.body ?? '',
      },
      setCookies: result.setCookies,
      profileUsed: result.profileUsed,
      transportError: result.error,
    };
  }

  if (!deps.browserPool) {
    return {
      facts: { statusCode: 0, headers: {}, body: '' },
      transportError: `tier ${tier} requested but no browser pool is configured`,
    };
  }

  const rendered = await deps.browserPool.render({
    url: options.url,
    engine: tier === 'lightpanda' ? 'lightpanda' : tier === 'camoufox' ? 'camoufox' : 'chromium',
    renderEngine: options.renderEngine,
    waitFor: options.waitFor,
    timeout: options.timeout,
    headers: options.headers,
    proxy: options.proxy,
    screenshot: options.formats.includes('screenshot'),
    screenshotOptions: options.screenshotOptions,
    viewport: options.viewport,
    blockAds: options.blockAds,
    // Skipping images, fonts and media saves most of a render's transfer; a bot
    // wall can read the missing loads as a tell, so walled hosts get them all.
    blockResources: !hostIsWalled,
    pdf: options.formats.includes('pdf'),
    darkMode: options.darkMode,
    actions: options.actions,
    mobile: options.mobile,
    profile: options.profile,
    allowPrivate: options.allowPrivate,
    signal: options.signal,
  });

  return {
    facts: {
      statusCode: rendered.status ?? 0,
      headers: rendered.headers,
      body: rendered.html ?? '',
    },
    finalUrl: rendered.finalUrl,
    screenshot: rendered.screenshot,
    screenshotResult: rendered.screenshotResult,
    // Reported the same way the fetch tiers report it, so a caller can tell
    // whether the identity they asked for was actually applied.
    profileUsed: rendered.profileUsed,
    engineUsed: rendered.engineUsed,
    warnings: rendered.warnings,
    transportError: rendered.error,
  };
}

export async function runPipeline(
  options: PipelineOptions,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const result = await walkLadder(options, deps);
  const memory = deps.tierMemory;
  if (!memory || (options.tier && options.tier !== 'auto')) return result;

  const floor = memory.floor(options.url);
  if (result.success) {
    const climbedPastBlock = result.escalations.some((e) => e.reason.startsWith('blocked'));
    if (climbedPastBlock || result.tier === floor) memory.learn(options.url, result.tier);
  } else if (floor !== undefined && result.tiersAttempted[0] === floor) {
    memory.forget(options.url);
  }
  return result;
}

async function walkLadder(
  options: PipelineOptions,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const started = Date.now();
  // One budget for the whole ladder: a 30 s request used to take up to 4 x 30 s.
  const deadline = options.timeout !== undefined ? started + options.timeout : undefined;
  const capabilities: Capabilities = {
    ...capabilitiesFor(options),
    unavailable: deps.browserPool?.disabledEngines?.() ?? [],
  };
  const wantsExtractedText = options.formats.some((f) => EXTRACTED_TEXT_FORMATS.has(f));
  const tiersAttempted: Tier[] = [];
  const escalations: Escalation[] = [];

  const explicit = options.tier && options.tier !== 'auto' ? (options.tier as Tier) : undefined;
  // An explicit tier is both floor and ceiling: the caller asked for that tier.
  //
  // Absent one, the ceiling is chromium unless camoufox is actually there. A
  // camoufox an operator has enabled AND that answered the startup probe is a
  // tier this instance can really run, and the sites that beat the render tier
  // are exactly what it is for — leaving it reachable only by naming it meant
  // the walls stayed walls unless the caller already knew to ask. It still
  // never *starts* a request: `minimumViableTier` is bounded by chromium, so
  // camoufox is only ever reached on evidence from the tier below it.
  const camoufoxReady = deps.browserPool?.camoufoxReady?.() === true;
  const maxTier: Tier = explicit ?? (camoufoxReady ? 'camoufox' : DEFAULT_MAX_TIER);
  let tier: Tier = explicit ?? minimumViableTier(capabilities);
  const learned = explicit ? undefined : deps.tierMemory?.floor(options.url);
  const startsFromMemory =
    learned !== undefined &&
    TIER_ORDER.indexOf(learned) > TIER_ORDER.indexOf(tier) &&
    TIER_ORDER.indexOf(learned) <= TIER_ORDER.indexOf(maxTier) &&
    tierSupports(learned, capabilities);
  if (startsFromMemory) tier = learned;

  let last: TierAttempt | undefined;

  // Bounded by the ladder length; escalation only ever moves upward.
  for (let step = 0; step < TIER_ORDER.length; step++) {
    if (options.signal?.aborted) {
      return {
        success: false,
        url: options.url,
        reason: 'timeout',
        detail: abortDetail(options.signal),
        detectedBy: [],
        tier,
        tiersAttempted,
        escalationAvailable: true,
        timingMs: Date.now() - started,
      };
    }

    const remaining = deadline === undefined ? undefined : deadline - Date.now();
    if (remaining !== undefined && remaining <= 0) {
      return {
        success: false,
        url: options.url,
        reason: 'timeout',
        detail: `the ${options.timeout} ms timeout ran out before tier ${tier}`,
        detectedBy: [],
        tier,
        tiersAttempted,
        escalationAvailable: true,
        timingMs: Date.now() - started,
      };
    }

    tiersAttempted.push(tier);
    const attempt = await withinBudget(
      attemptTier(
        tier,
        remaining === undefined ? options : { ...options, timeout: remaining },
        deps,
        startsFromMemory || escalations.some((e) => e.reason.startsWith('blocked')),
      ),
      tier,
      remaining,
    );
    last = attempt;

    if (attempt.transportError) {
      const transportReason = classifyTransportError(attempt.transportError);
      // A name that does not resolve fails the same way on every tier.
      const decision =
        transportReason === 'dns'
          ? { escalate: false as const, nextTier: undefined }
          : shouldEscalate({ currentTier: tier, response: attempt.facts, capabilities, maxTier });
      if (decision.escalate && decision.nextTier) {
        deps.logger?.debug(
          { url: options.url, from: tier, to: decision.nextTier, reason: attempt.transportError },
          'escalating after transport error',
        );
        escalations.push({ from: tier, to: decision.nextTier, reason: `transport error: ${attempt.transportError}` });
        tier = decision.nextTier;
        continue;
      }
      return {
        success: false,
        url: options.url,
        reason: transportReason,
        detail: attempt.transportError,
        detectedBy: [],
        tier,
        tiersAttempted,
        // A service being down is worth retrying once it is back; a DNS failure
        // for a typo is not. Only the recoverable ones invite another attempt.
        escalationAvailable: transportReason === 'service_unavailable' || transportReason === 'timeout',
        timingMs: Date.now() - started,
      };
    }

    // A 304 is the answer to a conditional request, not a thin page. It is
    // settled here, before extraction and before the escalation decision,
    // because both would read the empty body as a failure: extraction has
    // nothing to parse, and no higher tier can conjure a body the host
    // deliberately withheld. Classified as `empty` it made every unchanged page
    // of an incremental crawl a fetch failure.
    if (attempt.facts.statusCode === 304) {
      return {
        success: true,
        content: { markdown: '', text: '', links: [], extractorUsed: 'none', contentHash: '' },
        tier,
        tiersAttempted,
        escalations,
        ...(attempt.profileUsed ? { profileUsed: attempt.profileUsed } : {}),
        ...(attempt.engineUsed ? { engineUsed: attempt.engineUsed } : {}),
        ...(attempt.warnings && attempt.warnings.length > 0 ? { warnings: attempt.warnings } : {}),
        statusCode: 304,
        finalUrl: attempt.finalUrl,
        ...(attempt.setCookies?.length ? { setCookies: attempt.setCookies } : {}),
        // A 304 may repeat the validators or omit them; the caller keeps the
        // ones it already stored either way.
        etag: attempt.facts.headers['etag'],
        lastModified: attempt.facts.headers['last-modified'],
        notModified: true,
        timingMs: Date.now() - started,
      };
    }

    // An error status makes the page interstitial-shaped whatever its text, so
    // extraction could only add signals: a block found here skips the extract hop.
    const early = attempt.facts.statusCode >= 400 ? detectBlock(attempt.facts) : undefined;

    // Extract before deciding, so the classifier can use extracted length as a
    // corroborating signal and so a success needs no second fetch.
    let extracted: ExtractResult | undefined;
    if (!options.skipExtraction && attempt.facts.body.length > 0 && !early?.blocked) {
      try {
        extracted = await deps.extractClient.extract({
          html: attempt.facts.body,
          url: options.url,
          extractor: options.extractor ?? 'trafilatura',
          onlyMainContent: options.onlyMainContent ?? true,
          includeSelectors: options.includeSelectors ?? [],
          excludeSelectors: options.excludeSelectors ?? [],
        });
        attempt.facts.extractedText = extracted.text;
      } catch (error) {
        deps.logger?.warn({ error, url: options.url }, 'extraction failed');
      }
    }

    const verdict = early?.blocked ? early : detectBlock(attempt.facts);

    if (!verdict.blocked && (extracted || options.skipExtraction)) {
      const decision = shouldEscalate({
        currentTier: tier,
        // Extraction also runs for metadata; an empty result only means an
        // empty answer when a requested format is built from it.
        response: wantsExtractedText ? attempt.facts : { ...attempt.facts, extractedText: undefined },
        capabilities,
        maxTier,
      });

      if (!decision.escalate) {
        return {
          success: true,
          content: {
            markdown: '',
            text: '',
            links: [],
            extractorUsed: 'none',
            contentHash: '',
            ...extracted,
            rawHtml:
              options.formats.includes('rawHtml') || options.formats.includes('html')
                ? attempt.facts.body
                : undefined,
            // Resolved from the fetched body regardless of the caller's requested
            // formats — like title/language, it is metadata, not opted-in content.
            favicon: resolveFavicon(attempt.facts.body, attempt.finalUrl ?? options.url),
            screenshot: attempt.screenshot,
          },
          tier,
          tiersAttempted,
          escalations,
          screenshotResult: attempt.screenshotResult,
          profileUsed: attempt.profileUsed,
          engineUsed: attempt.engineUsed,
          ...(attempt.warnings && attempt.warnings.length > 0 ? { warnings: attempt.warnings } : {}),
          statusCode: attempt.facts.statusCode,
          finalUrl: attempt.finalUrl,
          ...(attempt.setCookies?.length ? { setCookies: attempt.setCookies } : {}),
          etag: attempt.facts.headers['etag'],
          lastModified: attempt.facts.headers['last-modified'],
          timingMs: Date.now() - started,
        };
      }

      if (decision.nextTier) {
        deps.logger?.debug(
          { url: options.url, from: tier, to: decision.nextTier, reason: decision.reason },
          'escalating',
        );
        escalations.push({ from: tier, to: decision.nextTier, reason: decision.reason });
        tier = decision.nextTier;
        continue;
      }
    }

    // Blocked, or nothing extractable. Escalate if the ladder allows.
    const decision = shouldEscalate({
      currentTier: tier,
      response: attempt.facts,
      capabilities,
      maxTier,
    });

    // A host that states a cooldown gets it before the next tier hits it again;
    // one that asks for longer than the budget allows ends the request here.
    const retryAfter = verdict.blocked ? retryAfterSeconds(attempt.facts.headers) : undefined;
    const waitMs = retryAfter === undefined ? 0 : retryAfter * 1000;
    const waitFits =
      waitMs <= Math.min(MAX_RETRY_AFTER_WAIT_MS, deadline === undefined ? Infinity : deadline - Date.now());

    if (decision.escalate && decision.nextTier && waitFits) {
      if (waitMs > 0) await sleep(waitMs, options.signal);
      deps.logger?.debug(
        { url: options.url, from: tier, to: decision.nextTier, reason: decision.reason },
        'escalating after block or empty result',
      );
      escalations.push({ from: tier, to: decision.nextTier, reason: decision.reason });
      tier = decision.nextTier;
      continue;
    }

    return {
      success: false,
      url: options.url,
      reason: verdict.reason ?? (attempt.facts.body.length === 0 ? 'empty' : 'http_error'),
      detail: verdict.blocked
        ? `blocked at tier ${tier}`
        : 'no extractable content and no higher tier available',
      statusCode: attempt.facts.statusCode,
      detectedBy: verdict.detectedBy,
      tier,
      tiersAttempted,
      profileUsed: attempt.profileUsed,
      // A different profile or proxy may still work even when the ladder is spent.
      escalationAvailable: verdict.blocked,
      timingMs: Date.now() - started,
      ...(() => {
        const after = retryAfterSeconds(attempt.facts.headers);
        return after === undefined ? {} : { retryAfterSeconds: after };
      })(),
    };
  }

  return {
    success: false,
    url: options.url,
    reason: 'http_error',
    detail: 'exhausted the fetch ladder without a usable response',
    detectedBy: [],
    tiersAttempted,
    statusCode: last?.facts.statusCode,
    escalationAvailable: false,
    timingMs: Date.now() - started,
  };
}
