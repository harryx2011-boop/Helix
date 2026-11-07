import type { Log } from './logger.js';
import {
  DEFAULT_MAX_TIER,
  minimumViableTier,
  normalizeTier,
  shouldEscalate,
  TIER_ORDER,
  tierSupports,
  type Capabilities,
  type RequestTier,
  type Tier,
} from './escalation.js';
import { classifyTransportError, detectBlock, type FailureReason, type ResponseFacts } from './block-detection.js';
import { resolveFavicon } from './favicon.js';
import type { TierMemory } from './tier-memory.js';
import type { CookieJar } from './cookie-jar.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient, ExtractResult } from '../extract/client.js';
import { resolveProfileForEngine, type BrowserPool } from '../browser/pool.js';
import { renderIdentity } from '../browser/profiles.js';
import type { RenderEngine } from '../browser/engines.js';
import type { ScreenshotOptions, ScreenshotResult } from '../browser/screenshot.js';


export interface PipelineOptions {
  url: string;
  formats: string[];
  /** Old names (`chromium`, `lightpanda`, `camoufox`) are mapped to `browser`. */
  tier?: RequestTier | undefined;
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
  screenshotOptions?: ScreenshotOptions | undefined;
  viewport?: { width: number; height: number; deviceScaleFactor?: number | undefined } | undefined;
  blockAds?: boolean | undefined;
  /** Browser tier: canvas noise, WebRTC lock and a search referer on the patched browser. */
  stealth?: boolean | undefined;
  /** Browser tier: click through a Cloudflare challenge. Opt-in; slow. */
  solveCloudflare?: boolean | undefined;
  /** Emulate `prefers-color-scheme: dark`. */
  darkMode?: boolean | undefined;
  renderEngine?: RenderEngine | undefined;
  allowPrivate?: boolean | undefined;
  signal?: AbortSignal | undefined;
  skipExtraction?: boolean | undefined;
}

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
  escalations: Escalation[];
  profileUsed?: string | undefined;
  engineUsed?: RenderEngine | undefined;
  warnings?: string[] | undefined;
  statusCode?: number | undefined;
  finalUrl?: string | undefined;
  screenshotResult?: ScreenshotResult | undefined;
  setCookies?: string[] | undefined;
  etag?: string | undefined;
  lastModified?: string | undefined;
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
  retryAfterSeconds?: number | undefined;
}

export type PipelineResult = PipelineSuccess | PipelineFailure;

export interface PipelineDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool | undefined;
  logger?: Log | undefined;
  tierMemory?: TierMemory | undefined;
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

const EXTRACTED_TEXT_FORMATS = new Set(['markdown', 'text', 'json', 'chunks']);

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

const MAX_RETRY_AFTER_WAIT_MS = 10_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/** The `warnings` field of a success: request-level notes first, then the tier's own. */
function withWarnings(request: string[], tier: string[] | undefined): { warnings?: string[] } {
  const all = [...request, ...(tier ?? [])];
  return all.length > 0 ? { warnings: all } : {};
}

/** How long past its budget a tier may run before the ladder stops waiting for it. */
const TIER_OVERRUN_GRACE_MS = 1_000;

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

/**
 * Whether the browser tier must run on the Playwright pool rather than
 * helix-scrape's browser: anything Scrapling's fetch cannot produce or honour
 * (an image, a PDF, scripted actions, a phone or custom viewport, dark mode, a
 * non-Chromium engine), and an operator who pointed the render tier at a remote
 * CDP browser or another default engine. Routing these to the pool keeps every
 * option honoured instead of silently dropped. A caller's profile is not one of
 * them: `/render` applies it as the pool does (`renderIdentity`).
 */
export function needsPlaywright(options: PipelineOptions, pool?: BrowserPool): boolean {
  return (
    options.formats.includes('screenshot') ||
    options.formats.includes('pdf') ||
    (options.actions?.length ?? 0) > 0 ||
    options.mobile === true ||
    options.viewport !== undefined ||
    options.darkMode === true ||
    (options.renderEngine !== undefined && options.renderEngine !== 'chromium') ||
    (pool !== undefined && (pool.remoteBrowser || pool.defaultEngine !== 'chromium'))
  );
}

/** Browser-only options this request set that the tier serving it cannot apply, as warnings. */
function unappliedBrowserOptions(options: PipelineOptions, servedBy: string): string[] {
  const names = [
    ...(options.stealth ? ['stealth'] : []),
    ...(options.solveCloudflare ? ['solveCloudflare'] : []),
  ];
  return names.map((name) => `${name} was not applied: it needs helix-scrape's browser, and ${servedBy}.`);
}

async function attemptTier(
  tier: Tier,
  options: PipelineOptions,
  deps: PipelineDeps,
  hostIsWalled = false,
): Promise<TierAttempt> {
  if (tier === 'plain' || tier === 'tls') {
    // The identity is the caller's profile; with none, helix-scrape's default,
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

  if (!needsPlaywright(options, deps.browserPool)) {
    // helix-scrape's browser is Chromium: a profile of another family is dropped, as on the pool.
    const resolved = resolveProfileForEngine(options.profile, 'chromium', deps.logger);
    const rendered = await deps.fetchClient.render({
      url: options.url,
      proxy: options.proxy,
      headers: options.headers,
      timeoutMs: options.timeout,
      waitMs: options.waitFor,
      stealth: options.stealth,
      solveCloudflare: options.solveCloudflare,
      blockAds: options.blockAds,
      // Skipping images, fonts and media saves most of a render's transfer; a bot
      // wall can read the missing loads as a tell, so walled hosts get them all.
      disableResources: !hostIsWalled,
      allowPrivate: options.allowPrivate,
      identity: resolved.profile && renderIdentity(resolved.profile),
      signal: options.signal,
    });
    return {
      facts: { statusCode: rendered.status ?? 0, headers: rendered.headers, body: rendered.body ?? '' },
      finalUrl: rendered.finalUrl,
      profileUsed: rendered.profileUsed,
      ...(resolved.warnings.length > 0 ? { warnings: resolved.warnings } : {}),
      transportError: rendered.success ? undefined : (rendered.error ?? 'helix-scrape render failed'),
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
    renderEngine: options.renderEngine,
    waitFor: options.waitFor,
    timeout: options.timeout,
    headers: options.headers,
    proxy: options.proxy,
    screenshot: options.formats.includes('screenshot'),
    screenshotOptions: options.screenshotOptions,
    viewport: options.viewport,
    blockAds: options.blockAds,
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
    profileUsed: rendered.profileUsed,
    engineUsed: rendered.engineUsed,
    warnings: [
      ...unappliedBrowserOptions(options, 'this render ran on the Playwright pool'),
      ...(rendered.warnings ?? []),
    ],
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
  const deadline = options.timeout !== undefined ? started + options.timeout : undefined;
  const capabilities: Capabilities = capabilitiesFor(options);
  const wantsExtractedText = options.formats.some((f) => EXTRACTED_TEXT_FORMATS.has(f));
  const tiersAttempted: Tier[] = [];
  const escalations: Escalation[] = [];

  const requested = normalizeTier(options.tier ?? 'auto');
  const tierWarnings = requested.warning ? [requested.warning] : [];
  if (requested.tier === 'plain' || requested.tier === 'tls') {
    tierWarnings.push(...unappliedBrowserOptions(options, `the request pinned the ${requested.tier} tier`));
  }
  // An explicit tier is both floor and ceiling: the caller asked for that tier.
  const explicit = requested.tier !== 'auto' ? requested.tier : undefined;
  const maxTier: Tier = explicit ?? DEFAULT_MAX_TIER;
  let tier: Tier = explicit ?? minimumViableTier(capabilities);
  const learned = explicit ? undefined : deps.tierMemory?.floor(options.url);
  const startsFromMemory =
    learned !== undefined &&
    TIER_ORDER.indexOf(learned) > TIER_ORDER.indexOf(tier) &&
    TIER_ORDER.indexOf(learned) <= TIER_ORDER.indexOf(maxTier) &&
    tierSupports(learned, capabilities);
  if (startsFromMemory) tier = learned;

  let last: TierAttempt | undefined;

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
        escalationAvailable: transportReason === 'service_unavailable' || transportReason === 'timeout',
        timingMs: Date.now() - started,
      };
    }

    if (attempt.facts.statusCode === 304) {
      return {
        success: true,
        content: { markdown: '', text: '', links: [], extractorUsed: 'none', contentHash: '' },
        tier,
        tiersAttempted,
        escalations,
        ...(attempt.profileUsed ? { profileUsed: attempt.profileUsed } : {}),
        ...(attempt.engineUsed ? { engineUsed: attempt.engineUsed } : {}),
        ...withWarnings(tierWarnings, attempt.warnings),
        statusCode: 304,
        finalUrl: attempt.finalUrl,
        ...(attempt.setCookies?.length ? { setCookies: attempt.setCookies } : {}),
        etag: attempt.facts.headers['etag'],
        lastModified: attempt.facts.headers['last-modified'],
        notModified: true,
        timingMs: Date.now() - started,
      };
    }

    const early = attempt.facts.statusCode >= 400 ? detectBlock(attempt.facts) : undefined;

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
            favicon: resolveFavicon(attempt.facts.body, attempt.finalUrl ?? options.url),
            screenshot: attempt.screenshot,
          },
          tier,
          tiersAttempted,
          escalations,
          screenshotResult: attempt.screenshotResult,
          profileUsed: attempt.profileUsed,
          engineUsed: attempt.engineUsed,
          ...withWarnings(tierWarnings, attempt.warnings),
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

    const decision = shouldEscalate({
      currentTier: tier,
      response: attempt.facts,
      capabilities,
      maxTier,
    });

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
