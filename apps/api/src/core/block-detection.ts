/**
 * Block detection.
 *
 * A bot-challenge page is a failure even when the upstream returns HTTP 200 —
 * which Cloudflare interstitials routinely do. Returning challenge HTML as if it
 * were content is the single worst thing a scraping API can do: the caller stores
 * garbage, and (in credit-metered products) pays for it.
 *
 * No single signal is trusted. Several weak indicators combine into a verdict,
 * and the verdict names which signals fired so a failure is debuggable rather
 * than mysterious.
 */

export type FailureReason =
  | 'blocked'
  | 'challenge'
  | 'timeout'
  | 'dns'
  | 'tls'
  | 'http_error'
  | 'empty'
  | 'robots_denied'
  | 'unsupported_type'
  // The caller pointed the browser at this host or the network it sits on.
  | 'unsafe_url'
  // The session was closed, by the caller or a timeout, while the run was still on it.
  | 'session_closed'
  // The fetch could not even be attempted — a Helix service was unreachable.
  // This is our own infrastructure failing, not the target site, and must never
  // be reported as a block or challenge: those name something the site did.
  | 'service_unavailable'
  // The caller's own connection closed before the call finished — distinct
  // from `timeout`, which is this side giving up on its own budget.
  | 'aborted';

/**
 * Classify a transport-layer error string into a typed reason.
 *
 * A transport error is a failure to complete the request at all — no HTTP
 * response came back. The distinction that matters most: a Helix service being
 * down (`service_unavailable`) is our fault, and reporting it as a bot challenge
 * would send an operator chasing an anti-bot problem that does not exist.
 */
export function classifyTransportError(message: string): FailureReason {
  const m = message.toLowerCase();

  // Our own services unreachable — the fetch never left the building.
  if (
    m.includes('fetch failed') ||
    m.includes('econnrefused') ||
    m.includes('unreachable') ||
    m.includes('service') ||
    m.includes('not configured') ||
    m.includes('helix-fetch') ||
    m.includes('helix-extract')
  ) {
    return 'service_unavailable';
  }

  if (m.includes('timeout') || m.includes('timed out') || m.includes('etimedout')) {
    return 'timeout';
  }

  if (
    m.includes('name_not_resolved') ||
    m.includes('enotfound') ||
    m.includes('eai_again') ||
    m.includes('dns')
  ) {
    return 'dns';
  }

  if (
    m.includes('tls') ||
    m.includes('ssl') ||
    m.includes('cert') ||
    m.includes('handshake')
  ) {
    return 'tls';
  }

  return 'http_error';
}

export interface BlockVerdict {
  blocked: boolean;
  reason?: FailureReason;
  /** Which signals fired. Surfaced to the caller for debugging. */
  detectedBy: string[];
  /** 0–1. Above 0.5 is treated as blocked. */
  confidence: number;
}

export interface ResponseFacts {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  contentType?: string | undefined;
  /** Text recovered by the extractor, when extraction has already run. */
  extractedText?: string | undefined;
}

interface Signal {
  name: string;
  weight: number;
  reason: FailureReason;
  test: (r: ScanFacts) => boolean;
}

/** ResponseFacts plus the body lowercased once, and whether the page is interstitial-shaped. */
interface ScanFacts extends ResponseFacts {
  lower: string;
  interstitial: boolean;
}

const hasHeader = (r: ResponseFacts, name: string): boolean =>
  Object.keys(r.headers).some((h) => h.toLowerCase() === name.toLowerCase());

// Body markers only count on a page shaped like an interstitial: an error status, or
// little real content. A full page that embeds Turnstile, loads Cloudflare's JS
// detections or names a vendor in prose is content, not a block.
const bodyIncludes = (r: ScanFacts, needle: string): boolean =>
  r.interstitial && r.lower.includes(needle);

const INTERSTITIAL_TEXT_CHARS = 1000;
const INTERSTITIAL_BODY_BYTES = 32_768;

const isInterstitialShaped = (r: ResponseFacts): boolean =>
  r.statusCode >= 400 ||
  (r.extractedText !== undefined
    ? r.extractedText.trim().length < INTERSTITIAL_TEXT_CHARS
    : r.body.length < INTERSTITIAL_BODY_BYTES);

/**
 * Vendor fingerprints are deliberately specific. Matching on a bare mention of
 * "cloudflare" would flag any page that merely names its CDN.
 */
const SIGNALS: Signal[] = [
  // --- explicit status codes -------------------------------------------------
  {
    name: 'status-403',
    weight: 0.6,
    reason: 'blocked',
    test: (r) => r.statusCode === 403,
  },
  {
    name: 'status-429',
    weight: 0.9,
    reason: 'blocked',
    test: (r) => r.statusCode === 429,
  },
  {
    name: 'status-503',
    weight: 0.4,
    reason: 'blocked',
    test: (r) => r.statusCode === 503,
  },

  // --- vendor fingerprints ---------------------------------------------------
  {
    name: 'cloudflare-mitigated',
    weight: 1.0,
    reason: 'challenge',
    test: (r) => hasHeader(r, 'cf-mitigated'),
  },
  {
    name: 'cloudflare-challenge',
    weight: 0.95,
    reason: 'challenge',
    // Not the bare "challenge-platform": ordinary pages load
    // /cdn-cgi/challenge-platform/scripts/jsd/main.js; only the interstitial sets _cf_chl_opt.
    test: (r) =>
      bodyIncludes(r, 'cf-browser-verification') ||
      bodyIncludes(r, '_cf_chl_opt') ||
      bodyIncludes(r, '<title>just a moment...</title>') ||
      bodyIncludes(r, 'checking your browser before accessing'),
  },
  {
    name: 'cloudflare-blocked',
    weight: 0.9,
    reason: 'blocked',
    test: (r) =>
      bodyIncludes(r, 'attention required') && bodyIncludes(r, 'cloudflare'),
  },
  {
    name: 'datadome',
    weight: 0.95,
    reason: 'challenge',
    // DataDome sets x-datadome on every response it lets through, so the header alone is not a block.
    test: (r) =>
      (r.interstitial && hasHeader(r, 'x-datadome')) ||
      bodyIncludes(r, 'datadome') ||
      bodyIncludes(r, 'geo.captcha-delivery.com'),
  },
  {
    name: 'perimeterx',
    weight: 0.95,
    reason: 'challenge',
    test: (r) =>
      bodyIncludes(r, '_pxhd') ||
      bodyIncludes(r, 'px-captcha') ||
      bodyIncludes(r, 'perimeterx'),
  },
  {
    name: 'akamai',
    weight: 0.85,
    reason: 'blocked',
    test: (r) =>
      bodyIncludes(r, 'reference #18.') || bodyIncludes(r, 'akamai reference'),
  },
  {
    name: 'imperva-incapsula',
    weight: 0.9,
    reason: 'blocked',
    test: (r) =>
      bodyIncludes(r, '_incapsula_') || bodyIncludes(r, 'incident id:'),
  },
  {
    name: 'aws-waf',
    weight: 0.85,
    reason: 'challenge',
    test: (r) => bodyIncludes(r, 'awswafintegration') || bodyIncludes(r, 'aws-waf-token'),
  },

  // --- generic challenge markers --------------------------------------------
  {
    name: 'captcha-widget',
    weight: 0.8,
    reason: 'challenge',
    test: (r) =>
      bodyIncludes(r, 'g-recaptcha') ||
      bodyIncludes(r, 'h-captcha') ||
      bodyIncludes(r, 'turnstile'),
  },
  {
    // The wall with no vendor marker: reddit's "Prove your humanity", Google's
    // "enable JavaScript and cookies", a press-and-hold gate. Scored as an
    // empty success before this fired, which is worse than a failure — a crawl
    // recorded the page as read and moved on. The phrases are full clauses
    // rather than single words, and the interstitial gate still applies, so a
    // page writing *about* verification is content.
    name: 'human-verification',
    weight: 0.8,
    reason: 'challenge',
    test: (r) =>
      bodyIncludes(r, 'prove your humanity') ||
      bodyIncludes(r, 'verify you are human') ||
      bodyIncludes(r, 'verify that you are human') ||
      bodyIncludes(r, 'verifying you are human') ||
      bodyIncludes(r, 'are you a robot') ||
      bodyIncludes(r, 'enable javascript and cookies to continue') ||
      bodyIncludes(r, 'whoa there, pardner'),
  },
  {
    name: 'access-denied-phrasing',
    weight: 0.5,
    reason: 'blocked',
    test: (r) =>
      bodyIncludes(r, 'access denied') ||
      bodyIncludes(r, 'you have been blocked') ||
      bodyIncludes(r, 'unusual traffic from your'),
  },
  {
    name: 'meta-refresh-loop',
    weight: 0.4,
    reason: 'challenge',
    test: (r) => /<meta[^>]+http-equiv=["']refresh["']/i.test(r.body) && r.body.length < 4096,
  },

  // --- content-shape heuristics ---------------------------------------------
  // Weak on their own: a genuinely tiny page is not a block. They matter as
  // corroboration when a vendor marker has already fired.
  {
    name: 'body-suspiciously-short',
    weight: 0.25,
    reason: 'empty',
    test: (r) => r.body.length > 0 && r.body.length < 512,
  },
  {
    name: 'no-extractable-content',
    weight: 0.3,
    reason: 'empty',
    test: (r) => r.extractedText !== undefined && r.extractedText.trim().length < 100,
  },
];

const BLOCK_THRESHOLD = 0.5;

export function detectBlock(response: ResponseFacts): BlockVerdict {
  const interstitial = isInterstitialShaped(response);
  // Lowercase once, and only when a body marker can count: a full 1 MB page skips it.
  const scan: ScanFacts = { ...response, interstitial, lower: interstitial ? response.body.toLowerCase() : '' };
  const fired = SIGNALS.filter((s) => {
    try {
      return s.test(scan);
    } catch {
      return false;
    }
  });

  if (fired.length === 0) {
    return { blocked: false, detectedBy: [], confidence: 0 };
  }

  // Strongest signal drives the verdict; corroborating ones add a little.
  const strongest = fired.reduce((a, b) => (b.weight > a.weight ? b : a));
  const corroboration = Math.min(0.15, (fired.length - 1) * 0.05);
  const confidence = Math.min(1, strongest.weight + corroboration);

  if (confidence < BLOCK_THRESHOLD) {
    return { blocked: false, detectedBy: fired.map((s) => s.name), confidence };
  }

  return {
    blocked: true,
    reason: strongest.reason,
    detectedBy: fired.map((s) => s.name),
    confidence,
  };
}

/**
 * A 2xx that is really a block still needs a reason. Non-2xx maps to a transport
 * reason when no block signal fired.
 */
export function classifyFailure(response: ResponseFacts): FailureReason | undefined {
  const verdict = detectBlock(response);
  if (verdict.blocked) return verdict.reason;

  if (response.statusCode >= 500) return 'http_error';
  if (response.statusCode >= 400) return 'http_error';
  if (response.body.trim().length === 0) return 'empty';

  return undefined;
}
