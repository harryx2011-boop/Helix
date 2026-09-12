/**
 * URL normalisation.
 *
 * Dedup is only as good as the key it compares. `https://site.com/`,
 * `https://www.site.com`, and `https://site.com/?utm_source=x` are one page
 * wearing three hats, and a crawler that treats them as three fetches three
 * times and reports inflated coverage.
 *
 * Normalisation is deliberately conservative: it only removes things that
 * provably cannot change what a server returns. Query parameters are sorted,
 * not dropped, because `?page=2` matters even though `?utm_source` does not.
 */

/** Parameters that identify a campaign or a session, never a document. */
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
  /** Drop the query string entirely. */
  ignoreQuery?: boolean;
  /** Treat `www.` and the bare host as the same site. */
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

  // A fragment is resolved by the browser and never sent to the server, so two
  // URLs differing only by fragment are the same fetch.
  url.hash = '';

  url.hostname = url.hostname.toLowerCase();
  if (options.ignoreWww !== false && url.hostname.startsWith('www.') && url.hostname.split('.').length > 2) {
    url.hostname = url.hostname.slice(4);
  }

  // Default ports carry no meaning.
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
      // Ordering is not significant to a server, but it is to string equality.
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    url.search = '';
    for (const [key, value] of params) url.searchParams.append(key, value);
  }

  // `/path/` and `/path` are the same document often enough, and different
  // rarely enough, that collapsing the trailing slash is the right default.
  // The root is left alone: `https://site.com/` is canonical.
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

/** The registrable domain, used to partition politeness per site. */
export function siteOf(input: string): string | undefined {
  try {
    const { hostname } = new URL(input);
    const lower = hostname.toLowerCase();
    const host = lower.startsWith('www.') && lower.split('.').length > 2 ? lower.slice(4) : lower;

    // A full public-suffix list is overkill here: politeness only needs a
    // stable grouping key, and grouping by the last two labels is stable even
    // where it is not strictly the registrable domain.
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

/** Depth below a base path, or undefined when the URL is outside it. */
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

/** Longer than any path pattern a caller means; bounds the work a regex can do. */
const MAX_PATTERN_LENGTH = 512;

/**
 * A path pattern is a glob when it uses `*` or `?` and nothing that only a
 * regular expression would: anchors, groups, classes, escapes, alternation.
 * `/blog/*` is what the spec documents; `^/blog` keeps working for callers who
 * already send regular expressions.
 */
export function isGlobPattern(pattern: string): boolean {
  return /[*?]/.test(pattern) && !/^\^|\$$|\.\*|[\\()|+[\]{}]/.test(pattern);
}

/**
 * A quantified group that itself repeats or alternates (`(a+)+`, `(a|aa)*`)
 * backtracks exponentially on a non-matching path. Patterns are matched inside
 * the API process against every discovered link, so one such pattern would
 * stall every request on the server.
 */
function hasNestedQuantifier(pattern: string): boolean {
  return /\((?:[^()\\]|\\.)*[*+}|](?:[^()\\]|\\.)*\)[*+{]/.test(pattern);
}

/**
 * Wildcard match without a regular expression: `*` (or `**`) matches any run
 * of characters including `/`, `?` matches one character other than `/`.
 * Linear in the pattern for each position of the path, never exponential,
 * which is why globs are not compiled to `.*`.
 */
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

/**
 * Glob over the pathname. `/blog/*` means "everything under /blog", which is
 * what the include/exclude use reads as, so it also matches `/blog` itself:
 * the trailing slash is not significant after normalisation. A pattern
 * without a leading slash matches anywhere in the path.
 */
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

/**
 * Compile a path pattern, or undefined when it is a regular expression that
 * does not parse or could not be matched in bounded time.
 */
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

/** Compile every pattern, dropping the ones that do not compile: an invalid pattern must not match everything by accident. */
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
