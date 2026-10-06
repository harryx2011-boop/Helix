/**
 * Fetch-tier escalation.
 *
 * Five tiers, cheapest first:
 *
 *   plain       ~5ms     raw HTTP, no TLS mimicry
 *   tls        ~50ms     coherent JA4 + HTTP/2 settings (helix-fetch)
 *   lightpanda ~25ms     JS execution, no layout or canvas
 *   chromium   ~2-5s     full render, screenshots, actions
 *   camoufox   ~3-6s     hardened Firefox, for sites the render tier still loses
 *
 * The rule that matters: escalate on EVIDENCE, never on a guess about the
 * framework a site uses. Next.js, Nuxt and SvelteKit routinely server-render
 * real content, so "detected React, therefore browser" burns the expensive tier
 * on pages a plain fetch already answered. What we test is whether the content
 * is actually present.
 */

import { detectBlock, type ResponseFacts } from './block-detection.js';

export type Tier = 'plain' | 'tls' | 'lightpanda' | 'chromium' | 'camoufox';

export const TIER_ORDER: readonly Tier[] = [
  'plain',
  'tls',
  'lightpanda',
  'chromium',
  'camoufox',
] as const;

/**
 * The ceiling when a caller does not set one.
 *
 * Camoufox sits above it deliberately. It is off by default, needs a separate
 * process an operator opted into, and costs more than the tier below it — so it
 * is reached by asking for it, never by walking up the ladder. `maxTier` opts
 * a request in.
 */
export const DEFAULT_MAX_TIER: Tier = 'chromium';

export interface Capabilities {
  screenshot?: boolean;
  actions?: boolean;
  /** Canvas, WebGL, or anything needing real visual layout. */
  visualLayout?: boolean;
  pdfRender?: boolean;
  waitFor?: number;
  /** The request must leave through a proxy. */
  proxy?: boolean;
  /** Tiers this instance cannot run (a disabled lightpanda or camoufox). */
  unavailable?: readonly Tier[];
}

export interface EscalationDecision {
  escalate: boolean;
  nextTier?: Tier;
  reason: string;
}

/**
 * Lightpanda has no layout engine, so anything visual must skip it. It is also
 * skipped when a proxy is required: the pool cannot confirm that a proxy handed
 * over CDP is honoured there, and a fetch that quietly leaves from the
 * instance's own address is worse than one tier fewer.
 */
export function tierSupports(tier: Tier, caps: Capabilities): boolean {
  if (caps.unavailable?.includes(tier)) return false;

  const needsRealBrowser =
    caps.screenshot || caps.actions || caps.visualLayout || caps.pdfRender;
  if (needsRealBrowser) return tier === 'chromium' || tier === 'camoufox';

  if (caps.proxy && tier === 'lightpanda') return false;

  const needsJs = caps.waitFor !== undefined && caps.waitFor > 0;
  if (needsJs) return tier === 'lightpanda' || tier === 'chromium' || tier === 'camoufox';

  return true;
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
  // Bounded by the default ceiling, so a capability requirement can never
  // *start* a request at the opt-in tier: camoufox supports everything chromium
  // does, and picking the lowest viable tier without this bound would still
  // never choose it — but the bound is stated rather than relied upon.
  for (const tier of TIER_ORDER) {
    if (tier === 'plain') continue;
    if (tierSupports(tier, caps)) return tier;
    if (tier === DEFAULT_MAX_TIER) break;
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
