'use client';

import { HelixClient, HelixApiError } from '@/lib/api';
import type {
  CrawlRequest,
  CrawlResponse,
  InteractRequest,
  InteractResponse,
  MapRequest,
  MapResponse,
  MetadataRequest,
  MetadataResponse,
  MetadataScrubResponse,
  MonitorRequest,
  MonitorResponse,
  ParseRequest,
  ParseResponse,
  ScrapeRequest,
  ScrapeResponse,
  SearchRequest,
  SearchResponse,
} from '@/lib/api';
import type { Endpoint } from '@/lib/endpoints';

/**
 * Metadata has two operations behind one tab, and the scrub answers with file
 * bytes rather than JSON. The caller names which one it wants; everything else
 * about the call path is unchanged.
 */
export type EndpointMode = 'scan' | 'scrub';

export interface RunResult<T> {
  ok: boolean;
  status: number;
  body: T;
}

/**
 * One call path for every playground form, in both modes: the browser calls
 * the operator's own instance with the key from `useApiKey()`. Nothing is
 * proxied through this app and no run is recorded anywhere but the instance.
 */
export async function runEndpoint<T>(
  endpoint: Endpoint,
  body: Record<string, unknown> | FormData,
  apiKey: string | null,
  mode: EndpointMode = 'scan',
): Promise<RunResult<T>> {
  if (!apiKey) {
    throw new HelixApiError('No API key configured.', 401);
  }
  const client = new HelixClient({ apiKey });
  const json = await callInstance(client, endpoint, body, mode);
  return { ok: true, status: 200, body: json as T };
}

// Each branch returns a different response shape; the caller asserts the union member it expects for the endpoint it asked for.
async function callInstance(
  client: HelixClient,
  endpoint: Endpoint,
  body: Record<string, unknown> | FormData,
  mode: EndpointMode,
): Promise<
  | ScrapeResponse
  | MapResponse
  | SearchResponse
  | CrawlResponse
  | ParseResponse
  | MetadataResponse
  | MetadataScrubResponse
  | InteractResponse
  | MonitorResponse
> {
  switch (endpoint) {
    case 'scrape':
      return client.scrape(body as unknown as ScrapeRequest);
    case 'map':
      return client.map(body as unknown as MapRequest);
    case 'search':
      return client.search(body as unknown as SearchRequest);
    case 'crawl':
      return client.crawl(body as unknown as CrawlRequest);
    case 'parse':
      return client.parse(body as ParseRequest | FormData);
    case 'metadata':
      return mode === 'scrub'
        ? client.metadataScrub(body as MetadataRequest | FormData)
        : client.metadataScan(body as MetadataRequest | FormData);
    case 'interact':
      return client.interact(body as unknown as InteractRequest);
    case 'monitor':
      return client.monitor(body as unknown as MonitorRequest);
  }
}
