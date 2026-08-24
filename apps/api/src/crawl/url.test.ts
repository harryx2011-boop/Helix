import { describe, expect, it } from 'vitest';
import {
  compilePathPattern,
  depthFrom,
  globMatcher,
  isGlobPattern,
  isSameSite,
  matchesAnyPattern,
  normaliseUrl,
  siteOf,
} from './url.js';

describe('normaliseUrl', () => {
  it('collapses the variants of one page into a single key', () => {
    // The complaint that motivates this: a crawl returning site.com/,
    // www.site.com/ and site.com/#top as three separate pages.
    const canonical = normaliseUrl('https://site.com/page');

    expect(normaliseUrl('https://www.site.com/page')).toBe(canonical);
    expect(normaliseUrl('https://site.com/page/')).toBe(canonical);
    expect(normaliseUrl('https://site.com/page#section')).toBe(canonical);
    expect(normaliseUrl('https://SITE.com/page')).toBe(canonical);
    expect(normaliseUrl('https://site.com:443/page')).toBe(canonical);
  });

  it('strips tracking parameters but keeps meaningful ones', () => {
    // ?page=2 is a different document; ?utm_source is the same one.
    expect(normaliseUrl('https://site.com/list?utm_source=twitter&page=2')).toBe(
      'https://site.com/list?page=2',
    );
    expect(normaliseUrl('https://site.com/list?fbclid=abc')).toBe('https://site.com/list');
  });

  it('sorts query parameters so ordering does not defeat dedup', () => {
    expect(normaliseUrl('https://site.com/s?b=2&a=1')).toBe(
      normaliseUrl('https://site.com/s?a=1&b=2'),
    );
  });

  it('preserves the root slash', () => {
    expect(normaliseUrl('https://site.com/')).toBe('https://site.com/');
  });

  it('can drop the query entirely when asked', () => {
    expect(normaliseUrl('https://site.com/p?a=1', { ignoreQuery: true })).toBe(
      'https://site.com/p',
    );
  });

  it('rejects anything that is not http or https', () => {
    expect(normaliseUrl('ftp://site.com/file')).toBeUndefined();
    expect(normaliseUrl('javascript:alert(1)')).toBeUndefined();
    expect(normaliseUrl('not a url')).toBeUndefined();
  });
});

describe('siteOf', () => {
  it('reduces a host to its registrable domain', () => {
    expect(siteOf('https://blog.example.com/post')).toBe('example.com');
    expect(siteOf('https://www.example.com')).toBe('example.com');
  });

  it('handles two-level public suffixes', () => {
    // Getting this wrong would treat bbc.co.uk and itv.co.uk as one site and
    // pace them against a shared budget.
    expect(siteOf('https://news.bbc.co.uk/story')).toBe('bbc.co.uk');
    expect(siteOf('https://shop.example.com.au')).toBe('example.com.au');
  });
});

describe('isSameSite', () => {
  it('treats subdomains of one domain as the same site', () => {
    expect(isSameSite('https://example.com', 'https://blog.example.com')).toBe(true);
  });

  it('separates genuinely different sites', () => {
    expect(isSameSite('https://example.com', 'https://other.com')).toBe(false);
  });
});

describe('depthFrom', () => {
  it('counts path segments below the base', () => {
    expect(depthFrom('https://s.com/docs', 'https://s.com/docs')).toBe(0);
    expect(depthFrom('https://s.com/docs', 'https://s.com/docs/intro')).toBe(1);
    expect(depthFrom('https://s.com/docs', 'https://s.com/docs/a/b')).toBe(2);
  });

  it('reports undefined for a URL outside the base path', () => {
    expect(depthFrom('https://s.com/docs', 'https://s.com/blog')).toBeUndefined();
  });
});

describe('matchesAnyPattern', () => {
  it('matches against the pathname', () => {
    expect(matchesAnyPattern('https://s.com/blog/post', ['^/blog'])).toBe(true);
    expect(matchesAnyPattern('https://s.com/docs/page', ['^/blog'])).toBe(false);
  });

  it('treats an invalid pattern as matching nothing', () => {
    // A broken regex must not silently become "match everything", which would
    // turn an exclude rule into a crawl-nothing rule.
    expect(matchesAnyPattern('https://s.com/x', ['[unclosed'])).toBe(false);
  });

  it('reports false for an empty pattern list', () => {
    expect(matchesAnyPattern('https://s.com/x', [])).toBe(false);
  });
});

describe('glob path patterns', () => {
  it('tells globs from regular expressions', () => {
    expect(isGlobPattern('/blog/*')).toBe(true);
    expect(isGlobPattern('/docs/**/api')).toBe(true);
    expect(isGlobPattern('/page-?')).toBe(true);
    expect(isGlobPattern('^/blog')).toBe(false);
    expect(isGlobPattern('/blog/.*')).toBe(false);
    expect(isGlobPattern('/(a|b)/*')).toBe(false);
    expect(isGlobPattern('/internal')).toBe(false);
  });

  it('matches everything under a prefix with a trailing star', () => {
    // The spec's own example: include /blog/*, exclude /blog/tag/*.
    expect(matchesAnyPattern('https://s.com/blog/post-1', ['/blog/*'])).toBe(true);
    expect(matchesAnyPattern('https://s.com/blog/2024/post-1', ['/blog/*'])).toBe(true);
    expect(matchesAnyPattern('https://s.com/blog/tag/x', ['/blog/tag/*'])).toBe(true);
    expect(matchesAnyPattern('https://s.com/pricing', ['/blog/*'])).toBe(false);
    expect(matchesAnyPattern('https://s.com/blogroll', ['/blog/*'])).toBe(false);
  });

  it('anchors globs to the whole path and tolerates a trailing slash', () => {
    expect(matchesAnyPattern('https://s.com/docs/', ['/docs'])).toBe(true);
    expect(matchesAnyPattern('https://s.com/docs/api/', ['/docs/*'])).toBe(true);
    expect(matchesAnyPattern('https://s.com/docs/api/v2', ['/docs/?pi'])).toBe(false);
    expect(matchesAnyPattern('https://s.com/docs/api', ['/docs/?pi'])).toBe(true);
  });

  it('matches anywhere when the glob has no leading slash', () => {
    expect(matchesAnyPattern('https://s.com/a/b/draft-1', ['draft-*'])).toBe(true);
  });

  it('treats a dot inside a glob literally', () => {
    expect(globMatcher('/files/*.pdf').test('/files/report.pdf')).toBe(true);
    expect(globMatcher('/files/*.pdf').test('/files/reportxpdf')).toBe(false);
  });

  it('matches the directory itself with a trailing star', () => {
    // The seed `https://example.com/blog/` normalises to `/blog`; the spec's
    // `/blog/*` must still cover it.
    expect(matchesAnyPattern('https://s.com/blog', ['/blog/*'])).toBe(true);
    expect(matchesAnyPattern('https://s.com/blog/', ['/blog/*'])).toBe(true);
    expect(matchesAnyPattern('https://s.com/', ['/blog/*'])).toBe(false);
  });

  it('keeps a question mark to one segment', () => {
    expect(globMatcher('/a/?/b').test('/a/x/b')).toBe(true);
    expect(globMatcher('/a/?/b').test('/a///b')).toBe(false);
  });
});

describe('pattern cost bounds', () => {
  it('matches a star-heavy glob against a long path in bounded time', () => {
    const glob = '/*a*a*a*a*a*a*a*a*a*a*a*a*a*a*b';
    const path = `/${'a'.repeat(4_000)}!`;
    const started = Date.now();
    expect(matchesAnyPattern(`https://s.com${path}`, [glob])).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('refuses a regular expression with a nested quantifier', () => {
    expect(compilePathPattern('^(a+)+$')).toBeUndefined();
    expect(compilePathPattern('^(a|aa)*$')).toBeUndefined();
    expect(compilePathPattern('^(?:ab)+$')).toBeDefined();
    expect(compilePathPattern('^/docs/(v1|v2)/.*$')).toBeDefined();
  });

  it('refuses a pattern longer than any path a caller means', () => {
    expect(compilePathPattern(`/${'a'.repeat(600)}`)).toBeUndefined();
  });
});
