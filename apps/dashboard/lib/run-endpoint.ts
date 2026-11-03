'use client';

import { HelixClient, HelixApiError } from '@/lib/api';
import type {
  DocumentRequest,
  DocumentResponse,
  ExtractRequest,
  ExtractResponse,
  ScreenshotRequest,
  ScreenshotResponse,
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
import type { RunnableEndpoint as Endpoint } from '@/lib/endpoints';

export type EndpointMode = 'scan' | 'scrub';

export interface RunResult<T> {
  ok: boolean;
  status: number;
  body: T;
}

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
  | DocumentResponse
  | ExtractResponse
  | ScreenshotResponse
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
    case 'document':
      return client.document(body as unknown as DocumentRequest);
    case 'extract':
      return client.extract(body as unknown as ExtractRequest);
    case 'screenshot':
      return client.screenshot(body as unknown as ScreenshotRequest);
    case 'interact':
      return client.interact(body as unknown as InteractRequest);
    case 'monitor':
      return client.monitor(body as unknown as MonitorRequest);
  }
}
