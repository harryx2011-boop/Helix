/**
 * Typed Helix API client.
 *
 * Hand-written from openapi.yaml for now — codegen comes later (FRONTEND.md §6).
 * Kept in this one file so it is easy to replace wholesale once the generator
 * lands. Shapes mirror the spec's `components.schemas` names exactly.
 */

export type Format =
  | 'markdown'
  | 'html'
  | 'rawHtml'
  | 'text'
  | 'links'
  | 'images'
  | 'screenshot'
  | 'pdf'
  | 'json'
  | 'chunks'
  | 'summary';

export type Tier = 'auto' | 'plain' | 'tls' | 'lightpanda' | 'chromium';

export type Extractor = 'trafilatura' | 'readability' | 'auto';

export type FailureReason =
  | 'blocked'
  | 'challenge'
  | 'timeout'
  | 'dns'
  | 'tls'
  | 'http_error'
  | 'empty'
  | 'robots_denied'
  | 'unsupported_type'
  // A Helix service was unreachable — our infrastructure, not the target site.
  | 'service_unavailable';

export interface ProxyConfig {
  url: string;
  sessionId?: string;
  geo?: string;
}

export interface ExtractConfig {
  schema?: Record<string, unknown>;
  prompt?: string;
  model?: string;
  includeSources?: boolean;
}

export interface ScrapeOptions {
  formats?: Format[];
  tier?: Tier;
  onlyMainContent?: boolean;
  includeSelectors?: string[];
  excludeSelectors?: string[];
  extractor?: Extractor;
  waitFor?: number;
  timeout?: number;
  headers?: Record<string, string>;
  profile?: string;
  proxy?: ProxyConfig;
  extract?: ExtractConfig;
}

export interface ScrapeRequest extends ScrapeOptions {
  url: string;
}

export interface DocumentImage {
  url: string;
  alt?: string;
}

/**
 * Matches what routes/scrape.ts actually sends, which is a superset of the
 * openapi.yaml `Metadata` schema (adds `extractor`, `timingMs`) — the route
 * is the source of truth over the spec until codegen replaces this file.
 */
export interface DocumentMetadata {
  title?: string;
  description?: string;
  language?: string;
  sourceUrl?: string;
  finalUrl?: string;
  statusCode?: number;
  contentType?: string;
  fetchedAt?: string;
  contentHash?: string;
  tier?: Tier;
  tiersAttempted?: Tier[];
  profile?: string;
  extractor?: string;
  timingMs?: number;
  fromCache?: boolean;
}

export interface Document {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  text?: string;
  summary?: string;
  links?: string[];
  images?: DocumentImage[];
  screenshot?: string;
  json?: Record<string, unknown>;
  metadata?: DocumentMetadata;
}

export interface FetchFailure {
  url?: string;
  reason: FailureReason;
  detail?: string;
  statusCode?: number;
  detectedBy?: string[];
  tier?: Tier;
  tiersAttempted?: Tier[];
  profile?: string;
  escalationAvailable?: boolean;
}

export interface ScrapeResponseSuccess {
  success: true;
  data: Document;
  warnings?: string[];
}

export interface ScrapeResponseFailure {
  success: false;
  failure: FetchFailure;
  warnings?: string[];
}

export type ScrapeResponse = ScrapeResponseSuccess | ScrapeResponseFailure;

export interface ApiErrorBody {
  error: string;
  message: string;
  field?: string;
  requestId?: string;
}

/** Thrown for transport failures and non-2xx responses — never for a typed `ScrapeResponseFailure`, which is a valid 200. */
export class HelixApiError extends Error {
  readonly status: number;
  readonly body?: ApiErrorBody | undefined;

  constructor(message: string, status: number, body?: ApiErrorBody | undefined) {
    super(message);
    this.name = 'HelixApiError';
    this.status = status;
    this.body = body;
  }
}

export interface HelixClientOptions {
  baseUrl?: string;
  apiKey: string;
}

/**
 * Base URL resolution, split-port model:
 *
 *   1. An explicit URL passed to the client always wins.
 *   2. `NEXT_PUBLIC_HELIX_API_URL` — baked at build time, for a deployment where
 *      the API is not on the dashboard's own host (the split-port default).
 *   3. Same-origin `/v1` — for the bundled case where one server serves both.
 *   4. localhost:7400 — the dev fallback when the dashboard runs on 3400 via
 *      `next dev` and the API is the sibling service on 7400.
 *
 * Helix runs FE 3400 / API 7400 by convention. The two are separate origins in
 * dev, which is why the API sets permissive CORS.
 */
const DEV_PORT = '3400';
const API_URL = process.env['NEXT_PUBLIC_HELIX_API_URL'];

function resolveBaseUrl(explicit?: string): string {
  if (explicit) return explicit;
  if (API_URL) return API_URL.replace(/\/$/, '') + '/v1';
  if (typeof window !== 'undefined' && window.location.port !== DEV_PORT) {
    return `${window.location.origin}/v1`;
  }
  return 'http://localhost:7400/v1';
}

export class HelixClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: HelixClientOptions) {
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey;
  }

  async scrape(request: ScrapeRequest, signal?: AbortSignal): Promise<ScrapeResponse> {
    return this.post<ScrapeResponse>('/scrape', request, signal);
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      throw new HelixApiError(
        error instanceof Error ? error.message : 'Network request failed',
        0,
      );
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => undefined) as ApiErrorBody | undefined;
      throw new HelixApiError(
        errorBody?.message ?? `Request failed with status ${response.status}`,
        response.status,
        errorBody,
      );
    }

    return response.json() as Promise<T>;
  }
}
