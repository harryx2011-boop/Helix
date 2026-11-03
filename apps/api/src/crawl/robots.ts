import robotsParser from 'robots-parser';
import type { Log } from '../core/logger.js';
import { isPrivateHost } from '../core/url-guard.js';
import { pinnedFetch, type PinnedFetch } from '../core/pinned-fetch.js';


const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ROBOTS_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

export interface RobotsRules {
  isAllowed(url: string): boolean;
  crawlDelaySeconds(): number | undefined;
  sitemaps(): string[];
}

interface CacheEntry {
  rules: RobotsRules;
  expiresAt: number;
}

const PERMISSIVE: RobotsRules = {
  isAllowed: () => true,
  crawlDelaySeconds: () => undefined,
  sitemaps: () => [],
};

export class RobotsCache {
  readonly #cache = new Map<string, CacheEntry>();
  readonly #userAgent: string;
  readonly #logger: Log | undefined;
  readonly #fetchImpl: PinnedFetch;

  constructor(userAgent: string, logger?: Log, fetchImpl: PinnedFetch = pinnedFetch) {
    this.#userAgent = userAgent;
    this.#logger = logger;
    this.#fetchImpl = fetchImpl;
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
      let current = new URL(robotsUrl);
      let response: Response;

      for (let hop = 0; ; hop += 1) {
        if (isPrivateHost(current)) {
          this.#logger?.debug({ robotsUrl, blocked: current.href }, 'robots.txt redirected to a private address');
          return PERMISSIVE;
        }

        response = await this.#fetchImpl(current.toString(), {
          headers: { 'user-agent': this.#userAgent },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: 'manual',
        });

        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) break;

        await response.body?.cancel().catch(() => undefined);
        if (hop >= MAX_REDIRECTS) return PERMISSIVE;
        current = new URL(location, current);
      }

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
