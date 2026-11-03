
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'referrer',
  '_ga',
  '_gl',
  'igshid',
  'si',
]);

export interface NormaliseOptions {
  ignoreQuery?: boolean;
  ignoreWww?: boolean;
}

export function normaliseUrl(input: string, options: NormaliseOptions = {}): string | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

  url.hash = '';

  url.hostname = url.hostname.toLowerCase();
  if (options.ignoreWww !== false && url.hostname.startsWith('www.') && url.hostname.split('.').length > 2) {
    url.hostname = url.hostname.slice(4);
  }

  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  if (options.ignoreQuery) {
    url.search = '';
  } else if (url.search) {
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    url.search = '';
    for (const [key, value] of params) url.searchParams.append(key, value);
  }

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function fetchUrl(input: string): string | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  url.hash = '';
  return url.toString();
}

export function siteOf(input: string): string | undefined {
  try {
    const { hostname } = new URL(input);
    const lower = hostname.toLowerCase();
    const host = lower.startsWith('www.') && lower.split('.').length > 2 ? lower.slice(4) : lower;

    const labels = host.split('.');
    if (labels.length <= 2) return host;

    const twoLevelTlds = new Set(['co.uk', 'com.au', 'co.jp', 'co.nz', 'com.br', 'co.za']);
    const lastTwo = labels.slice(-2).join('.');
    if (twoLevelTlds.has(lastTwo)) return labels.slice(-3).join('.');

    return lastTwo;
  } catch {
    return undefined;
  }
}

export function isSameSite(a: string, b: string): boolean {
  const siteA = siteOf(a);
  const siteB = siteOf(b);
  return siteA !== undefined && siteA === siteB;
}

export function isSameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function depthFrom(base: string, target: string): number | undefined {
  try {
    const basePath = new URL(base).pathname.replace(/\/$/, '');
    const targetPath = new URL(target).pathname.replace(/\/$/, '');

    if (!targetPath.startsWith(basePath)) return undefined;

    const remainder = targetPath.slice(basePath.length);
    if (remainder === '') return 0;

    return remainder.split('/').filter(Boolean).length;
  } catch {
    return undefined;
  }
}

export interface PathMatcher {
  test(pathname: string): boolean;
}

const MAX_PATTERN_LENGTH = 512;

export function isGlobPattern(pattern: string): boolean {
  return /[*?]/.test(pattern) && !/^\^|\$$|\.\*|[\\()|+[\]{}]/.test(pattern);
}

function hasNestedQuantifier(pattern: string): boolean {
  return /\((?:[^()\\]|\\.)*[*+}|](?:[^()\\]|\\.)*\)[*+{]/.test(pattern);
}

function wildcardMatch(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let starP = -1;
  let starT = -1;

  while (t < text.length) {
    const c = pattern[p];
    if (c === '*') {
      while (pattern[p] === '*') p++;
      starP = p;
      starT = t;
    } else if (p < pattern.length && (c === text[t] || (c === '?' && text[t] !== '/'))) {
      p++;
      t++;
    } else if (starP !== -1) {
      p = starP;
      starT++;
      t = starT;
    } else {
      return false;
    }
  }

  while (pattern[p] === '*') p++;
  return p === pattern.length;
}

export function globMatcher(pattern: string): PathMatcher {
  const anchored = pattern.startsWith('/') ? pattern : `*${pattern}`;
  const coversDirectory = /\/\*+$/.test(anchored);

  return {
    test(pathname: string): boolean {
      const path =
        pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
      if (wildcardMatch(anchored, path)) return true;
      return coversDirectory && wildcardMatch(anchored, `${path}/`);
    },
  };
}

export function compilePathPattern(pattern: string): PathMatcher | undefined {
  if (pattern.length > MAX_PATTERN_LENGTH) return undefined;
  if (isGlobPattern(pattern)) return globMatcher(pattern);
  if (hasNestedQuantifier(pattern)) return undefined;
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}

export function compilePathPatterns(patterns: string[]): PathMatcher[] {
  return patterns.flatMap((pattern) => compilePathPattern(pattern) ?? []);
}

export function matchesAny(pathname: string, matchers: PathMatcher[]): boolean {
  return matchers.some((matcher) => matcher.test(pathname));
}

export function matchesAnyPattern(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  return matchesAny(pathname, compilePathPatterns(patterns));
}
