import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline } from '../core/pipeline.js';
import type { SearchHit, SearchProvider, SearchSource } from '../search/providers.js';
import { SearchCache } from '../search/cache.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';

/**
 * Search, optionally reading every result in the same call.
 *
 * That combination is the point. Search APIs return snippets; scraping APIs need
 * URLs. Doing both in one request turns "what does the web say about X" from an
 * orchestration problem into a single call.
 */

const FORMATS = ['markdown', 'text', 'rawHtml', 'links', 'screenshot'] as const;

const ScrapeOptionsSchema = z.object({
  formats: z.array(z.enum(FORMATS)).min(1).default(['markdown']),
  tier: z.enum(['auto', 'plain', 'tls', 'lightpanda', 'chromium']).default('auto'),
  onlyMainContent: z.boolean().default(true),
  includeSelectors: z.array(z.string()).default([]),
  excludeSelectors: z.array(z.string()).default([]),
  extractor: z.enum(['trafilatura', 'readability', 'auto']).default('trafilatura'),
  waitFor: z.number().int().min(0).max(30_000).optional(),
  timeout: z.number().int().min(1000).max(120_000).default(20_000),
  headers: z.record(z.string()).optional(),
  profile: z.string().optional(),
});

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).default(5),
  sources: z.array(z.enum(['web', 'news', 'images'])).min(1).default(['web']),
  categories: z.array(z.enum(['github', 'research', 'pdf', 'docs'])).default([]),
  includeDomains: z.array(z.string()).default([]),
  excludeDomains: z.array(z.string()).default([]),
  lang: z
    .string()
    .regex(/^[a-z]{2}$/i, 'expected a two-letter language code')
    .optional(),
  country: z
    .string()
    .regex(/^[a-z]{2}$/i, 'expected a two-letter country code')
    .optional(),
  tbs: z
    .string()
    .regex(/^qdr:[hdwmy]\d*$/i, 'expected a Google time filter such as qdr:d, qdr:w, qdr:m or qdr:y')
    .optional(),
  freshness: z.string().optional(),
  scrapeOptions: ScrapeOptionsSchema.optional(),
  /** Pre-spec alias of `scrapeOptions`, kept so early callers keep working. */
  scrape: ScrapeOptionsSchema.optional(),
});

export type SearchRequestBody = z.infer<typeof SearchRequestSchema>;
type ScrapeOptions = z.infer<typeof ScrapeOptionsSchema>;

export interface SearchRouteDeps {
  provider: SearchProvider | undefined;
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool | undefined;
  /** Operator ceiling on `limit`. */
  maxResults?: number | undefined;
  /** How many result pages one search call may read at once. */
  scrapeConcurrency?: number | undefined;
  /** Provider-hit cache lifetime; 0 disables the cache. */
  cacheTtlMs?: number | undefined;
}

/** Category shorthands, expanded into search operators. */
const CATEGORY_OPERATORS: Record<string, string> = {
  github: 'site:github.com',
  research: '(site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR filetype:pdf)',
  pdf: 'filetype:pdf',
  docs: '(inurl:docs OR inurl:documentation)',
};

interface SearchFailure {
  reason: string;
  detail?: string | undefined;
  statusCode?: number | undefined;
  detectedBy: string[];
  tier?: string | undefined;
  tiersAttempted: string[];
}

export interface SearchResultItem {
  url: string;
  title: string;
  description?: string | undefined;
  position: number;
  publishedAt?: string | undefined;
  imageUrl?: string | undefined;
  markdown?: string | undefined;
  text?: string | undefined;
  rawHtml?: string | undefined;
  links?: string[] | undefined;
  screenshot?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  failure?: SearchFailure | undefined;
}

function baseItem(hit: SearchHit): SearchResultItem {
  return {
    url: hit.url,
    title: hit.title,
    description: hit.snippet,
    position: hit.position,
    publishedAt: hit.publishedAt,
    imageUrl: hit.imageUrl,
  };
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function registerSearch(
  app: FastifyInstance,
  deps: SearchRouteDeps,
): Promise<void> {
  const maxResults = deps.maxResults ?? 50;
  const scrapeConcurrency = deps.scrapeConcurrency ?? 5;
  const cache = new SearchCache(deps.cacheTtlMs ?? 0);

  app.post('/search', async (request, reply) => {
    const parsed = SearchRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({
        error: 'invalid_request',
        message: first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
        field: first?.path.join('.'),
        requestId: request.id,
      });
    }

    const body = parsed.data;

    if (body.limit > maxResults) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `limit: must be at most ${maxResults} on this instance`,
        field: 'limit',
        requestId: request.id,
      });
    }

    if (!deps.provider?.configured()) {
      // Search is the one capability that cannot be self-hosted without a
      // backend, so say plainly what is missing rather than returning nothing.
      return reply.code(503).send({
        error: 'search_unavailable',
        message:
          'No search backend is configured. Set SEARXNG_URL for a self-hosted SearXNG ' +
          'instance, or SERPER_API_KEY / SERPAPI_KEY for a hosted SERP provider.',
        requestId: request.id,
      });
    }

    const query = [body.query, ...body.categories.map((c) => CATEGORY_OPERATORS[c] ?? '')]
      .filter(Boolean)
      .join(' ');

    const providerQuery = {
      query,
      limit: body.limit,
      sources: body.sources,
      lang: body.lang?.toLowerCase(),
      country: body.country?.toLowerCase(),
      tbs: body.tbs?.toLowerCase(),
      freshness: body.freshness,
      includeDomains: body.includeDomains,
      excludeDomains: body.excludeDomains,
    };

    const warnings: string[] = [];
    let hits = cache.get(providerQuery);
    const fromCache = hits !== undefined;

    if (!hits) {
      try {
        hits = await deps.provider.search(providerQuery);
      } catch (error) {
        return reply.code(502).send({
          error: 'search_failed',
          message: error instanceof Error ? error.message : 'The search backend failed.',
          requestId: request.id,
        });
      }
      cache.set(providerQuery, hits);
    }

    if (hits.length === 0) {
      warnings.push('The search backend returned no results for this query.');
    }

    const scrapeOptions = body.scrapeOptions ?? body.scrape;
    const grouped = groupBySource(hits);

    if (!scrapeOptions) {
      return reply.send({
        success: true,
        data: mapSources(grouped),
        warnings,
        metadata: { backend: deps.provider.name, fromCache },
      });
    }

    const data: Partial<Record<SearchSource, SearchResultItem[]>> = {};

    for (const [source, sourceHits] of Object.entries(grouped) as [SearchSource, SearchHit[]][]) {
      if (source === 'images') {
        // Image results carry no page to read, so scraping them is pure waste.
        data[source] = sourceHits.map(baseItem);
        continue;
      }

      data[source] = await mapWithLimit(sourceHits, scrapeConcurrency, async (hit) => {
        const item = await readResult(hit, scrapeOptions, deps, request.log);
        if (item.failure) {
          warnings.push(`${hit.url}: ${item.failure.reason}${item.failure.detail ? ` (${item.failure.detail})` : ''}`);
        }
        return item;
      });
    }

    return reply.send({
      success: true,
      data,
      warnings,
      metadata: { backend: deps.provider.name, fromCache },
    });
  });
}

function groupBySource(hits: SearchHit[]): Partial<Record<SearchSource, SearchHit[]>> {
  const grouped: Partial<Record<SearchSource, SearchHit[]>> = {};
  for (const hit of hits) {
    (grouped[hit.source] ??= []).push(hit);
  }
  // `web` is always present so callers can index `data.web` without a guard.
  grouped.web ??= [];
  return grouped;
}

function mapSources(
  grouped: Partial<Record<SearchSource, SearchHit[]>>,
): Partial<Record<SearchSource, SearchResultItem[]>> {
  const out: Partial<Record<SearchSource, SearchResultItem[]>> = {};
  for (const [source, sourceHits] of Object.entries(grouped) as [SearchSource, SearchHit[]][]) {
    out[source] = sourceHits.map(baseItem);
  }
  return out;
}

async function readResult(
  hit: SearchHit,
  options: ScrapeOptions,
  deps: SearchRouteDeps,
  logger: FastifyInstance['log'],
): Promise<SearchResultItem> {
  const item = baseItem(hit);

  try {
    const result = await runPipeline(
      {
        url: hit.url,
        formats: options.formats,
        tier: options.tier,
        onlyMainContent: options.onlyMainContent,
        includeSelectors: options.includeSelectors,
        excludeSelectors: options.excludeSelectors,
        extractor: options.extractor,
        waitFor: options.waitFor,
        timeout: options.timeout,
        headers: options.headers,
        profile: options.profile,
      },
      {
        fetchClient: deps.fetchClient,
        extractClient: deps.extractClient,
        browserPool: deps.browserPool,
        logger,
      },
    );

    if (!result.success) {
      // One unreachable result must not fail the whole search. The failure
      // travels with its own row so the caller can see which.
      return {
        ...item,
        failure: {
          reason: result.reason,
          detail: result.detail,
          statusCode: result.statusCode,
          detectedBy: result.detectedBy,
          tier: result.tier,
          tiersAttempted: result.tiersAttempted,
        },
      };
    }

    const { content } = result;
    const formats = options.formats;

    return {
      ...item,
      markdown: formats.includes('markdown') ? content.markdown : undefined,
      text: formats.includes('text') ? content.text : undefined,
      rawHtml: formats.includes('rawHtml') ? content.rawHtml : undefined,
      links: formats.includes('links') ? content.links : undefined,
      screenshot: formats.includes('screenshot') ? content.screenshot : undefined,
      metadata: {
        title: content.title,
        language: content.language,
        sourceUrl: hit.url,
        finalUrl: result.finalUrl ?? hit.url,
        statusCode: result.statusCode,
        fetchedAt: new Date().toISOString(),
        contentHash: content.contentHash,
        tier: result.tier,
        tiersAttempted: result.tiersAttempted,
        profile: result.profileUsed,
        extractor: content.extractorUsed,
        timingMs: result.timingMs,
      },
    };
  } catch (error) {
    return {
      ...item,
      failure: {
        reason: 'http_error',
        detail: error instanceof Error ? error.message : 'scrape failed',
        detectedBy: [],
        tiersAttempted: [],
      },
    };
  }
}
