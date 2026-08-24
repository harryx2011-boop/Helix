import type { Log } from '../core/logger.js';

/**
 * SERP providers.
 *
 * Search is the one capability Helix cannot self-host: a search index is not
 * something a scraping tool builds. So this is bring-your-own-key like the rest
 * — the operator's credentials, billed to their account.
 *
 * Serper is the default because the price difference is not marginal. At
 * comparable volume it runs roughly 10-25x cheaper than SerpAPI for the same
 * Google results, which for a search-then-scrape workload dominates the bill.
 */

export type SearchSource = 'web' | 'news' | 'images';

export interface SearchQuery {
  query: string;
  limit: number;
  sources: SearchSource[];
  country?: string | undefined;
  freshness?: string | undefined;
  includeDomains?: string[] | undefined;
  excludeDomains?: string[] | undefined;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet?: string | undefined;
  position: number;
  source: SearchSource;
  publishedAt?: string | undefined;
  imageUrl?: string | undefined;
}

export interface SearchProvider {
  readonly name: string;
  search(query: SearchQuery): Promise<SearchHit[]>;
  configured(): boolean;
}

/** Domain filters as Google search operators, which every SERP API passes through. */
function applyOperators(query: SearchQuery): string {
  const parts = [query.query];

  if (query.includeDomains?.length) {
    // One domain is a plain filter; several need an OR group.
    const clause = query.includeDomains.map((d) => `site:${d}`).join(' OR ');
    parts.push(query.includeDomains.length > 1 ? `(${clause})` : clause);
  }

  for (const domain of query.excludeDomains ?? []) {
    parts.push(`-site:${domain}`);
  }

  return parts.join(' ');
}

/** Relative windows to Google's `tbs` parameter. */
function freshnessToTbs(freshness: string | undefined): string | undefined {
  if (!freshness) return undefined;

  const match = /^(\d+)([hdwmy])$/.exec(freshness.trim().toLowerCase());
  if (!match) return undefined;

  const [, amount, unit] = match;
  return `qdr:${unit}${amount === '1' ? '' : amount}`;
}

export class SerperProvider implements SearchProvider {
  readonly name = 'serper';
  readonly #apiKey: string | undefined;
  readonly #logger: Log | undefined;

  constructor(apiKey: string | undefined, logger?: Log) {
    this.#apiKey = apiKey;
    this.#logger = logger;
  }

  configured(): boolean {
    return Boolean(this.#apiKey);
  }

  async search(query: SearchQuery): Promise<SearchHit[]> {
    if (!this.#apiKey) {
      throw new Error('SERPER_API_KEY is not set.');
    }

    const endpoints: Record<SearchSource, string> = {
      web: 'https://google.serper.dev/search',
      news: 'https://google.serper.dev/news',
      images: 'https://google.serper.dev/images',
    };

    const hits: SearchHit[] = [];

    // Each source is a separate endpoint, and the limit applies per source.
    for (const source of query.sources) {
      const body: Record<string, unknown> = {
        q: applyOperators(query),
        num: query.limit,
      };

      if (query.country) body['gl'] = query.country.toLowerCase();
      const tbs = freshnessToTbs(query.freshness);
      if (tbs) body['tbs'] = tbs;

      try {
        const response = await fetch(endpoints[source], {
          method: 'POST',
          headers: {
            'X-API-KEY': this.#apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });

        if (!response.ok) {
          this.#logger?.warn(
            { status: response.status, source },
            'serper request failed',
          );
          continue;
        }

        const payload = (await response.json()) as {
          organic?: { title?: string; link?: string; snippet?: string; date?: string }[];
          news?: { title?: string; link?: string; snippet?: string; date?: string; imageUrl?: string }[];
          images?: { title?: string; link?: string; imageUrl?: string }[];
        };

        const rows =
          source === 'web' ? payload.organic : source === 'news' ? payload.news : payload.images;

        rows?.slice(0, query.limit).forEach((row, index) => {
          if (!row.link) return;
          hits.push({
            title: row.title ?? '',
            url: row.link,
            snippet: 'snippet' in row ? row.snippet : undefined,
            position: index + 1,
            source,
            publishedAt: 'date' in row ? row.date : undefined,
            imageUrl: 'imageUrl' in row ? row.imageUrl : undefined,
          });
        });
      } catch (error) {
        // One source failing should not lose the results from the others.
        this.#logger?.warn({ error, source }, 'serper request errored');
      }
    }

    return hits;
  }
}

export class SerpApiProvider implements SearchProvider {
  readonly name = 'serpapi';
  readonly #apiKey: string | undefined;
  readonly #logger: Log | undefined;

  constructor(apiKey: string | undefined, logger?: Log) {
    this.#apiKey = apiKey;
    this.#logger = logger;
  }

  configured(): boolean {
    return Boolean(this.#apiKey);
  }

  async search(query: SearchQuery): Promise<SearchHit[]> {
    if (!this.#apiKey) {
      throw new Error('SERPAPI_KEY is not set.');
    }

    const hits: SearchHit[] = [];

    for (const source of query.sources) {
      const params = new URLSearchParams({
        api_key: this.#apiKey,
        q: applyOperators(query),
        num: String(query.limit),
        engine: 'google',
      });

      if (source === 'news') params.set('tbm', 'nws');
      if (source === 'images') params.set('tbm', 'isch');
      if (query.country) params.set('gl', query.country.toLowerCase());

      const tbs = freshnessToTbs(query.freshness);
      if (tbs) params.set('tbs', tbs);

      try {
        const response = await fetch(`https://serpapi.com/search?${params}`, {
          signal: AbortSignal.timeout(20_000),
        });

        if (!response.ok) {
          this.#logger?.warn({ status: response.status, source }, 'serpapi request failed');
          continue;
        }

        const payload = (await response.json()) as {
          organic_results?: { title?: string; link?: string; snippet?: string; date?: string }[];
          news_results?: { title?: string; link?: string; snippet?: string; date?: string }[];
          images_results?: { title?: string; link?: string; original?: string }[];
        };

        const rows =
          source === 'web'
            ? payload.organic_results
            : source === 'news'
              ? payload.news_results
              : payload.images_results;

        rows?.slice(0, query.limit).forEach((row, index) => {
          if (!row.link) return;
          hits.push({
            title: row.title ?? '',
            url: row.link,
            snippet: 'snippet' in row ? row.snippet : undefined,
            position: index + 1,
            source,
            publishedAt: 'date' in row ? row.date : undefined,
            imageUrl: 'original' in row ? row.original : undefined,
          });
        });
      } catch (error) {
        this.#logger?.warn({ error, source }, 'serpapi request errored');
      }
    }

    return hits;
  }
}

export function createSearchProvider(
  name: string,
  env: NodeJS.ProcessEnv,
  logger?: Log,
): SearchProvider | undefined {
  switch (name) {
    case 'serper':
      return new SerperProvider(env['SERPER_API_KEY'], logger);
    case 'serpapi':
      return new SerpApiProvider(env['SERPAPI_KEY'], logger);
    default:
      return undefined;
  }
}

export { applyOperators, freshnessToTbs };
