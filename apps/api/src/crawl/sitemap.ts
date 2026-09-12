import { XMLParser } from 'fast-xml-parser';
import type { Log } from '../core/logger.js';
import { isPrivateHost } from '../core/url-guard.js';

/**
 * Sitemap discovery.
 *
 * Handles both `<urlset>` and the recursive `<sitemapindex>` case, with hard
 * caps on total URLs and recursion depth — a sitemap index can point at
 * thousands of children, and an unbounded walk is a denial of service against
 * yourself.
 *
 * `<lastmod>` is captured but treated as a hint. In the wild it is frequently
 * stale or simply fabricated, so it can inform incremental crawl decisions but
 * must never be the only evidence a page is unchanged.
 */

const MAX_URLS = 100_000;
const MAX_DEPTH = 3;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024; // the 50MiB limit from the spec
const MAX_REDIRECTS = 5;

export interface SitemapEntry {
  url: string;
  lastModified?: string | undefined;
}

interface RawUrlEntry {
  loc?: string;
  lastmod?: string;
}

interface ParsedSitemap {
  urlset?: { url?: RawUrlEntry | RawUrlEntry[] };
  sitemapindex?: { sitemap?: RawUrlEntry | RawUrlEntry[] };
}

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

export class SitemapFetcher {
  readonly #userAgent: string;
  readonly #logger: Log | undefined;
  readonly #fetchImpl: typeof fetch;
  readonly #parser = new XMLParser({
    ignoreAttributes: true,
    trimValues: true,
  });

  constructor(userAgent: string, logger?: Log, fetchImpl: typeof fetch = fetch) {
    this.#userAgent = userAgent;
    this.#logger = logger;
    this.#fetchImpl = fetchImpl;
  }

  /**
   * Fetch one sitemap, following index files to their children.
   *
   * `seen` guards against a sitemap index that points back at itself, directly
   * or through a cycle.
   */
  async fetch(
    sitemapUrl: string,
    limit = MAX_URLS,
    depth = 0,
    seen = new Set<string>(),
  ): Promise<SitemapEntry[]> {
    if (depth > MAX_DEPTH || seen.has(sitemapUrl) || limit <= 0) return [];
    seen.add(sitemapUrl);

    let xml: string;
    try {
      // A sitemap URL is quoted from a remote robots.txt, so the host is the
      // caller's choice twice over: once in the file and again in whatever it
      // redirects to. Every hop is checked rather than the first alone.
      let current = new URL(sitemapUrl);
      let response: Response;

      for (let hop = 0; ; hop += 1) {
        if (isPrivateHost(current)) {
          this.#logger?.debug({ sitemapUrl, blocked: current.href }, 'sitemap points at a private address');
          return [];
        }

        response = await this.#fetchImpl(current.toString(), {
          headers: { 'user-agent': this.#userAgent },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: 'manual',
        });

        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) break;

        await response.body?.cancel().catch(() => undefined);
        if (hop >= MAX_REDIRECTS) return [];
        current = new URL(location, current);
      }

      if (!response.ok) return [];

      xml = (await response.text()).slice(0, MAX_SITEMAP_BYTES);
    } catch (error) {
      this.#logger?.debug({ error, sitemapUrl }, 'sitemap unreachable');
      return [];
    }

    let parsed: ParsedSitemap;
    try {
      parsed = this.#parser.parse(xml) as ParsedSitemap;
    } catch (error) {
      this.#logger?.debug({ error, sitemapUrl }, 'sitemap did not parse');
      return [];
    }

    // A sitemap index: recurse into each child, spending the remaining budget.
    if (parsed.sitemapindex) {
      const children = asArray(parsed.sitemapindex.sitemap)
        .map((entry) => entry.loc)
        .filter((loc): loc is string => Boolean(loc));

      const collected: SitemapEntry[] = [];
      for (const child of children) {
        if (collected.length >= limit) break;
        const remaining = limit - collected.length;
        collected.push(...(await this.fetch(child, remaining, depth + 1, seen)));
      }
      return collected.slice(0, limit);
    }

    if (parsed.urlset) {
      return asArray(parsed.urlset.url)
        .filter((entry): entry is RawUrlEntry & { loc: string } => Boolean(entry.loc))
        .slice(0, limit)
        .map((entry) => ({
          url: entry.loc,
          lastModified: entry.lastmod,
        }));
    }

    return [];
  }

  /**
   * Find a site's sitemaps: those declared in robots.txt, then the conventional
   * path as a fallback.
   */
  async discover(origin: string, declared: string[], limit = MAX_URLS): Promise<SitemapEntry[]> {
    const candidates = declared.length > 0 ? declared : [`${origin}/sitemap.xml`];

    const seen = new Set<string>();
    const collected: SitemapEntry[] = [];

    for (const candidate of candidates) {
      if (collected.length >= limit) break;
      const remaining = limit - collected.length;
      collected.push(...(await this.fetch(candidate, remaining, 0, seen)));
    }

    // A sitemap index can list the same URL through two children.
    const unique = new Map<string, SitemapEntry>();
    for (const entry of collected) {
      if (!unique.has(entry.url)) unique.set(entry.url, entry);
    }

    return [...unique.values()].slice(0, limit);
  }
}
