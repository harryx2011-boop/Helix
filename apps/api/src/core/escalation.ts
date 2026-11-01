/**
 * Fetch-tier escalation.
 *
 * Three tiers, cheapest first:
 *
 *   plain       ~5ms     raw HTTP, no TLS mimicry
 *   tls        ~50ms     coherent JA4 + HTTP/2 settings (helix-scrape /fetch)
 *   browser   ~2-5s      full render: helix-scrape's patched Chromium (/render),
 *                        or the Playwright pool when the request needs a
 *                        screenshot, actions or a phone layout
 *
 * v3 dropped lightpanda and camoufox; their names, and `chromium` (the old
 * name of the browser rung), are still accepted and mapped by `normalizeTier`.
 *
 * The rule that matters: escalate on EVIDENCE, never on a guess about the
 * framework a site uses. Next.js, Nuxt and SvelteKit routinely server-render
 * real content, so "detected React, therefore browser" burns the expensive tier
 * on pages a plain fetch already answered. What we test is whether the content
 * is actually present.
 */

import { detectBlock, type ResponseFacts } from './block-detection.js';

export type Tier = 'plain' | 'tls' | 'browser';

export const TIER_ORDER: readonly Tier[] = ['plain', 'tls', 'browser'] as const;

/** Tier names a request may carry: the ladder, `auto`, and the names v3 retired. */
export const REQUEST_TIERS = ['auto', 'plain', 'tls', 'browser', 'lightpanda', 'chromium', 'camoufox'] as const;
export type RequestTier = (typeof REQUEST_TIERS)[number];

/**
 * A request's tier on the v3 ladder.
 *
 * Old names keep working (stored monitors and crawls carry them): `chromium`
 * is the same rung under its old name; `lightpanda` and `camoufox` are gone,
 * so they get the browser rung and a warning instead of a 400.
 */
export function normalizeTier(tier: RequestTier): { tier: Tier | 'auto'; warning?: string } {
  if (tier === 'chromium') return { tier: 'browser' };
  if (tier === 'lightpanda' || tier === 'camoufox') {
    return {
      tier: 'browser',
      warning: `tier: the ${tier} tier was removed in v3; the request ran on the browser tier.`,
    };
  }
  return { tier };
}

/** The ceiling when a caller does not set one: the top of the ladder. */
export const DEFAULT_MAX_TIER: Tier = 'browser';

export interface Capabilities {
  screenshot?: boolean;
  actions?: boolean;
  /** Canvas, WebGL, or anything needing real visual layout. */
  visualLayout?: boolean;
  pdfRender?: boolean;
  waitFor?: number;
  /** The request must leave through a proxy. */
  proxy?: boolean;
}

export interface EscalationDecision {
  escalate: boolean;
  nextTier?: Tier;
  reason: string;
}

/** Anything visual or script-dependent needs the browser rung. */
export function tierSupports(tier: Tier, caps: Capabilities): boolean {
  const needsBrowser =
    caps.screenshot ||
    caps.actions ||
    caps.visualLayout ||
    caps.pdfRender ||
    (caps.waitFor !== undefined && caps.waitFor > 0);
  return needsBrowser ? tier === 'browser' : true;
}

/**
 * The lowest tier that can satisfy the request at all. Capability requirements
 * are known up front, so there is no reason to start below them.
 *
 * Never `plain`: it sends no User-Agent and a non-browser JA4, which a WAF scores
 * as a bot before `tls` runs, for the same round trip. `plain` stays reachable
 * as an explicit tier.
 */
export function minimumViableTier(caps: Capabilities): Tier {
  for (const tier of TIER_ORDER) {
    if (tier === 'plain') continue;
    if (tierSupports(tier, caps)) return tier;
  }
  return DEFAULT_MAX_TIER;
}

const MIN_CONTENT_CHARS = 200;
/** Below this an extraction is a placeholder ("Loading..."), not a short page. */
const MIN_SHORT_PAGE_CHARS = 40;
/** Visible text the extractor may leave out of a short page (title, a link) and still have found it all. */
const SHORT_PAGE_SLACK_CHARS = 100;

const EMPTY_ROOT = /<div[^>]+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i;
const JS_REQUIRED = /(enable|turn on) javascript|javascript is (required|disabled)|requires javascript/i;

function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A body that is overwhelmingly script is a shell, whatever framework made it.
function scriptHeavy(html: string): boolean {
  const scriptBytes = (html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? []).join('').length;
  return html.length > 0 && scriptBytes / html.length > 0.9;
}

/**
 * Whether the raw HTML actually carries the content, or is a hydration shell.
 *
 * Deliberately signal-based rather than framework-based.
 */
export function contentLooksAbsent(html: string, extractedText?: string): boolean {
  // Nav and footer boilerplate would pass the raw-HTML checks below, so an
  // extraction that ran and came back short is the deciding signal.
  if (extractedText !== undefined) {
    const text = extractedText.trim();
    if (text.length >= MIN_CONTENT_CHARS) return false;
    // A short page is complete (example.com) when the extractor found nearly all
    // of its visible text and nothing marks it as a shell; a browser would only
    // render the same sentence seconds later.
    return (
      text.length < MIN_SHORT_PAGE_CHARS ||
      EMPTY_ROOT.test(html) ||
      JS_REQUIRED.test(html) ||
      scriptHeavy(html) ||
      visibleText(html).length - text.length > SHORT_PAGE_SLACK_CHARS
    );
  }

  if (EMPTY_ROOT.test(html)) return true;
  if (visibleText(html).length < MIN_CONTENT_CHARS) return true;
  return scriptHeavy(html);
}

export interface EscalationInput {
  currentTier: Tier;
  response: ResponseFacts;
  capabilities: Capabilities;
  /** Tier ceiling for this request, if the caller set one. */
  maxTier?: Tier;
}

export function shouldEscalate(input: EscalationInput): EscalationDecision {
  const { currentTier, response, capabilities, maxTier = DEFAULT_MAX_TIER } = input;

  const currentIndex = TIER_ORDER.indexOf(currentTier);
  const ceilingIndex = TIER_ORDER.indexOf(maxTier);

  if (currentIndex >= ceilingIndex) {
    return { escalate: false, reason: 'already at the maximum permitted tier' };
  }

  const next = (from: number): Tier | undefined => {
    for (let i = from + 1; i <= ceilingIndex; i++) {
      const tier = TIER_ORDER[i];
      if (tier && tierSupports(tier, capabilities)) return tier;
    }
    return undefined;
  };

  // A block is the strongest reason to move up — though a higher tier is only
  // part of the answer; a different profile or proxy often matters more.
  const verdict = detectBlock(response);
  if (verdict.blocked) {
    const nextTier = next(currentIndex);
    return nextTier
      ? {
          escalate: true,
          nextTier,
          reason: `blocked (${verdict.detectedBy.join(', ')})`,
        }
      : { escalate: false, reason: 'blocked, but no higher tier is available' };
  }

  // Content genuinely missing from the raw HTML.
  if (contentLooksAbsent(response.body, response.extractedText)) {
    const nextTier = next(currentIndex);
    return nextTier
      ? { escalate: true, nextTier, reason: 'content absent from raw HTML' }
      : { escalate: false, reason: 'content absent, but no higher tier is available' };
  }

  return { escalate: false, reason: 'content present' };
}
