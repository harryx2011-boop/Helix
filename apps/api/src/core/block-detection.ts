
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
  | 'unsafe_url'
  | 'session_closed'
  | 'service_unavailable'
  | 'aborted';

export function classifyTransportError(message: string): FailureReason {
  const m = message.toLowerCase();

  if (
    m.includes('fetch failed') ||
    m.includes('econnrefused') ||
    m.includes('unreachable') ||
    m.includes('service') ||
    m.includes('not configured') ||
    m.includes('helix-scrape') ||
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
  detectedBy: string[];
  confidence: number;
}

export interface ResponseFacts {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  contentType?: string | undefined;
  extractedText?: string | undefined;
}

interface Signal {
  name: string;
  weight: number;
  reason: FailureReason;
  test: (r: ScanFacts) => boolean;
}

/** ResponseFacts plus the body lowercased once, and how interstitial-shaped the page is. */
interface ScanFacts extends ResponseFacts {
  lower: string;
  /** An error status, or a small page with little real content. Vendor names and widgets count only here. */
  interstitial: boolean;
  /** Same, without the size cap: little text, whatever the body weighs. Challenge-only identifiers count here. */
  thin: boolean;
}

const hasHeader = (r: ResponseFacts, name: string): boolean =>
  Object.keys(r.headers).some((h) => h.toLowerCase() === name.toLowerCase());

const bodyIncludes = (r: ScanFacts, needle: string): boolean =>
  r.interstitial && r.lower.includes(needle);

// Identifiers only a challenge page carries (Cloudflare's interstitial state object,
// PerimeterX's challenge element, DataDome's challenge frame, a captcha widget's
// markup, the WAF integration scripts, a verification wall's phrase). A bare vendor
// name can sit in a large page's icons and links; these cannot, so they need only
// thin text, and a wall that ships a full template or inline CSS is still caught.
const challengeIncludes = (r: ScanFacts, needle: string): boolean =>
  r.thin && r.lower.includes(needle);

const INTERSTITIAL_TEXT_CHARS = 1000;
const INTERSTITIAL_BODY_BYTES = 32_768;

// Little real content. With extracted text that is its length; without, the body size.
const isThin = (r: ResponseFacts): boolean =>
  r.statusCode >= 400 ||
  (r.extractedText !== undefined
    ? r.extractedText.trim().length < INTERSTITIAL_TEXT_CHARS
    : r.body.length < INTERSTITIAL_BODY_BYTES);

// A challenge page is small. A large document that yields little text (a script-heavy
// index, an app shell) is content: after helix-scrape solved Cloudflare on
// nopecha.com/demo, 173 KB of page with 742 chars of text was flagged because an
// icon sprite and nav links named PerimeterX and Turnstile. An error status stays
// interstitial at any size.
const isInterstitialShaped = (r: ResponseFacts): boolean =>
  r.statusCode >= 400 || (isThin(r) && r.body.length < INTERSTITIAL_BODY_BYTES);

/**
 * Vendor fingerprints are deliberately specific. Matching on a bare mention of
 * "cloudflare" would flag any page that merely names its CDN.
 */
const SIGNALS: Signal[] = [
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
    test: (r) =>
      challengeIncludes(r, 'cf-browser-verification') ||
      challengeIncludes(r, '_cf_chl_opt') ||
      challengeIncludes(r, '<title>just a moment...</title>') ||
      challengeIncludes(r, 'checking your browser before accessing'),
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
    test: (r) =>
      (r.thin && hasHeader(r, 'x-datadome')) ||
      bodyIncludes(r, 'datadome') ||
      challengeIncludes(r, 'geo.captcha-delivery.com'),
  },
  {
    name: 'perimeterx',
    weight: 0.95,
    reason: 'challenge',
    test: (r) =>
      bodyIncludes(r, '_pxhd') ||
      challengeIncludes(r, 'px-captcha') ||
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
      challengeIncludes(r, '_incapsula_') || bodyIncludes(r, 'incident id:'),
  },
  {
    name: 'aws-waf',
    weight: 0.85,
    reason: 'challenge',
    test: (r) => challengeIncludes(r, 'awswafintegration') || challengeIncludes(r, 'aws-waf-token'),
  },

  {
    name: 'captcha-widget',
    weight: 0.8,
    reason: 'challenge',
    test: (r) =>
      challengeIncludes(r, 'g-recaptcha') ||
      challengeIncludes(r, 'h-captcha') ||
      challengeIncludes(r, 'cf-turnstile') ||
      challengeIncludes(r, 'challenges.cloudflare.com/turnstile') ||
      bodyIncludes(r, 'turnstile'),
  },
  {
    name: 'human-verification',
    weight: 0.8,
    reason: 'challenge',
    test: (r) =>
      challengeIncludes(r, 'prove your humanity') ||
      challengeIncludes(r, 'verify you are human') ||
      challengeIncludes(r, 'verify that you are human') ||
      challengeIncludes(r, 'verifying you are human') ||
      challengeIncludes(r, 'are you a robot') ||
      challengeIncludes(r, 'enable javascript and cookies to continue') ||
      challengeIncludes(r, 'whoa there, pardner'),
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
  const thin = isThin(response);
  // Lowercase once, and only when a body marker can count: a full 1 MB page skips it.
  const scan: ScanFacts = { ...response, interstitial, thin, lower: thin ? response.body.toLowerCase() : '' };
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

export function classifyFailure(response: ResponseFacts): FailureReason | undefined {
  const verdict = detectBlock(response);
  if (verdict.blocked) return verdict.reason;

  if (response.statusCode >= 500) return 'http_error';
  if (response.statusCode >= 400) return 'http_error';
  if (response.body.trim().length === 0) return 'empty';

  return undefined;
}
