'use client';

import { HelixClient, HelixApiError } from '@/lib/api';
import type {
  CrawlRequest,
  CrawlResponse,
  InteractRequest,
  InteractResponse,
  MapRequest,
  MapResponse,
  MonitorRequest,
  MonitorResponse,
  ParseRequest,
  ParseResponse,
  ScrapeRequest,
  ScrapeResponse,
  SearchRequest,
  SearchResponse,
} from '@/lib/api';
import type { Endpoint } from '@/lib/supabase/types';

const HOSTED = process.env.NEXT_PUBLIC_HELIX_HOSTED === '1';

export interface RunResult<T> {
  ok: boolean;
  status: number;
  body: T;
}

/**
 * One call path for every playground form. Hosted mode posts to our own proxy
 * (which attaches the server-held key and writes a `runs` row); self-host mode
 * calls the local API directly with the key from `useApiKey()` (WEBSITE.md §8).
 */
export async function runEndpoint<T>(
  endpoint: Endpoint,
  body: Record<string, unknown> | FormData,
  apiKey: string | null,
): Promise<RunResult<T>> {
  if (HOSTED) {
    const response = await fetch(`/api/app/playground/${endpoint}`, {
      method: 'POST',
      ...(body instanceof FormData
        ? { body }
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const json = (await response.json().catch(() => ({}))) as T;
    return { ok: response.ok, status: response.status, body: json };
  }

  if (!apiKey) {
    throw new HelixApiError('No API key configured.', 401);
  }
  const client = new HelixClient({ apiKey });
  const json = await callSelfHost(client, endpoint, body);
  return { ok: true, status: 200, body: json as T };
}

// Each branch returns a different response shape; the caller asserts the union member it expects for the endpoint it asked for.
async function callSelfHost(
  client: HelixClient,
  endpoint: Endpoint,
  body: Record<string, unknown> | FormData,
): Promise<ScrapeResponse | MapResponse | SearchResponse | CrawlResponse | ParseResponse | InteractResponse | MonitorResponse> {
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
    case 'interact':
      return client.interact(body as unknown as InteractRequest);
    case 'monitor':
      return client.monitor(body as unknown as MonitorRequest);
  }
}
