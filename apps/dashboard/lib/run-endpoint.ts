'use client';

import { HelixClient, HelixApiError } from '@/lib/api';
import type {
  ConvertRequest,
  DocumentRequest,
  DocumentResponse,
  ExtractRequest,
  ExtractResponse,
  ScreenshotRequest,
  ScreenshotResponse,
  ConvertResponse,
  CrawlRequest,
  CrawlResponse,
  InteractRequest,
  InteractResponse,
  MapRequest,
  MapResponse,
  MetadataRequest,
  MetadataResponse,
  MetadataScrubReport,
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
import { HOSTED } from '@/lib/mode';

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
 * Self-host: the browser calls the operator's own instance directly with the
 * key from `useApiKey()`, as it always has. Hosted mounts no ApiKeyProvider —
 * the signed-in user has not minted a key — so this instead posts to the
 * `/api/app/run` proxy, which resolves that user's own key server-side and
 * forwards the call. `apiKey` is unused on that path; kept as a parameter so
 * every caller of `runEndpoint` works unmodified in both modes.
 */
export async function runEndpoint<T>(
  endpoint: Endpoint,
  body: Record<string, unknown> | FormData,
  apiKey: string | null,
  mode: EndpointMode = 'scan',
): Promise<RunResult<T>> {
  if (HOSTED) return runViaProxy<T>(endpoint, body, mode);
  if (!apiKey) {
    throw new HelixApiError('No API key configured.', 401);
  }
  const client = new HelixClient({ apiKey });
  const json = await callInstance(client, endpoint, body, mode);
  return { ok: true, status: 200, body: json as T };
}

async function runViaProxy<T>(endpoint: Endpoint, body: Record<string, unknown> | FormData, mode: EndpointMode): Promise<RunResult<T>> {
  const isFormData = body instanceof FormData;
  const params = new URLSearchParams({ endpoint, mode });
  const response = await fetch(`/api/app/run?${params.toString()}`, {
    method: 'POST',
    ...(isFormData
      ? { body }
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });

  // The metadata scrub and convert responses are a file (scrub with its report
  // in a header), not JSON — everything else is a typed envelope the caller
  // asserts a shape onto.
  if (endpoint === 'metadata' && mode === 'scrub' && response.ok) {
    return { ok: true, status: response.status, body: (await scrubResultFromResponse(response)) as unknown as T };
  }
  if (endpoint === 'convert' && response.ok) {
    return { ok: true, status: response.status, body: (await convertResultFromResponse(response)) as unknown as T };
  }

  const json = (await response.json().catch(() => null)) as (T & { message?: string; error?: string }) | null;
  if (!response.ok) {
    throw new HelixApiError(json?.message ?? `Request failed with status ${response.status}`, response.status);
  }
  return { ok: true, status: response.status, body: json as T };
}

/** Rebuilds the same `ConvertSuccess` shape `HelixClient.convert` returns, from the proxied response. */
async function convertResultFromResponse(response: Response): Promise<ConvertResponse> {
  if (response.headers.get('content-type')?.includes('application/json')) {
    return (await response.json()) as ConvertResponse;
  }
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const pages = Number(response.headers.get('x-helix-convert-pages') ?? '1');
  const pageConvertedHeader = response.headers.get('x-helix-convert-page');
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(response.headers.get('content-disposition') ?? '');
  const plain = /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '');
  const filename = star?.[1] ? decodeURIComponent(star[1]) : plain?.[1]?.trim() || 'converted';
  return {
    success: true,
    blob: await response.blob(),
    filename,
    contentType,
    pages: Number.isFinite(pages) ? pages : 1,
    ...(pageConvertedHeader ? { pageConverted: Number(pageConvertedHeader) } : {}),
  };
}

/** Rebuilds the same `MetadataScrubSuccess` shape `HelixClient.metadataScrub` returns, from the proxied response. */
async function scrubResultFromResponse(response: Response): Promise<MetadataScrubResponse> {
  const header = response.headers.get('x-helix-metadata-report');
  if (!header) {
    throw new HelixApiError('The scrub returned a file without its metadata report.', 502);
  }
  let report: MetadataScrubReport;
  try {
    report = JSON.parse(header) as MetadataScrubReport;
  } catch {
    throw new HelixApiError('The scrub returned a metadata report that was not valid JSON.', 502);
  }
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(response.headers.get('content-disposition') ?? '');
  const plain = /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '');
  const filename = star?.[1] ? decodeURIComponent(star[1]) : plain?.[1]?.trim() || 'file.scrubbed';
  return { success: true, blob: await response.blob(), filename, report };
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
  | ConvertResponse
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
    case 'convert':
      return client.convert(body as ConvertRequest | FormData);
    case 'document':
      // The dispatcher forwards by `op`, which the form puts in the body. An
      // upload goes to the operation's own route instead: `/document` would
      // have to name the op in the query string, and the file tabs already
      // call `/parse` and `/metadata` directly.
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
