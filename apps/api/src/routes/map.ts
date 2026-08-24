import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RobotsCache } from '../crawl/robots.js';
import { SitemapFetcher } from '../crawl/sitemap.js';
import { normaliseUrl } from '../crawl/url.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';

/**
 * URL discovery, without reading the pages.
 *
 * Sitemap first, falling back to link discovery from the seed page. Cheap and
 * fast — and the basis of the cost estimator, since knowing how many pages exist
 * is what makes a projection possible before committing to a crawl.
 */

const MapRequestSchema = z.object({
  url: z.string().url(),
  search: z.string().optional(),
  sitemap: z.enum(['include', 'skip', 'only']).default('include'),
  includeSubdomains: z.boolean().default(false),
  ignoreQueryParameters: z.boolean().default(true),
  limit: z.number().int().min(1).max(100_000).default(5000),
});

export interface MapRouteDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  userAgent: string;
}

export interface DiscoveredLink {
  url: string;
  title?: string | undefined;
  description?: string | undefined;
  source: 'sitemap' | 'links' | 'both';
  lastModified?: string | undefined;
}

export async function discoverUrls(
  seedUrl: string,
  options: {
    sitemap: 'include' | 'skip' | 'only';
    limit: number;
    ignoreQueryParameters: boolean;
    search?: string | undefined;
  },
  deps: MapRouteDeps,
): Promise<{ links: DiscoveredLink[]; truncated: boolean }> {
  const origin = new URL(seedUrl).origin;
  const found = new Map<string, DiscoveredLink>();

  const record = (url: string, source: 'sitemap' | 'links', extra: Partial<DiscoveredLink> = {}) => {
    const normalised = normaliseUrl(url, { ignoreQuery: options.ignoreQueryParameters });
    if (!normalised) return;

    const existing = found.get(normalised);
    if (existing) {
      // A URL in both the sitemap and the page's links is better evidence than
      // either alone, so the source records that rather than overwriting.
      if (existing.source !== source) existing.source = 'both';
      return;
    }

    found.set(normalised, { url: normalised, source, ...extra });
  };

  if (options.sitemap !== 'skip') {
    const robots = new RobotsCache(deps.userAgent);
    const rules = await robots.forUrl(seedUrl);

    const sitemaps = new SitemapFetcher(deps.userAgent);
    const entries = await sitemaps.discover(origin, rules.sitemaps(), options.limit);

    for (const entry of entries) {
      record(entry.url, 'sitemap', { lastModified: entry.lastModified });
    }
  }

  // Sitemaps are frequently incomplete, so unless the caller asked for sitemap
  // data only, the seed page's own links are worth collecting too.
  if (options.sitemap !== 'only' && found.size < options.limit) {
    const response = await deps.fetchClient.fetch({ url: seedUrl, impersonate: true });

    if (response.body) {
      try {
        const extracted = await deps.extractClient.extract({
          html: response.body,
          url: seedUrl,
          onlyMainContent: false,
        });
        for (const link of extracted.links) record(link, 'links');
      } catch {
        // Link discovery failing is not fatal when a sitemap already answered.
      }
    }
  }

  let links = [...found.values()];

  if (options.search) {
    const needle = options.search.toLowerCase();
    links = links.filter(
      (link) =>
        link.url.toLowerCase().includes(needle) ||
        link.title?.toLowerCase().includes(needle) ||
        link.description?.toLowerCase().includes(needle),
    );
  }

  const truncated = links.length > options.limit;
  return { links: links.slice(0, options.limit), truncated };
}

export async function registerMap(app: FastifyInstance, deps: MapRouteDeps): Promise<void> {
  app.post('/map', async (request, reply) => {
    const parsed = MapRequestSchema.safeParse(request.body);

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

    const { links, truncated } = await discoverUrls(
      body.url,
      {
        sitemap: body.sitemap,
        limit: body.limit,
        ignoreQueryParameters: body.ignoreQueryParameters,
        search: body.search,
      },
      deps,
    );

    return reply.send({ success: true, links, truncated });
  });
}
