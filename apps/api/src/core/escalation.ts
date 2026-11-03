
import { detectBlock, type ResponseFacts } from './block-detection.js';

export type Tier = 'plain' | 'tls' | 'lightpanda' | 'chromium' | 'camoufox';

export const TIER_ORDER: readonly Tier[] = [
  'plain',
  'tls',
  'lightpanda',
  'chromium',
  'camoufox',
] as const;

export const DEFAULT_MAX_TIER: Tier = 'chromium';

export interface Capabilities {
  screenshot?: boolean;
  actions?: boolean;
  visualLayout?: boolean;
  pdfRender?: boolean;
  waitFor?: number;
  proxy?: boolean;
  unavailable?: readonly Tier[];
}

export interface EscalationDecision {
  escalate: boolean;
  nextTier?: Tier;
  reason: string;
}

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

export function minimumViableTier(caps: Capabilities): Tier {
  for (const tier of TIER_ORDER) {
    if (tier === 'plain') continue;
    if (tierSupports(tier, caps)) return tier;
    if (tier === DEFAULT_MAX_TIER) break;
  }
  return DEFAULT_MAX_TIER;
}

const MIN_CONTENT_CHARS = 200;
const MIN_SHORT_PAGE_CHARS = 40;
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

function scriptHeavy(html: string): boolean {
  const scriptBytes = (html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? []).join('').length;
  return html.length > 0 && scriptBytes / html.length > 0.9;
}

export function contentLooksAbsent(html: string, extractedText?: string): boolean {
  if (extractedText !== undefined) {
    const text = extractedText.trim();
    if (text.length >= MIN_CONTENT_CHARS) return false;
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

  if (contentLooksAbsent(response.body, response.extractedText)) {
    const nextTier = next(currentIndex);
    return nextTier
      ? { escalate: true, nextTier, reason: 'content absent from raw HTML' }
      : { escalate: false, reason: 'content absent, but no higher tier is available' };
  }

  return { escalate: false, reason: 'content present' };
}
