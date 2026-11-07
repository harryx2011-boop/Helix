
export type Format = 'markdown' | 'html' | 'rawHtml' | 'text' | 'links' | 'screenshot' | 'json' | 'chunks';

/** A tier a request asks for: the v3 ladder is plain, tls, browser (openapi.yaml `Tier`). */
export type Tier = 'auto' | 'plain' | 'tls' | 'browser';

/** A tier a result reports. Results stored before v3 can name the retired rungs. */
export type ResultTier = Exclude<Tier, 'auto'> | 'lightpanda' | 'chromium' | 'camoufox';

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
  | 'service_unavailable';

export interface ProxyConfig {
  url: string;
  sessionId?: string;
  geo?: string;
}

export type ExtractProvider = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'gemini' | 'ollama' | 'vllm' | 'openai-compatible';

export interface ExtractConfig {
  schema?: Record<string, unknown>;
  prompt?: string;
  provider?: ExtractProvider;
  model?: string;
  includeSources?: boolean;
}

export type ProxyOption = 'auto' | 'stealth' | 'none' | ProxyConfig;

export interface ChunkConfig {
  strategy?: 'semantic' | 'heading' | 'fixed';
  maxTokens?: number;
  overlap?: number;
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
  mobile?: boolean;
  headers?: Record<string, string>;
  profile?: string;
  proxy?: ProxyOption;
  extract?: ExtractConfig;
  jsonOptions?: ExtractConfig;
  chunk?: ChunkConfig;
}

export interface ScrapeRequest extends ScrapeOptions {
  url: string;
}


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


export type SearchFormat = 'markdown' | 'text' | 'rawHtml' | 'links' | 'screenshot';

export interface SearchScrapeOptions {
  formats?: SearchFormat[];
  tier?: Tier;
  onlyMainContent?: boolean;
  includeSelectors?: string[];
  excludeSelectors?: string[];
  extractor?: Extractor;
  waitFor?: number;
  timeout?: number;
  headers?: Record<string, string>;
  profile?: string;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  lang?: string;
  country?: string;
  tbs?: string;
  freshness?: string;
  sources?: ('web' | 'news' | 'images')[];
  categories?: ('github' | 'research' | 'pdf' | 'docs')[];
  includeDomains?: string[];
  excludeDomains?: string[];
  scrapeOptions?: SearchScrapeOptions;
}

export interface SearchResultItem extends Document {
  url: string;
  title: string;
  description?: string;
  position: number;
  publishedAt?: string;
  imageUrl?: string;
  failure?: FetchFailure;
}

export interface SearchResponse {
  success: boolean;
  data: {
    web: SearchResultItem[];
    news?: SearchResultItem[];
    images?: SearchResultItem[];
  };
  warnings: string[];
  metadata?: {
    backend?: 'searxng' | 'serper' | 'serpapi';
    fromCache?: boolean;
  };
}


export type WebhookEvent = 'started' | 'page' | 'changed' | 'completed' | 'failed';

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  events?: WebhookEvent[];
  metadata?: Record<string, unknown>;
}

export interface CrawlRequest extends ScrapeOptions {
  url: string;
  estimate?: boolean;
  limit?: number;
  maxDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
  allowSubdomains?: boolean;
  allowExternal?: boolean;
  allowExternalLinks?: boolean;
  sitemap?: 'include' | 'skip' | 'only';
  respectRobots?: boolean;
  politeness?: 'adaptive' | 'fixed';
  maxConcurrency?: number;
  delay?: number;
  incremental?: boolean;
  ignoreQueryParameters?: boolean;
  scrapeOptions?: Pick<ScrapeOptions, 'formats' | 'tier' | 'extractor' | 'onlyMainContent'>;
  webhook?: string | WebhookConfig;
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
  jobId?: string;
  url?: string;
}

export interface JobCancelled {
  id: string;
  jobId?: string;
  status: 'cancelled';
}

export type CrawlResponse = Estimate | JobAccepted;

export interface Job {
  id: string;
  jobId?: string;
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


export interface ParseJsonOptions {
  schema?: Record<string, unknown>;
  prompt?: string;
  model?: string;
}

export interface ParseRequest {
  url?: string;
  formats?: ('markdown' | 'json')[];
  ocr?: 'auto' | 'force' | 'off';
  maxPages?: number;
  tables?: 'auto' | 'high-fidelity';
  timeout?: number;
  jsonOptions?: ParseJsonOptions;
}

export interface ParseMetadata {
  filename?: string;
  pageCount: number;
  fileType: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'png' | 'jpg';
  ocrUsed: boolean;
  needsOcr: boolean;
  suspectedGarbledText: boolean;
  parser: string;
  sizeBytes: number;
  contentHash: string;
  sourceUrl?: string;
  fetchedAt: string;
  timingMs: number;
  fromCache: boolean;
}

export interface ParseData {
  markdown?: string;
  json?: Record<string, unknown>;
  usage?: { tokens?: { input?: number; output?: number }; model?: string };
  metadata: ParseMetadata;
}

export interface ParseResponseSuccess {
  success: true;
  data: ParseData;
  warnings?: string[];
}

export interface ParseResponseFailure {
  success: false;
  failure: FetchFailure;
}

export type ParseResponse = ParseResponseSuccess | ParseResponseFailure;


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
  screenshot?: string | null;
  javascriptReturns?: unknown[];
  actionsRun?: number;
  liveViewUrl?: string;
  expiresAt?: string;
  idleExpiresAt?: string;
  usage?: { tokens?: { input?: number; output?: number }; model?: string | null };
  timingMs?: number;
}

export interface InteractFailure extends FetchFailure {
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


export type MonitorGranularity = 'word' | 'line' | 'character';
export type MonitorEvent = 'changed' | 'checked' | 'failed';

export type MonitorSchedule = string | { cron?: string; every?: string; timezone?: string };

export interface MonitorWebhook {
  url: string;
  headers?: Record<string, string>;
  events?: MonitorEvent[];
  metadata?: Record<string, unknown>;
  secret?: string;
}

export interface MonitorTrigger {
  keywordAppears?: string;
  keywordDisappears?: string;
  selector?: string;
  minChangeRatio?: number;
}

export interface MonitorRequest {
  url: string;
  schedule: MonitorSchedule;
  scrapeOptions?: Omit<ScrapeOptions, 'formats' | 'extract'>;
  diff?: { granularity?: MonitorGranularity; inline?: boolean };
  trigger?: MonitorTrigger;
  sensitivity?: 'any' | 'significant';
  webhook?: string | MonitorWebhook;
}

export interface MonitorResponse {
  success: boolean;
  id: string;
  monitorId: string;
  url: string;
  schedule: { cron: string; timezone: string; every?: string };
  sensitivity: 'any' | 'significant';
  diff: { granularity: MonitorGranularity; inline: boolean };
  trigger: MonitorTrigger;
  webhook: { url: string; events: MonitorEvent[]; metadata: Record<string, unknown> | null; headers: string[]; signed: boolean } | null;
  status: 'active' | 'paused' | 'error';
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastChangeAt: string | null;
  lastError: string | null;
  stats: { checks: number; changes: number; pagesUnchanged: number };
}

export interface MonitorListResponse {
  success: boolean;
  monitors: Omit<MonitorResponse, 'success'>[];
}

export interface DocumentImage {
  url: string;
  alt?: string;
}

export interface DocumentMetadata {
  title?: string;
  description?: string;
  language?: string;
  favicon?: string;
  sourceUrl?: string;
  finalUrl?: string;
  statusCode?: number;
  contentType?: string;
  fetchedAt?: string;
  contentHash?: string;
  tier?: ResultTier;
  tiersAttempted?: ResultTier[];
  profile?: string;
  extractor?: string;
  mobile?: boolean;
  timingMs?: number;
  fromCache?: boolean;
}

export interface DocumentChunk {
  text: string;
  anchor: string;
  tokens: number;
  headingPath: string[];
  index: number;
}

export interface Document {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  text?: string;
  summary?: string;
  links?: string[];
  images?: DocumentImage[];
  screenshot?: string | null;
  json?: Record<string, unknown> | null;
  jsonSources?: Record<string, unknown>[];
  chunks?: DocumentChunk[] | null;
  metadata?: DocumentMetadata;
}

export interface ExtractionUsage {
  model: string;
  tokens: { input: number; output: number };
  blocksKept: number;
  blocksTotal: number;
  providerCost: { amount: number | null; currency: string };
}

export interface FetchFailure {
  url?: string;
  reason: FailureReason;
  detail?: string;
  statusCode?: number;
  detectedBy?: string[];
  tier?: ResultTier;
  tiersAttempted?: ResultTier[];
  profile?: string;
  escalationAvailable?: boolean;
}

export interface ScrapeResponseSuccess {
  success: true;
  data: Document;
  warnings: string[];
  usage?: ExtractionUsage;
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


export interface AgentSchemaRequest {
  prompt: string;
  urls?: string[];
  hint?: Record<string, unknown>;
  instruction?: string;
}

export interface AgentSchemaResponseSuccess {
  success: true;
  schema: Record<string, unknown>;
  summary: string;
  usage?: { tokens?: { input?: number; output?: number }; model?: string };
}

export interface AgentSchemaResponseFailure {
  success: false;
  failure: { reason: FailureReason | string; message?: string; detail?: string };
}

export type AgentSchemaResponse = AgentSchemaResponseSuccess | AgentSchemaResponseFailure;


export interface RobotsCheckRequest {
  url: string;
  userAgent?: string;
}

export interface RobotsCheckResponse {
  url: string;
  userAgent: string;
  allowed: boolean;
  crawlDelaySeconds: number | null;
  sitemaps: string[];
}


export type DiffGranularity = 'word' | 'line' | 'character';

export type DiffSide = { text: string } | { url: string };

export interface DiffTextRequest {
  mode: 'text';
  before: DiffSide;
  after: DiffSide;
  granularity?: DiffGranularity;
}

export interface DiffJsonRequest {
  mode: 'json';
  before: unknown;
  after: unknown;
}

export type DiffRequest = DiffTextRequest | DiffJsonRequest;

export interface DiffOp {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface TextDiff {
  granularity: DiffGranularity;
  added: number;
  removed: number;
  changeRatio: number;
  ops: DiffOp[];
  text: string;
  coarse?: true;
  truncated?: true;
}

export interface JsonFieldChange {
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface JsonDiff {
  granularity: 'json';
  fields: JsonFieldChange[];
  changeRatio: number;
}

export interface DiffResponseSuccess {
  success: true;
  diff: TextDiff | JsonDiff;
}

export interface DiffResponseFailure {
  success: false;
  failure: { reason: FailureReason | string; message?: string; detail?: string };
}

export type DiffResponse = DiffResponseSuccess | DiffResponseFailure;


export interface PdfAssessRequest {
  url: string;
  timeout?: number;
}

export interface PdfAssessData {
  pageCount: number;
  charsExtracted: number;
  needsOcr: boolean;
  suspectedGarbledText: boolean;
  reason: string;
  metadata: { filename?: string; sizeBytes?: number; sourceUrl?: string };
}

export interface PdfAssessResponseSuccess {
  success: true;
  data: PdfAssessData;
}

export interface PdfAssessResponseFailure {
  success: false;
  failure: FetchFailure;
}

export type PdfAssessResponse = PdfAssessResponseSuccess | PdfAssessResponseFailure;


export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama' | 'vllm' | 'openai-compatible';

export interface ProviderStatus {
  provider: ProviderName;
  configured: boolean;
  source: 'key' | 'instance' | 'none';
  last4?: string;
  model?: string | null;
  baseUrl?: string | null;
  updatedAt?: string;
  detected?: { baseUrl: string; models: string[] };
}

export interface ListProvidersResponse {
  success: true;
  providers: ProviderStatus[];
}

export interface SaveProviderRequest {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface SaveProviderResponse {
  success: true;
  provider: ProviderName;
  last4?: string;
  model?: string | null;
  baseUrl?: string | null;
  verified?: boolean;
  warning?: string;
}

export interface RemoveProviderResponse {
  success: true;
}

export interface ProviderModel {
  name: string;
  parameterSize?: string;
  quantization?: string;
  sizeBytes?: number;
  capabilities?: string[];
}

export type ListModelsFailureReason = 'invalid_base_url' | 'unreachable' | 'unsupported' | 'bad_response';

export type ListModelsResponse =
  | { success: true; provider: ProviderName; models: ProviderModel[] }
  | { success: false; provider: ProviderName; failure: { reason: ListModelsFailureReason; message: string } };


export type HealthStatus = 'ok' | 'degraded' | 'unhealthy';

export interface HealthService {
  status: HealthStatus;
  detail?: string;
  latencyMs: number;
}

export interface HealthProviders {
  llm: { configured: boolean; model: string };
  embedding: { configured: boolean; model: string };
  proxy: { configured: boolean };
  search: { configured: boolean };
}

export interface HealthResponse {
  status: HealthStatus;
  version: string;
  services: Record<string, HealthService>;
  providers: HealthProviders;
}

export interface DayBucket {
  day: string;
  okPct: number | null;
  p50Ms: number | null;
  samples: number;
}

export interface ServiceHistory {
  service: string;
  days: DayBucket[];
}

export interface StatusHistoryResponse {
  services: ServiceHistory[];
}

export type MetadataFileType = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'png' | 'jpg';

export type MetadataRisk = 'high' | 'medium' | 'low';

export type MetadataCategory =
  | 'location'
  | 'identity'
  | 'device'
  | 'software'
  | 'timestamp'
  | 'content'
  | 'other';

export interface MetadataFinding {
  group: string;
  key: string;
  value: string;
  risk: MetadataRisk;
  category: MetadataCategory;
  removable: boolean;
}

export type MetadataRiskSummary = Record<MetadataRisk, number>;

export interface MetadataRequest {
  url: string;
  timeout?: number;
}

export interface MetadataScanMetadata {
  filename: string | null;
  fileType: MetadataFileType;
  sizeBytes: number;
  contentHash: string;
  sourceUrl?: string;
  scannedAt: string;
  timingMs: number;
}

export interface MetadataScan {
  findings: MetadataFinding[];
  riskSummary: MetadataRiskSummary;
  metadata: MetadataScanMetadata;
}

export interface MetadataResponseSuccess {
  success: true;
  data: MetadataScan;
  warnings?: string[];
}

export interface MetadataResponseFailure {
  success: false;
  failure: FetchFailure;
  warnings?: string[];
}

export type MetadataResponse = MetadataResponseSuccess | MetadataResponseFailure;

export interface MetadataScrubReport {
  removed: MetadataFinding[];
  retained: MetadataFinding[];
  riskSummary: MetadataRiskSummary;
  metadata: {
    filename: string | null;
    fileType: MetadataFileType;
    bytesBefore: number;
    bytesAfter: number;
    sourceUrl?: string;
    scrubbedAt: string;
    timingMs: number;
  };
  warnings?: string[];
}

export interface MetadataScrubSuccess {
  success: true;
  blob: Blob;
  filename: string;
  report: MetadataScrubReport;
}

export type MetadataScrubResponse = MetadataScrubSuccess | MetadataResponseFailure;

export type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

export interface ScreenshotRequest {
  url: string;
  fullPage?: boolean;
  selector?: string;
  clip?: { x: number; y: number; width: number; height: number };
  format?: ScreenshotFormat;
  quality?: number;
  omitBackground?: boolean;
  viewport?: { width: number; height: number; dpr?: number };
  darkMode?: boolean;
  blockAds?: boolean;
  mobile?: boolean;
  tier?: 'auto' | 'chromium' | 'camoufox';
  waitFor?: number;
  timeout?: number;
}

export interface ScreenshotSuccess {
  success: true;
  data: {
    screenshot: string | null;
    format: ScreenshotFormat;
    bytes: number | null;
    metadata: Record<string, unknown>;
  };
  warnings: string[];
}

export type ScreenshotResponse = ScreenshotSuccess | { success: false; failure: FetchFailure };

export interface ExtractRequest {
  urls: string[];
  schema?: Record<string, unknown>;
  prompt?: string;
  instruction?: string;
  allowUngrounded?: boolean;
  tier?: Tier | 'camoufox';
  timeout?: number;
}

export interface DroppedField {
  url: string;
  field: string;
  reason: string;
}

export interface ExtractRow {
  _source: {
    url: string;
    spans: Record<string, unknown>[];
    blocksKept: number;
    blocksTotal: number;
  };
  [field: string]: unknown;
}

export interface ExtractResponse {
  success: true;
  data: ExtractRow[];
  dropped: DroppedField[];
  warnings: string[];
  usage: {
    urls: number;
    rows: number;
    model: string | null;
    tokens: { input: number; output: number };
    blocksKept: number;
    blocksTotal: number;
    providerCost: { amount: number | null; currency: string };
  };
}

export type DocumentOp = 'parse' | 'metadata' | 'scrub' | 'assess';

export type DocumentRequest = { op: DocumentOp } & Record<string, unknown>;

export type DocumentResponse = Record<string, unknown>;

export interface HelixClientOptions {
  baseUrl?: string;
  apiKey: string;
}

const DEV_PORT = '3400';
const API_URL = process.env['NEXT_PUBLIC_HELIX_API_URL'];

export function resolveBaseUrl(explicit?: string): string {
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

  async screenshot(request: ScreenshotRequest, signal?: AbortSignal): Promise<ScreenshotResponse> {
    return this.post<ScreenshotResponse>('/screenshot', request, signal);
  }

  async extract(request: ExtractRequest, signal?: AbortSignal): Promise<ExtractResponse> {
    return this.post<ExtractResponse>('/extract', request, signal);
  }

  async document(request: DocumentRequest, signal?: AbortSignal): Promise<DocumentResponse> {
    return this.post<DocumentResponse>('/document', request, signal);
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

  async crawlJob(id: string, signal?: AbortSignal): Promise<Job> {
    return this.get<Job>(`/crawl/${id}`, signal);
  }

  async cancelCrawl(id: string, signal?: AbortSignal): Promise<JobCancelled> {
    return this.delete<JobCancelled>(`/crawl/${id}`, signal);
  }

  async parse(request: ParseRequest | FormData, signal?: AbortSignal): Promise<ParseResponse> {
    return this.post<ParseResponse>('/parse', request, signal);
  }

  async metadataScan(request: MetadataRequest | FormData, signal?: AbortSignal): Promise<MetadataResponse> {
    return this.post<MetadataResponse>('/metadata', request, signal);
  }

  async metadataScrub(request: MetadataRequest | FormData, signal?: AbortSignal): Promise<MetadataScrubResponse> {
    const isFormData = typeof FormData !== 'undefined' && request instanceof FormData;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/metadata/scrub`, {
        method: 'POST',
        headers: isFormData
          ? { Authorization: `Bearer ${this.apiKey}` }
          : { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: isFormData ? (request as FormData) : JSON.stringify(request),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      throw new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
      throw new HelixApiError(
        errorBody?.message ?? `Request failed with status ${response.status}`,
        response.status,
        errorBody,
      );
    }

    if (response.headers.get('content-type')?.includes('application/json')) {
      return (await response.json()) as MetadataResponseFailure;
    }

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

    return {
      success: true,
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get('content-disposition')) ?? 'file.scrubbed',
      report,
    };
  }

  async interact(request: InteractRequest, signal?: AbortSignal): Promise<InteractResponse> {
    return this.post<InteractResponse>('/interact', request, signal);
  }

  async monitor(request: MonitorRequest, signal?: AbortSignal): Promise<MonitorResponse> {
    return this.post<MonitorResponse>('/monitor', request, signal);
  }

  async listMonitors(signal?: AbortSignal): Promise<MonitorListResponse> {
    return this.get<MonitorListResponse>('/monitor', signal);
  }

  async agentSchema(request: AgentSchemaRequest, signal?: AbortSignal): Promise<AgentSchemaResponse> {
    return this.post<AgentSchemaResponse>('/agent/schema', request, signal);
  }

  async robotsCheck(request: RobotsCheckRequest, signal?: AbortSignal): Promise<RobotsCheckResponse> {
    return this.post<RobotsCheckResponse>('/robots-check', request, signal);
  }

  async diff(request: DiffRequest, signal?: AbortSignal): Promise<DiffResponse> {
    return this.post<DiffResponse>('/diff', request, signal);
  }

  async pdfAssess(request: PdfAssessRequest | FormData, signal?: AbortSignal): Promise<PdfAssessResponse> {
    return this.post<PdfAssessResponse>('/pdf-assess', request, signal);
  }

  async listProviders(signal?: AbortSignal): Promise<ListProvidersResponse> {
    return this.get<ListProvidersResponse>('/providers', signal);
  }

  async saveProvider(provider: ProviderName, request: SaveProviderRequest, signal?: AbortSignal): Promise<SaveProviderResponse> {
    return this.put<SaveProviderResponse>(`/providers/${provider}`, request, signal);
  }

  async removeProvider(provider: ProviderName, signal?: AbortSignal): Promise<RemoveProviderResponse> {
    return this.delete<RemoveProviderResponse>(`/providers/${provider}`, signal);
  }

  async listProviderModels(provider: ProviderName, signal?: AbortSignal): Promise<ListModelsResponse> {
    return this.get<ListModelsResponse>(`/providers/${provider}/models`, signal);
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

  private async put<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
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

  private async delete<T>(path: string, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'DELETE',
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

export async function fetchHealth(baseUrl: string = resolveBaseUrl(), signal?: AbortSignal): Promise<HealthResponse> {
  const response = await openGet(`${baseUrl}/health`, signal);
  if (!response.ok && response.status !== 503) throw await toApiError(response);
  return response.json() as Promise<HealthResponse>;
}

export async function fetchStatusHistory(
  baseUrl: string = resolveBaseUrl(),
  days = 90,
  signal?: AbortSignal,
): Promise<StatusHistoryResponse> {
  const response = await openGet(`${baseUrl}/status/history?days=${days}`, signal);
  if (!response.ok) throw await toApiError(response);
  return response.json() as Promise<StatusHistoryResponse>;
}

async function openGet(url: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { cache: 'no-store', ...(signal ? { signal } : {}) });
  } catch (error) {
    throw new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
  }
}

async function toApiError(response: Response): Promise<HelixApiError> {
  const errorBody = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
  return new HelixApiError(errorBody?.message ?? `Request failed with status ${response.status}`, response.status, errorBody);
}

function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  return /filename="?([^";]+)"?/.exec(header)?.[1]?.trim() || undefined;
}
