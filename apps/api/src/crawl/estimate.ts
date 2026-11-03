import { discoverUrls, type MapRouteDeps } from '../routes/map.js';
import type { CrawlJobRequest } from './worker.js';

export interface EstimateDeps extends MapRouteDeps {
  defaultModel: string;
}

const TIER_SECONDS: Record<string, number> = {
  plain: 0.3,
  tls: 0.4,
  lightpanda: 0.6,
  chromium: 3.0,
  camoufox: 4.0,
};

const CHARS_PER_TOKEN = 4;
const AVERAGE_PAGE_CHARS = 6_000;

export async function estimateCrawl(body: CrawlJobRequest, deps: EstimateDeps): Promise<Record<string, unknown>> {
    const { links, truncated } = await discoverUrls(
      body.url,
      {
        sitemap: body.sitemap,
        limit: body.limit,
        ignoreQueryParameters: body.ignoreQueryParameters,
      },
      deps,
    );

    const pages = Math.min(links.length, body.limit);

    const assumedTier = body.tier === 'auto' ? 'tls' : body.tier;
    const perPageSeconds = TIER_SECONDS[assumedTier] ?? 0.5;

    const concurrency = body.maxConcurrency ?? 4;
    const estimatedSeconds = Math.ceil((pages * perPageSeconds) / concurrency);

    const needsModel = body.formats.includes('json');
    const inputTokens = needsModel
      ? Math.ceil((pages * AVERAGE_PAGE_CHARS) / CHARS_PER_TOKEN)
      : 0;

    const assumptions = [
      `${pages} pages discovered${truncated ? ' (truncated at the limit)' : ''}`,
      `assumes the ${assumedTier} tier; pages needing a browser cost more`,
      `assumes ${concurrency} concurrent requests`,
    ];

    if (needsModel) {
      assumptions.push(
        `assumes ~${AVERAGE_PAGE_CHARS} characters per page for token estimates`,
        'tokens are billed by your provider, not by Helix',
      );
    }

    return {
      pages,
      pagesFromCache: 0,
      tierBreakdown: { [assumedTier]: pages },
      estimatedSeconds,
      estimatedTokens: { input: inputTokens, output: needsModel ? pages * 200 : 0 },
      estimatedProviderCost: needsModel
        ? { amount: null, currency: 'USD', model: deps.defaultModel }
        : { amount: 0, currency: 'USD', model: 'none' },
      assumptions,
    };
}
