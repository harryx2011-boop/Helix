import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline } from '../core/pipeline.js';
import type { SearchProvider } from '../search/providers.js';
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

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).default(10),
  sources: z.array(z.enum(['web', 'news', 'images'])).default(['web']),
  categories: z.array(z.enum(['github', 'research', 'pdf', 'docs'])).default([]),
  includeDomains: z.array(z.string()).default([]),
  excludeDomains: z.array(z.string()).default([]),
  freshness: z.string().optional(),
  country: z.string().length(2).optional(),
  scrape: z
    .object({
      formats: z.array(z.string()).default(['markdown']),
      tier: z.enum(['auto', 'plain', 'tls', 'lightpanda', 'chromium']).default('auto'),
      onlyMainContent: z.boolean().default(true),
      extractor: z.enum(['trafilatura', 'readability', 'auto']).default('trafilatura'),
      timeout: z.number().int().min(1000).max(120_000).default(20_000),
    })
    .optional(),
});

export interface SearchRouteDeps {
  provider: SearchProvider | undefined;
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool | undefined;
}

/** Category shorthands, expanded into search operators. */
const CATEGORY_OPERATORS: Record<string, string> = {
  github: 'site:github.com',
  research: '(site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR filetype:pdf)',
  pdf: 'filetype:pdf',
  docs: '(inurl:docs OR inurl:documentation)',
};

export async function registerSearch(
  app: FastifyInstance,
  deps: SearchRouteDeps,
): Promise<void> {
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

    if (!deps.provider?.configured()) {
      // Search is the one capability that cannot be self-hosted, so say plainly
      // what is missing rather than returning an empty result set.
      return reply.code(503).send({
        error: 'search_unavailable',
        message:
          'No search provider is configured. Set SERPER_API_KEY (or SERPAPI_KEY) ' +
          'and HELIX_SEARCH_PROVIDER.',
        requestId: request.id,
      });
    }

    const body = parsed.data;

    const query = [body.query, ...body.categories.map((c) => CATEGORY_OPERATORS[c] ?? '')]
      .filter(Boolean)
      .join(' ');

    let hits;
    try {
      hits = await deps.provider.search({
        query,
        limit: body.limit,
        sources: body.sources,
        country: body.country,
        freshness: body.freshness,
        includeDomains: body.includeDomains,
        excludeDomains: body.excludeDomains,
      });
    } catch (error) {
      return reply.code(502).send({
        error: 'search_failed',
        message: error instanceof Error ? error.message : 'The search provider failed.',
        requestId: request.id,
      });
    }

    if (!body.scrape) {
      return reply.send({
        success: true,
        results: hits.map((hit) => ({
          title: hit.title,
          url: hit.url,
          snippet: hit.snippet,
          position: hit.position,
          source: hit.source,
          publishedAt: hit.publishedAt,
          imageUrl: hit.imageUrl,
        })),
      });
    }

    const scrapeOptions = body.scrape;

    // Image results carry no page to read, so scraping them is pure waste.
    const scrapable = hits.filter((hit) => hit.source !== 'images');

    const scraped = await Promise.all(
      scrapable.map(async (hit) => {
        try {
          const result = await runPipeline(
            {
              url: hit.url,
              formats: scrapeOptions.formats,
              tier: scrapeOptions.tier,
              onlyMainContent: scrapeOptions.onlyMainContent,
              extractor: scrapeOptions.extractor,
              timeout: scrapeOptions.timeout,
            },
            {
              fetchClient: deps.fetchClient,
              extractClient: deps.extractClient,
              browserPool: deps.browserPool,
              logger: request.log,
            },
          );

          if (!result.success) {
            // One unreachable result must not fail the whole search. The
            // failure travels with its own row so the caller can see which.
            return {
              title: hit.title,
              url: hit.url,
              snippet: hit.snippet,
              position: hit.position,
              source: hit.source,
              publishedAt: hit.publishedAt,
              failure: {
                reason: result.reason,
                detail: result.detail,
                detectedBy: result.detectedBy,
                tiersAttempted: result.tiersAttempted,
              },
            };
          }

          return {
            title: hit.title,
            url: hit.url,
            snippet: hit.snippet,
            position: hit.position,
            source: hit.source,
            publishedAt: hit.publishedAt,
            markdown: result.content.markdown,
            text: scrapeOptions.formats.includes('text') ? result.content.text : undefined,
            links: scrapeOptions.formats.includes('links') ? result.content.links : undefined,
            metadata: {
              title: result.content.title,
              language: result.content.language,
              statusCode: result.statusCode,
              tier: result.tier,
              contentHash: result.content.contentHash,
            },
          };
        } catch (error) {
          return {
            title: hit.title,
            url: hit.url,
            snippet: hit.snippet,
            position: hit.position,
            source: hit.source,
            failure: {
              reason: 'http_error' as const,
              detail: error instanceof Error ? error.message : 'scrape failed',
              detectedBy: [] as string[],
              tiersAttempted: [] as string[],
            },
          };
        }
      }),
    );

    const images = hits
      .filter((hit) => hit.source === 'images')
      .map((hit) => ({
        title: hit.title,
        url: hit.url,
        imageUrl: hit.imageUrl,
        position: hit.position,
        source: hit.source,
      }));

    return reply.send({ success: true, results: [...scraped, ...images] });
  });
}
