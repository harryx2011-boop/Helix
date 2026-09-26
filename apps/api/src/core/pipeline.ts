import type { Log } from './logger.js';
import {
  DEFAULT_MAX_TIER,
  minimumViableTier,
  shouldEscalate,
  TIER_ORDER,
  type Capabilities,
  type Tier,
} from './escalation.js';
import { classifyTransportError, detectBlock, type FailureReason, type ResponseFacts } from './block-detection.js';
import { resolveFavicon } from './favicon.js';
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
  /** Validators from the response, so a later crawl can ask "has this changed?". */
  etag?: string | undefined;
  lastModified?: string | undefined;
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
}

async function attemptTier(
  tier: Tier,
  options: PipelineOptions,
  deps: PipelineDeps,
): Promise<TierAttempt> {
  if (tier === 'plain' || tier === 'tls') {
    const result = await deps.fetchClient.fetch({
      url: options.url,
      impersonate: tier === 'tls',
      profile: options.profile,
      proxy: options.proxy,
      headers: options.headers,
      timeoutMs: options.timeout,
      allowPrivate: options.allowPrivate,
      signal: options.signal,
    });

    return {
      facts: {
        statusCode: result.status ?? 0,
        headers: result.headers,
        body: result.body ?? '',
      },
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
  const started = Date.now();
  const capabilities = capabilitiesFor(options);
  const wantsExtractedText = options.formats.some((f) => EXTRACTED_TEXT_FORMATS.has(f));
  const tiersAttempted: Tier[] = [];
  const escalations: Escalation[] = [];

  const explicit = options.tier && options.tier !== 'auto' ? (options.tier as Tier) : undefined;
  // An explicit tier is both floor and ceiling: the caller asked for that tier.
  // Absent one, the ceiling stops below the opt-in tier, so evidence can walk
  // the ladder up to chromium but never into camoufox on its own.
  const maxTier: Tier = explicit ?? DEFAULT_MAX_TIER;
  let tier: Tier = explicit ?? minimumViableTier(capabilities);

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

    tiersAttempted.push(tier);
    const attempt = await attemptTier(tier, options, deps);
    last = attempt;

    if (attempt.transportError) {
      const decision = shouldEscalate({
        currentTier: tier,
        response: attempt.facts,
        capabilities,
        maxTier,
      });
      if (decision.escalate && decision.nextTier) {
        deps.logger?.debug(
          { url: options.url, from: tier, to: decision.nextTier, reason: attempt.transportError },
          'escalating after transport error',
        );
        escalations.push({ from: tier, to: decision.nextTier, reason: `transport error: ${attempt.transportError}` });
        tier = decision.nextTier;
        continue;
      }
      const transportReason = classifyTransportError(attempt.transportError);
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

    // Extract before deciding, so the classifier can use extracted length as a
    // corroborating signal and so a success needs no second fetch.
    let extracted: ExtractResult | undefined;
    if (!options.skipExtraction && attempt.facts.body.length > 0) {
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

    const verdict = detectBlock(attempt.facts);

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

    if (decision.escalate && decision.nextTier) {
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
