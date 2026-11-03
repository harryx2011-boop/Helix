import type { Log } from '../core/logger.js';


export type SearchSource = 'web' | 'news' | 'images';

export interface SearchQuery {
  query: string;
  limit: number;
  sources: SearchSource[];
  lang?: string | undefined;
  country?: string | undefined;
  freshness?: string | undefined;
  tbs?: string | undefined;
  includeDomains?: string[] | undefined;
  excludeDomains?: string[] | undefined;
  page?: number | undefined;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet?: string | undefined;
  position: number;
  source: SearchSource;
  publishedAt?: string | undefined;
  imageUrl?: string | undefined;
  thumbnailUrl?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface SourceFailure {
  source: SearchSource;
  message: string;
}

export interface ProviderResult {
  hits: SearchHit[];
  failures: SourceFailure[];
}

export interface SearchProvider {
  readonly name: string;
  search(query: SearchQuery, signal?: AbortSignal): Promise<ProviderResult>;
  configured(): boolean;
}

const BACKEND_TIMEOUT_MS = 20_000;

function backendSignal(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(BACKEND_TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'TimeoutError'
      ? `timed out after ${BACKEND_TIMEOUT_MS / 1000}s`
      : error.message;
  }
  return 'request failed';
}

function applyOperators(query: SearchQuery): string {
  const parts = [query.query];

  if (query.includeDomains?.length) {
    const clause = query.includeDomains.map((d) => `site:${d}`).join(' OR ');
    parts.push(query.includeDomains.length > 1 ? `(${clause})` : clause);
  }

  for (const domain of query.excludeDomains ?? []) {
    parts.push(`-site:${domain}`);
  }

  return parts.join(' ');
}

function freshnessToTbs(freshness: string | undefined): string | undefined {
  if (!freshness) return undefined;

  const match = /^(\d+)([hdwmy])$/.exec(freshness.trim().toLowerCase());
  if (!match) return undefined;

  const [, amount, unit] = match;
  return `qdr:${unit}${amount === '1' ? '' : amount}`;
}

function resolveTbs(query: SearchQuery): string | undefined {
  return query.tbs?.trim() || freshnessToTbs(query.freshness);
}

function tbsToSearxngRange(tbs: string | undefined): 'day' | 'month' | 'year' | undefined {
  if (!tbs) return undefined;
  const match = /^qdr:([hdwmy])(\d*)$/.exec(tbs.trim().toLowerCase());
  if (!match) return undefined;
  const unit = match[1];
  const amount = Number.parseInt(match[2] || '1', 10);

  const hoursPerUnit: Record<string, number> = { h: 1, d: 24, w: 24 * 7, m: 24 * 30, y: 24 * 365 };
  const hours = amount * (hoursPerUnit[unit ?? 'd'] ?? 24);

  if (hours <= 24) return 'day';
  if (hours <= 24 * 31) return 'month';
  return 'year';
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

  async search(query: SearchQuery, signal?: AbortSignal): Promise<ProviderResult> {
    if (!this.#apiKey) {
      throw new Error('SERPER_API_KEY is not set.');
    }

    const endpoints: Record<SearchSource, string> = {
      web: 'https://google.serper.dev/search',
      news: 'https://google.serper.dev/news',
      images: 'https://google.serper.dev/images',
    };

    const hits: SearchHit[] = [];
    const failures: SourceFailure[] = [];

    for (const source of query.sources) {
      const body: Record<string, unknown> = {
        q: applyOperators(query),
        num: query.limit,
      };

      if (query.page && query.page > 1) body['page'] = query.page;
      if (query.country) body['gl'] = query.country.toLowerCase();
      if (query.lang) body['hl'] = query.lang.toLowerCase();
      const tbs = resolveTbs(query);
      if (tbs) body['tbs'] = tbs;

      try {
        const response = await fetch(endpoints[source], {
          method: 'POST',
          headers: {
            'X-API-KEY': this.#apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: backendSignal(signal),
        });

        if (!response.ok) {
          this.#logger?.warn({ status: response.status, source }, 'serper request failed');
          failures.push({ source, message: `serper answered HTTP ${response.status} for ${source}` });
          continue;
        }

        const payload = (await response.json()) as {
          organic?: { title?: string; link?: string; snippet?: string; date?: string }[];
          news?: { title?: string; link?: string; snippet?: string; date?: string; imageUrl?: string }[];
          images?: {
            title?: string;
            link?: string;
            imageUrl?: string;
            thumbnailUrl?: string;
            imageWidth?: number;
            imageHeight?: number;
          }[];
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
            thumbnailUrl: 'thumbnailUrl' in row ? row.thumbnailUrl : undefined,
            width: 'imageWidth' in row ? row.imageWidth : undefined,
            height: 'imageHeight' in row ? row.imageHeight : undefined,
          });
        });
      } catch (error) {
        this.#logger?.warn({ error, source }, 'serper request errored');
        failures.push({ source, message: `serper request for ${source} ${describeError(error)}` });
      }
    }

    return { hits, failures };
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

  async search(query: SearchQuery, signal?: AbortSignal): Promise<ProviderResult> {
    if (!this.#apiKey) {
      throw new Error('SERPAPI_KEY is not set.');
    }

    const hits: SearchHit[] = [];
    const failures: SourceFailure[] = [];

    for (const source of query.sources) {
      const params = new URLSearchParams({
        api_key: this.#apiKey,
        q: applyOperators(query),
        num: String(query.limit),
        engine: 'google',
      });

      if (source === 'news') params.set('tbm', 'nws');
      if (source === 'images') params.set('tbm', 'isch');
      if (query.page && query.page > 1) params.set(source === 'images' ? 'ijn' : 'start', String(source === 'images' ? query.page - 1 : (query.page - 1) * query.limit));
      if (query.country) params.set('gl', query.country.toLowerCase());
      if (query.lang) params.set('hl', query.lang.toLowerCase());

      const tbs = resolveTbs(query);
      if (tbs) params.set('tbs', tbs);

      try {
        const response = await fetch(`https://serpapi.com/search?${params}`, {
          signal: backendSignal(signal),
        });

        if (!response.ok) {
          this.#logger?.warn({ status: response.status, source }, 'serpapi request failed');
          failures.push({ source, message: `serpapi answered HTTP ${response.status} for ${source}` });
          continue;
        }

        const payload = (await response.json()) as {
          organic_results?: { title?: string; link?: string; snippet?: string; date?: string }[];
          news_results?: { title?: string; link?: string; snippet?: string; date?: string }[];
          images_results?: {
            title?: string;
            link?: string;
            original?: string;
            thumbnail?: string;
            original_width?: number;
            original_height?: number;
          }[];
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
            thumbnailUrl: 'thumbnail' in row ? row.thumbnail : undefined,
            width: 'original_width' in row ? row.original_width : undefined,
            height: 'original_height' in row ? row.original_height : undefined,
          });
        });
      } catch (error) {
        this.#logger?.warn({ error, source }, 'serpapi request errored');
        failures.push({ source, message: `serpapi request for ${source} ${describeError(error)}` });
      }
    }

    return { hits, failures };
  }
}

export class SearxngProvider implements SearchProvider {
  readonly name = 'searxng';
  readonly #baseUrl: string | undefined;
  readonly #logger: Log | undefined;

  constructor(baseUrl: string | undefined, logger?: Log) {
    this.#baseUrl = baseUrl?.trim().replace(/\/+$/, '') || undefined;
    this.#logger = logger;
  }

  configured(): boolean {
    return Boolean(this.#baseUrl);
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<ProviderResult> {
    if (!this.#baseUrl) {
      throw new Error('SEARXNG_URL is not set.');
    }

    const categories: Record<SearchSource, string> = {
      web: 'general',
      news: 'news',
      images: 'images',
    };

    const hits: SearchHit[] = [];
    const failures: SourceFailure[] = [];

    for (const source of query.sources) {
      const params = new URLSearchParams({
        q: applyOperators(query),
        format: 'json',
        categories: categories[source],
      });

      if (query.lang) {
        params.set(
          'language',
          query.country
            ? `${query.lang.toLowerCase()}-${query.country.toUpperCase()}`
            : query.lang.toLowerCase(),
        );
      }

      if (query.page && query.page > 1) params.set('pageno', String(query.page));

      const range = tbsToSearxngRange(resolveTbs(query));
      if (range) params.set('time_range', range);

      try {
        const response = await fetch(`${this.#baseUrl}/search?${params}`, {
          headers: { accept: 'application/json' },
          signal: backendSignal(signal),
        });

        if (!response.ok) {
          const message =
            response.status === 403
              ? `searxng refused the JSON format for ${source} (HTTP 403); enable json under search.formats in settings.yml`
              : `searxng answered HTTP ${response.status} for ${source}`;
          this.#logger?.warn({ status: response.status, source }, message);
          failures.push({ source, message });
          continue;
        }

        const payload = (await response.json()) as {
          results?: {
            url?: string;
            title?: string;
            content?: string;
            publishedDate?: string | null;
            img_src?: string;
            thumbnail_src?: string;
            resolution?: string;
          }[];
        };

        payload.results?.slice(0, query.limit).forEach((row, index) => {
          if (!row.url) return;
          const size = /^(\d+)\s*[x×]\s*(\d+)$/.exec(row.resolution ?? '');
          hits.push({
            title: row.title ?? '',
            url: row.url,
            snippet: row.content || undefined,
            position: index + 1,
            source,
            publishedAt: row.publishedDate ?? undefined,
            imageUrl: row.img_src ?? row.thumbnail_src ?? undefined,
            thumbnailUrl: row.thumbnail_src ?? undefined,
            width: size ? Number(size[1]) : undefined,
            height: size ? Number(size[2]) : undefined,
          });
        });
      } catch (error) {
        this.#logger?.warn({ error, source }, 'searxng request errored');
        failures.push({ source, message: `searxng request for ${source} ${describeError(error)}` });
      }
    }

    return { hits, failures };
  }
}

export type SearchProviderName = 'auto' | 'searxng' | 'serper' | 'serpapi' | 'none';

export function createSearchProvider(
  name: string,
  env: NodeJS.ProcessEnv,
  logger?: Log,
): SearchProvider | undefined {
  switch (name) {
    case 'searxng':
      return new SearxngProvider(env['SEARXNG_URL'], logger);
    case 'serper':
      return new SerperProvider(env['SERPER_API_KEY'], logger);
    case 'serpapi':
      return new SerpApiProvider(env['SERPAPI_KEY'], logger);
    case 'auto': {
      const candidates = [
        new SearxngProvider(env['SEARXNG_URL'], logger),
        new SerperProvider(env['SERPER_API_KEY'], logger),
        new SerpApiProvider(env['SERPAPI_KEY'], logger),
      ];
      return candidates.find((candidate) => candidate.configured());
    }
    default:
      return undefined;
  }
}

export { applyOperators, freshnessToTbs, resolveTbs, tbsToSearxngRange };
