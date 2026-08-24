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
  | 'unsafe_url'
  | 'session_closed'
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

// --- Action (InteractAction in openapi.yaml; the /interact discriminated union) ---

export type ActionType = 'navigate' | 'click' | 'type' | 'press' | 'scroll' | 'wait' | 'screenshot' | 'executeJavascript' | 'extract';

export interface NavigateAction { type: 'navigate'; url: string }
export interface ClickAction { type: 'click'; selector: string }
export interface TypeAction { type: 'type'; selector: string; text: string }
export interface PressAction { type: 'press'; key: string }
export interface ScrollAction { type: 'scroll'; direction: 'up' | 'down'; amount?: number }
export interface WaitAction { type: 'wait'; milliseconds?: number; selector?: string }
export interface ScreenshotAction { type: 'screenshot'; fullPage?: boolean }
export interface ExecuteJavascriptAction { type: 'executeJavascript'; script: string }
export interface ExtractAction { type: 'extract'; prompt: string; schema?: Record<string, unknown>; model?: string }

export type Action =
  | NavigateAction
  | ClickAction
  | TypeAction
  | PressAction
  | ScrollAction
  | WaitAction
  | ScreenshotAction
  | ExecuteJavascriptAction
  | ExtractAction;

// --- Map ---

export interface MapRequest {
  url: string;
  search?: string;
  sitemap?: 'include' | 'skip' | 'only';
  includeSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
  limit?: number;
}

export interface MapLink {
  url: string;
  title?: string;
  description?: string;
  source?: 'sitemap' | 'links' | 'both';
  lastModified?: string;
}

export interface MapResponse {
  success: boolean;
  links?: MapLink[];
  truncated?: boolean;
}

// --- Search ---

export interface SearchRequest {
  query: string;
  limit?: number;
  sources?: ('web' | 'news' | 'images')[];
  categories?: ('github' | 'research' | 'pdf' | 'docs')[];
  includeDomains?: string[];
  excludeDomains?: string[];
  freshness?: string;
  country?: string;
  scrape?: ScrapeOptions;
}

export interface SearchResultItem extends Document {
  title?: string;
  url?: string;
  snippet?: string;
  position?: number;
  publishedAt?: string;
}

export interface SearchResponse {
  success: boolean;
  results?: SearchResultItem[];
}

// --- Crawl ---

export interface CrawlRequest extends ScrapeOptions {
  url: string;
  estimate?: boolean;
  limit?: number;
  maxDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
  allowSubdomains?: boolean;
  allowExternal?: boolean;
  sitemap?: 'include' | 'skip' | 'only';
  respectRobots?: boolean;
  incremental?: boolean;
}

export interface Estimate {
  pages?: number;
  pagesFromCache?: number;
  tierBreakdown?: Record<string, number>;
  estimatedSeconds?: number;
  estimatedTokens?: { input?: number; output?: number };
  estimatedProviderCost?: { amount?: number; currency?: string; model?: string };
  assumptions?: string[];
}

export interface JobAccepted {
  success: boolean;
  id: string;
  url?: string;
}

export type CrawlResponse = Estimate | JobAccepted;

export interface Job {
  id: string;
  type?: 'crawl' | 'batch_scrape' | 'enrich';
  status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  total?: number;
  completed?: number;
  failed?: number;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  expiresAt?: string;
  next?: string;
  data?: Document[];
  usage?: {
    pagesFetched?: number;
    pagesFromCache?: number;
    pagesUnchanged?: number;
    browserSeconds?: number;
    tokens?: { input?: number; output?: number };
    providerCost?: { amount?: number; currency?: string };
  };
}

// --- Parse ---

export interface ParseJsonOptions {
  schema?: Record<string, unknown>;
  prompt?: string;
  provider?: string;
  model?: string;
}

export interface ParseRequest {
  url?: string;
  formats?: ('markdown' | 'json')[];
  ocr?: 'auto' | 'force' | 'off';
  jsonOptions?: ParseJsonOptions;
}

export interface ParseMetadata {
  filename?: string;
  pageCount?: number;
  fileType?: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'png' | 'jpg';
  ocrUsed?: boolean;
}

export interface ParseData {
  markdown?: string;
  json?: Record<string, unknown>;
  metadata?: ParseMetadata;
}

export interface ParseResponseSuccess {
  success: true;
  data: ParseData;
}

export interface ParseResponseFailure {
  success: false;
  failure: FetchFailure;
}

export type ParseResponse = ParseResponseSuccess | ParseResponseFailure;

// --- Interact ---

export interface InteractRequest {
  url?: string;
  sessionId?: string | null;
  actions: Action[];
  keepSessionOpen?: boolean;
  headers?: Record<string, string>;
  viewport?: { width: number; height: number };
}

export interface InteractResponseSuccess {
  success: true;
  sessionId: string;
  sessionOpen: boolean;
  url?: string;
  output?: string | null;
  data?: Record<string, unknown> | null;
  /** `data:image/png;base64,...` */
  screenshot?: string | null;
  javascriptReturns?: unknown[];
  actionsRun?: number;
  /** Present while the session is open. */
  liveViewUrl?: string;
  expiresAt?: string;
  idleExpiresAt?: string;
  usage?: { tokens?: { input?: number; output?: number }; model?: string | null };
  timingMs?: number;
}

export interface InteractFailure extends FetchFailure {
  /** Index into `actions`; `null` when the initial navigation from `url` failed. */
  actionIndex?: number | null;
  actionType?: ActionType;
}

export interface InteractResponseFailure {
  success: false;
  sessionId?: string;
  sessionOpen?: boolean;
  failure: InteractFailure;
}

export type InteractResponse = InteractResponseSuccess | InteractResponseFailure;

// --- Monitor ---

export interface MonitorRequest {
  url: string;
  schedule: string;
  scrapeOptions?: ScrapeOptions;
  jsonOptions?: ParseJsonOptions;
  sensitivity?: 'any' | 'significant';
  webhook?: string;
}

export interface MonitorResponse {
  success: boolean;
  monitorId?: string;
  status?: 'active' | 'paused' | 'error';
  nextCheckAt?: string;
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

  async map(request: MapRequest, signal?: AbortSignal): Promise<MapResponse> {
    return this.post<MapResponse>('/map', request, signal);
  }

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    return this.post<SearchResponse>('/search', request, signal);
  }

  async crawl(request: CrawlRequest, signal?: AbortSignal): Promise<CrawlResponse> {
    return this.post<CrawlResponse>('/crawl', request, signal);
  }

  async parse(request: ParseRequest | FormData, signal?: AbortSignal): Promise<ParseResponse> {
    return this.post<ParseResponse>('/parse', request, signal);
  }

  async interact(request: InteractRequest, signal?: AbortSignal): Promise<InteractResponse> {
    return this.post<InteractResponse>('/interact', request, signal);
  }

  async monitor(request: MonitorRequest, signal?: AbortSignal): Promise<MonitorResponse> {
    return this.post<MonitorResponse>('/monitor', request, signal);
  }

  async job(id: string, signal?: AbortSignal): Promise<Job> {
    return this.get<Job>(`/jobs/${id}`, signal);
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      throw new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
    }
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
      throw new HelixApiError(errorBody?.message ?? `Request failed with status ${response.status}`, response.status, errorBody);
    }
    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: isFormData
          ? { Authorization: `Bearer ${this.apiKey}` }
          : { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: isFormData ? (body as FormData) : JSON.stringify(body),
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
