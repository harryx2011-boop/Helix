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
  if (options.ignoreWww !== false && url.hostname.startsWith('www.')) {
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
    const host = hostname.toLowerCase().replace(/^www\./, '');

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
 * Glob to anchored RegExp over the pathname. `*` and `**` match any run of
 * characters including `/` — `/blog/*` means "everything under /blog", which is
 * what the include/exclude use reads as — and `?` matches one character.
 * A pattern without a leading slash matches anywhere in the path.
 */
export function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .split(/(\*+|\?)/)
    .map((part) => {
      if (part.startsWith('*')) return '.*';
      if (part === '?') return '[^/]';
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  const prefix = pattern.startsWith('/') ? '^' : '^.*';
  return new RegExp(`${prefix}${source}/?$`);
}

/** Compile a path pattern, or undefined when it is a regular expression that does not parse. */
export function compilePathPattern(pattern: string): RegExp | undefined {
  try {
    return isGlobPattern(pattern) ? globToRegExp(pattern) : new RegExp(pattern);
  } catch {
    return undefined;
  }
}

export function matchesAnyPattern(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  // An invalid pattern must not match everything by accident.
  return patterns.some((pattern) => compilePathPattern(pattern)?.test(pathname) ?? false);
}
