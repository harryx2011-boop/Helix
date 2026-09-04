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
function tierSupports(tier: Tier, caps: Capabilities): boolean {
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
 */
export function minimumViableTier(caps: Capabilities): Tier {
  // Bounded by the default ceiling, so a capability requirement can never
  // *start* a request at the opt-in tier: camoufox supports everything chromium
  // does, and picking the lowest viable tier without this bound would still
  // never choose it — but the bound is stated rather than relied upon.
  for (const tier of TIER_ORDER) {
    if (tierSupports(tier, caps)) return tier;
    if (tier === DEFAULT_MAX_TIER) break;
  }
  return DEFAULT_MAX_TIER;
}

/**
 * Whether the raw HTML actually carries the content, or is a hydration shell.
 *
 * Deliberately signal-based rather than framework-based.
 */
export function contentLooksAbsent(html: string, extractedText?: string): boolean {
  if (extractedText !== undefined && extractedText.trim().length >= 200) return false;

  const emptyRoot =
    /<div[^>]+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(html);
  if (emptyRoot) return true;

  // Strip scripts/styles and see whether meaningful text remains.
  const withoutCode = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (withoutCode.length < 200) return true;

  // A body that is overwhelmingly script is a shell, whatever framework made it.
  const scriptBytes = (html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? []).join('').length;
  if (html.length > 0 && scriptBytes / html.length > 0.9) return true;

  return false;
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
