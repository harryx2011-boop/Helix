import { BloomFilter } from 'bloom-filters';
import {
  compilePathPatterns,
  depthFrom,
  isSameOrigin,
  isSameSite,
  matchesAny,
  fetchUrl,
  normaliseUrl,
  siteOf,
  type PathMatcher,
} from './url.js';


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
  key: string;
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

  add(rawUrl: string, depth: number): boolean {
    if (this.#enqueued >= this.#options.limit) return this.#reject('limit-reached');

    const url = normaliseUrl(rawUrl, {
      ignoreQuery: this.#options.ignoreQuery ?? false,
    });
    const target = fetchUrl(rawUrl);
    if (!url || !target) return this.#reject('invalid');

    if (this.#seen(url)) return this.#reject('duplicate');

    const isSeed = depth === 0 && url === this.#seed;
    if (!this.#inScope(url, isSeed)) return false;

    if (this.#options.maxDepth !== undefined && depth > this.#options.maxDepth) {
      return this.#reject('too-deep');
    }

    const site = siteOf(url);
    if (!site) return this.#reject('invalid');

    this.#remember(url);
    this.#queue.push({ url: target, key: url, depth, site });
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

    if (this.#exclude.length > 0 && matchesAny(pathname, this.#exclude)) {
      return this.#reject('excluded');
    }

    if (this.#include.length > 0 && !matchesAny(pathname, this.#include)) {
      return this.#reject('not-included');
    }

    return true;
  }

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

  peekLast(): FrontierItem | undefined {
    return this.#queue[this.#queue.length - 1];
  }

  drain(): void {
    this.#queue.length = 0;
  }

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

  rejections(): Record<string, number> {
    return Object.fromEntries(this.#rejections);
  }

  hosts(): string[] {
    return [...new Set(this.#queue.map((item) => item.site))];
  }
}

export { depthFrom };
