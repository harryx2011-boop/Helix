import robotsParser from 'robots-parser';
import type { Log } from '../core/logger.js';

/**
 * robots.txt, per RFC 9309.
 *
 * Respected by default. The override exists, requires an explicit flag, and is
 * logged — a scraper that ignores robots.txt is a reputational problem before it
 * is a technical one.
 *
 * `Crawl-delay` is honoured despite being absent from RFC 9309. Google ignores
 * it; we do not, because a directive a site owner took the trouble to write is
 * worth following even when the standard does not require it.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // RFC 9309 suggests at most 24h
const MAX_ROBOTS_BYTES = 512 * 1024; // RFC 9309 requires parsing at least 500 KiB
const FETCH_TIMEOUT_MS = 10_000;

export interface RobotsRules {
  isAllowed(url: string): boolean;
  crawlDelaySeconds(): number | undefined;
  sitemaps(): string[];
}

interface CacheEntry {
  rules: RobotsRules;
  expiresAt: number;
}

/** Everything is permitted — used when robots.txt is absent or unreadable. */
const PERMISSIVE: RobotsRules = {
  isAllowed: () => true,
  crawlDelaySeconds: () => undefined,
  sitemaps: () => [],
};

export class RobotsCache {
  readonly #cache = new Map<string, CacheEntry>();
  readonly #userAgent: string;
  readonly #logger: Log | undefined;

  constructor(userAgent: string, logger?: Log) {
    this.#userAgent = userAgent;
    this.#logger = logger;
  }

  async forUrl(url: string): Promise<RobotsRules> {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return PERMISSIVE;
    }

    const cached = this.#cache.get(origin);
    if (cached && cached.expiresAt > Date.now()) return cached.rules;

    const rules = await this.#fetch(origin);
    this.#cache.set(origin, { rules, expiresAt: Date.now() + CACHE_TTL_MS });
    return rules;
  }

  async #fetch(origin: string): Promise<RobotsRules> {
    const robotsUrl = `${origin}/robots.txt`;

    try {
      const response = await fetch(robotsUrl, {
        headers: { 'user-agent': this.#userAgent },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });

      // 404 means no rules exist, which is permission. A 5xx means we could not
      // find out — and guessing "allowed" there would be presumptuous, but
      // refusing to crawl on a transient upstream error is worse. RFC 9309
      // treats unreachable as unavailable; we follow that and allow.
      if (!response.ok) {
        return PERMISSIVE;
      }

      const text = (await response.text()).slice(0, MAX_ROBOTS_BYTES);
      const parser = robotsParser(robotsUrl, text);
      const userAgent = this.#userAgent;

      return {
        isAllowed: (target: string) => parser.isAllowed(target, userAgent) ?? true,
        crawlDelaySeconds: () => parser.getCrawlDelay(userAgent) ?? undefined,
        sitemaps: () => parser.getSitemaps() ?? [],
      };
    } catch (error) {
      this.#logger?.debug({ error, robotsUrl }, 'robots.txt unreachable; proceeding');
      return PERMISSIVE;
    }
  }

  clear(): void {
    this.#cache.clear();
  }
}
