import { BloomFilter } from 'bloom-filters';
import {
  compilePathPatterns,
  depthFrom,
  isSameOrigin,
  isSameSite,
  matchesAny,
  normaliseUrl,
  siteOf,
  type PathMatcher,
} from './url.js';

/**
 * The crawl frontier.
 *
 * Breadth-first, partitioned by host, with Bloom-filter dedup. A billion URLs at
 * a 0.1% false-positive rate costs roughly 1.8GB against about 40GB for an exact
 * set — a 22x saving that decides whether a large crawl fits in memory at all.
 *
 * The tradeoff is honest: a false positive silently skips a page that was never
 * visited. At 0.1% that is one page in a thousand, and the alternative is either
 * an exact set that does not fit or a database round trip per candidate URL.
 * Small crawls use an exact set, where the question does not arise.
 */

/** Below this, an exact Set is cheaper and has no false positives at all. */
const EXACT_SET_THRESHOLD = 50_000;

export interface FrontierOptions {
  seedUrl: string;
  limit: number;
  maxDepth?: number | undefined;
  includePaths?: string[] | undefined;
  excludePaths?: string[] | undefined;
  allowSubdomains?: boolean | undefined;
  allowExternal?: boolean | undefined;
  ignoreQuery?: boolean | undefined;
}

export interface FrontierItem {
  url: string;
  depth: number;
  site: string;
}

export type RejectionReason =
  | 'duplicate'
  | 'invalid'
  | 'off-site'
  | 'too-deep'
  | 'excluded'
  | 'not-included'
  | 'limit-reached';

export class Frontier {
  readonly #options: FrontierOptions;
  readonly #queue: FrontierItem[] = [];
  readonly #exact: Set<string> | undefined;
  readonly #bloom: BloomFilter | undefined;
  #enqueued = 0;
  #dispensed = 0;
  readonly #rejections = new Map<RejectionReason, number>();
  readonly #seed: string | undefined;
  readonly #include: PathMatcher[];
  readonly #exclude: PathMatcher[];

  constructor(options: FrontierOptions) {
    this.#options = options;
    this.#seed = normaliseUrl(options.seedUrl, { ignoreQuery: options.ignoreQuery ?? false });
    this.#include = compilePathPatterns(options.includePaths ?? []);
    this.#exclude = compilePathPatterns(options.excludePaths ?? []);

    if (options.limit <= EXACT_SET_THRESHOLD) {
      this.#exact = new Set<string>();
    } else {
      // Sized for the declared limit at a 0.1% false-positive rate.
      this.#bloom = BloomFilter.create(options.limit, 0.001);
    }
  }

  #seen(url: string): boolean {
    return this.#exact ? this.#exact.has(url) : (this.#bloom?.has(url) ?? false);
  }

  #remember(url: string): void {
    if (this.#exact) this.#exact.add(url);
    else this.#bloom?.add(url);
  }

  #reject(reason: RejectionReason): false {
    this.#rejections.set(reason, (this.#rejections.get(reason) ?? 0) + 1);
    return false;
  }

  /** Offer a URL. Returns whether it was accepted. */
  add(rawUrl: string, depth: number): boolean {
    if (this.#enqueued >= this.#options.limit) return this.#reject('limit-reached');

    const url = normaliseUrl(rawUrl, {
      ignoreQuery: this.#options.ignoreQuery ?? false,
    });
    if (!url) return this.#reject('invalid');

    if (this.#seen(url)) return this.#reject('duplicate');

    // The seed is what the caller asked to crawl. Path filters describe what
    // to follow from it: `includePaths: ['/blog/*']` from a site root must
    // still fetch the root to find the blog, or the crawl returns nothing.
    const isSeed = depth === 0 && url === this.#seed;
    if (!this.#inScope(url, isSeed)) return false; // #inScope records its own reason

    if (this.#options.maxDepth !== undefined && depth > this.#options.maxDepth) {
      return this.#reject('too-deep');
    }

    const site = siteOf(url);
    if (!site) return this.#reject('invalid');

    this.#remember(url);
    this.#queue.push({ url, depth, site });
    this.#enqueued++;
    return true;
  }

  #inScope(url: string, isSeed: boolean): boolean {
    const { seedUrl, allowExternal, allowSubdomains } = this.#options;

    if (!allowExternal) {
      const sameSite = isSameSite(seedUrl, url);
      if (allowSubdomains) {
        if (!sameSite) return this.#reject('off-site');
      } else if (!isSameOrigin(seedUrl, url) && !sameSite) {
        return this.#reject('off-site');
      } else if (!allowSubdomains && !isSameOrigin(seedUrl, url)) {
        return this.#reject('off-site');
      }
    }

    if (isSeed) return true;

    const pathname = new URL(url).pathname;

    // Exclusion wins over inclusion: a URL matching both is excluded, because
    // the narrower statement is the one the caller meant.
    if (this.#exclude.length > 0 && matchesAny(pathname, this.#exclude)) {
      return this.#reject('excluded');
    }

    if (this.#include.length > 0 && !matchesAny(pathname, this.#include)) {
      return this.#reject('not-included');
    }

    return true;
  }

  /** Take the next URL for a host with capacity. */
  next(canFetch: (site: string) => boolean): FrontierItem | undefined {
    for (let index = 0; index < this.#queue.length; index++) {
      const item = this.#queue[index];
      if (!item) continue;
      if (canFetch(item.site)) {
        this.#queue.splice(index, 1);
        this.#dispensed++;
        return item;
      }
    }
    return undefined;
  }

  /** The most recently accepted item, without removing it. */
  peekLast(): FrontierItem | undefined {
    return this.#queue[this.#queue.length - 1];
  }

  /**
   * Empty the queue while keeping the dedup filter.
   *
   * Used when resuming: URLs already completed must stay "seen" so they are not
   * re-enqueued, but they must not be handed out as work again either.
   */
  drain(): void {
    this.#queue.length = 0;
  }

  /** Whether any work remains, regardless of host availability. */
  get pending(): number {
    return this.#queue.length;
  }

  get enqueued(): number {
    return this.#enqueued;
  }

  get dispensed(): number {
    return this.#dispensed;
  }

  get atLimit(): boolean {
    return this.#enqueued >= this.#options.limit;
  }

  /**
   * Why URLs were turned away.
   *
   * Surfaced to the caller because "we crawled 12 pages" is a very different
   * statement from "we crawled 12 pages and rejected 4,000 as off-site" — and a
   * silent cap reads as complete coverage when it is not.
   */
  rejections(): Record<string, number> {
    return Object.fromEntries(this.#rejections);
  }

  /** Distinct hosts currently queued. */
  hosts(): string[] {
    return [...new Set(this.#queue.map((item) => item.site))];
  }
}

export { depthFrom };
