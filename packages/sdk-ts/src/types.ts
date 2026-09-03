/** Every format /scrape and /crawl serve (openapi.yaml Format). */
export type Format = 'markdown' | 'html' | 'rawHtml' | 'text' | 'links' | 'screenshot' | 'json' | 'chunks';

export type SearchFormat = 'markdown' | 'text' | 'rawHtml' | 'links' | 'screenshot';

export type ParseFormat = 'markdown' | 'json';

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

export type DestinationType = 'qdrant' | 'pgvector';

export interface Destination {
  type: DestinationType;
  collection?: string;
  namespace?: string;
  upsertMode?: 'update-in-place' | 'append';
}

export type ScrapeActionType = 'wait' | 'click' | 'write' | 'press' | 'scroll' | 'screenshot' | 'executeJavascript' | 'scrape';

export interface ScrapeAction {
  type: ScrapeActionType;
  selector?: string;
  milliseconds?: number;
  text?: string;
  key?: string;
  direction?: 'up' | 'down';
  script?: string;
  fullPage?: boolean;
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
  actions?: ScrapeAction[];
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

export interface DocumentImage {
  url: string;
  alt?: string;
}

export interface DocumentChunk {
  text: string;
  anchor: string;
  tokens: number;
  headingPath: string[];
  index: number;
}

export interface DocumentJsonSource {
  text: string;
  index: number;
  score: number;
}

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
  mobile?: boolean;
  timingMs?: number;
  fromCache?: boolean;
  favicon?: string;
  document?: {
    pages?: number;
    needsOcr?: boolean;
    ocrApplied?: boolean;
    suspectedGarbledText?: boolean;
    parser?: string;
  };
}

export interface Document {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  text?: string;
  links?: string[];
  screenshot?: string | null;
  json?: Record<string, unknown> | null;
  jsonSources?: DocumentJsonSource[];
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
  tier?: Tier;
  tiersAttempted?: Tier[];
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
  warnings: string[];
}

export type ScrapeResponse = ScrapeResponseSuccess | ScrapeResponseFailure;

export interface ParseJsonOptions {
  schema?: Record<string, unknown>;
  prompt?: string;
  model?: string;
}

export interface ParseRequest {
  url: string;
  formats?: ParseFormat[];
  ocr?: 'auto' | 'force' | 'off';
  maxPages?: number;
  tables?: 'auto' | 'high-fidelity';
  timeout?: number;
  jsonOptions?: ParseJsonOptions;
}

export interface ParseUpload {
  file: Blob;
  filename?: string;
  formats?: ParseFormat[];
  ocr?: 'auto' | 'force' | 'off';
  maxPages?: number;
  tables?: 'auto' | 'high-fidelity';
  jsonOptions?: ParseJsonOptions;
}

export interface ParseMetadata {
  filename: string | null;
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

export interface ParseDocument {
  markdown?: string;
  json?: Record<string, unknown>;
  usage?: { tokens?: { input?: number; output?: number }; model?: string };
  metadata: ParseMetadata;
}

export interface ParseResponseSuccess {
  success: true;
  data: ParseDocument;
  warnings?: string[];
}

export interface ParseResponseFailure {
  success: false;
  failure: FetchFailure;
  warnings?: string[];
}

export type ParseResponse = ParseResponseSuccess | ParseResponseFailure;

export type MetadataFileType = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'png' | 'jpg';

/** How much a disclosed value gives away. An ordinal band, not a probability. */
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
  /** Where it was read from: `exif`, `gps`, `xmp`, `docinfo`, `core`, `app`, `custom`, `png`, `tracked`. */
  group: string;
  key: string;
  /** A long value is truncated and says so, so a cut value is never read as complete. */
  value: string;
  risk: MetadataRisk;
  category: MetadataCategory;
  /** False where the format cannot drop the entry without corrupting the file. */
  removable: boolean;
}

/** Always carries all three bands, so absent and zero never have to be told apart. */
export type MetadataRiskSummary = Record<MetadataRisk, number>;

export interface MetadataRequest {
  url: string;
  timeout?: number;
}

export interface MetadataUpload {
  file: Blob;
  filename?: string;
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
  /** Sorted worst-first. */
  findings: MetadataFinding[];
  riskSummary: MetadataRiskSummary;
  metadata: MetadataScanMetadata;
}

export interface MetadataResponseSuccess {
  success: true;
  data: MetadataScan;
  /** A container opened but a part could not be read: the report is partial. */
  warnings?: string[];
}

export interface MetadataResponseFailure {
  success: false;
  failure: FetchFailure;
  warnings?: string[];
}

export type MetadataResponse = MetadataResponseSuccess | MetadataResponseFailure;

export interface MetadataScrubReport {
  /** Sorted worst-first. */
  removed: MetadataFinding[];
  /**
   * Detected and NOT removed, each with `removable: false`. Non-empty means the
   * file is not fully clean — check this before treating it as safe to publish.
   */
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

/** A successful scrub: the cleaned bytes, plus what was taken out and what stayed. */
export interface MetadataScrubSuccess {
  success: true;
  /** The cleaned file. */
  data: Blob;
  /** The name the API suggests: `<original>.scrubbed.<ext>`. */
  filename: string;
  report: MetadataScrubReport;
}

export interface MetadataScrubFailure {
  success: false;
  failure: FetchFailure;
  warnings?: string[];
}

export type MetadataScrubResponse = MetadataScrubSuccess | MetadataScrubFailure;

export interface MapRequest {
  url: string;
  search?: string;
  sitemap?: 'include' | 'skip' | 'only';
  includeSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
  limit?: number;
}

export type MapLinkSource = 'sitemap' | 'links' | 'both';

export interface MapLink {
  url: string;
  title?: string;
  description?: string;
  source?: MapLinkSource;
  lastModified?: string;
}

export interface MapResponse {
  success: boolean;
  links?: MapLink[];
  truncated?: boolean;
}

export interface BatchScrapeOptions {
  formats?: Format[];
  tier?: Tier;
  extractor?: Extractor;
  onlyMainContent?: boolean;
}

export interface BatchScrapeRequest {
  urls: string[];
  ignoreInvalidURLs?: boolean;
  scrapeOptions?: BatchScrapeOptions;
  formats?: Format[];
  tier?: Tier;
  extractor?: Extractor;
  onlyMainContent?: boolean;
  maxConcurrency?: number;
  delay?: number;
  webhook?: string | WebhookConfig;
}

export interface BatchAccepted {
  success: boolean;
  id: string;
  jobId: string;
  total?: number;
  invalidURLs?: string[];
  url?: string;
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
  destination?: Destination;
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
  jobId: string;
  url?: string;
}

export interface JobCancelled {
  id: string;
  jobId: string;
  status: 'cancelled';
}

export type CrawlResponse = Estimate | JobAccepted;

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobType = 'crawl' | 'batch_scrape' | 'enrich';

export interface JobUsage {
  pagesFetched?: number;
  pagesFromCache?: number;
  pagesUnchanged?: number;
  browserSeconds?: number;
  tokens?: { input?: number; output?: number };
  providerCost?: { amount?: number; currency?: string };
}

export interface JobDocument extends Document {
  url: string;
}

export interface Job {
  id: string;
  jobId: string;
  type?: JobType;
  status?: JobStatus;
  total?: number;
  completed?: number;
  failed?: number;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  expiresAt?: string;
  error?: string | null;
  next?: string;
  data?: JobDocument[];
  usage?: JobUsage;
}

export interface JobErrorsResponse {
  errors: FetchFailure[];
  robotsBlocked: string[];
}

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

export interface SearchResult extends Document {
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
    web: SearchResult[];
    news?: SearchResult[];
    images?: SearchResult[];
  };
  warnings: string[];
  metadata?: {
    backend?: 'searxng' | 'serper' | 'serpapi';
    fromCache?: boolean;
  };
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
  failure: { reason: 'service_unavailable' | 'timeout'; detail?: string };
}

export type AgentSchemaResponse = AgentSchemaResponseSuccess | AgentSchemaResponseFailure;

export type InteractActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'press'
  | 'scroll'
  | 'wait'
  | 'screenshot'
  | 'executeJavascript'
  | 'extract';

export interface InteractAction {
  type: InteractActionType;
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  direction?: 'up' | 'down';
  amount?: number;
  milliseconds?: number;
  fullPage?: boolean;
  script?: string;
  prompt?: string;
  schema?: Record<string, unknown>;
  model?: string;
}

export interface InteractRequest {
  url?: string;
  sessionId?: string | null;
  actions: InteractAction[];
  keepSessionOpen?: boolean;
  headers?: Record<string, string>;
  viewport?: { width: number; height: number };
}

export interface InteractFailure extends FetchFailure {
  actionIndex?: number | null;
  actionType?: InteractActionType;
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

export interface InteractResponseFailure {
  success: false;
  sessionId: string;
  sessionOpen: boolean;
  failure: InteractFailure;
}

export type InteractResponse = InteractResponseSuccess | InteractResponseFailure;

export interface InteractSessionRequest {
  url?: string;
  headers?: Record<string, string>;
  viewport?: { width: number; height: number };
}

export interface InteractSession {
  success: boolean;
  sessionId: string;
  url?: string;
  createdAt?: string;
  lastActivityAt?: string;
  expiresAt: string;
  idleExpiresAt: string;
  liveViewUrl: string;
  idleTimeoutSeconds?: number;
  hardTimeoutSeconds?: number;
}

export interface InteractSessionStatus extends InteractSession {
  busy: boolean;
}

export type OpenInteractSessionResponse = InteractSession | InteractResponseFailure;

export type MonitorGranularity = 'word' | 'line' | 'character';
export type MonitorCreateEvent = 'started' | 'page' | 'changed' | 'completed' | 'failed';
export type MonitorWebhookEvent = 'changed' | 'checked' | 'failed';

export type MonitorSchedule = string | { cron?: string; every?: string; timezone?: string };

export interface MonitorWebhook {
  url: string;
  headers?: Record<string, string>;
  events?: MonitorWebhookEvent[];
  metadata?: Record<string, unknown>;
  secret?: string;
}

export interface MonitorTrigger {
  keywordAppears?: string;
  keywordDisappears?: string;
  selector?: string;
  minChangeRatio?: number;
}

export interface MonitorDiffOptions {
  granularity?: MonitorGranularity;
  inline?: boolean;
}

export interface MonitorScrapeOptions {
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
}

export interface MonitorRequest {
  url: string;
  schedule: MonitorSchedule;
  scrapeOptions?: MonitorScrapeOptions;
  diff?: MonitorDiffOptions;
  trigger?: MonitorTrigger;
  sensitivity?: 'any' | 'significant';
  webhook?: string | MonitorWebhook;
}

export type MonitorPatch = Partial<Omit<MonitorRequest, 'url'>> & { status?: 'active' | 'paused' };

export type MonitorStatus = 'active' | 'paused' | 'error';

export interface MonitorSnapshot {
  id: number;
  monitorId: string;
  url: string;
  capturedAt: string;
  contentHash: string;
  markdown: string;
  snapshotUrl: string;
}

export interface Monitor {
  success: boolean;
  id: string;
  monitorId: string;
  url: string;
  schedule: { cron: string; timezone: string; every?: string };
  scrapeOptions?: Record<string, unknown>;
  sensitivity: 'any' | 'significant';
  diff: { granularity: MonitorGranularity; inline: boolean };
  trigger: MonitorTrigger;
  webhook: { url: string; events: MonitorWebhookEvent[]; metadata: Record<string, unknown> | null; headers: string[]; signed: boolean } | null;
  status: MonitorStatus;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastChangeAt: string | null;
  lastError: string | null;
  stats: { checks: number; changes: number; pagesUnchanged: number };
  latestSnapshot?: MonitorSnapshot | null;
}

export interface ListMonitorsResponse {
  success: boolean;
  monitors: Monitor[];
}

export interface MonitorDiffOp {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface MonitorDiff {
  granularity?: MonitorGranularity;
  added?: number;
  removed?: number;
  changeRatio?: number;
  coarse?: boolean;
  truncated?: boolean;
  text?: string;
  ops?: MonitorDiffOp[];
}

export type MonitorHistoryReason = 'first' | 'changed' | 'unchanged' | 'filtered' | 'trigger_not_met' | 'error';

export interface MonitorHistoryEntry {
  id: number;
  checkedAt: string;
  changed: boolean;
  reason: MonitorHistoryReason;
  diff?: MonitorDiff;
  error: string | null;
  snapshotUrl: string | null;
}

export interface MonitorHistoryResponse {
  success: boolean;
  monitorId: string;
  entries: MonitorHistoryEntry[];
  next: string | null;
}

export interface CheckMonitorResponse {
  success: boolean;
  monitorId: string;
  check: MonitorHistoryEntry;
  webhookQueued: boolean;
}

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'dead';

export interface WebhookDelivery {
  id: number;
  event: MonitorWebhookEvent;
  url: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastError: string | null;
  responseStatus: number | null;
  nextRetryAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface MonitorDeliveriesResponse {
  success: boolean;
  monitorId: string;
  deliveries: WebhookDelivery[];
}

export interface ReplayDeliveryResponse {
  success: boolean;
  delivery: WebhookDelivery;
}

export type StoredProviderName = 'anthropic' | 'openai' | 'gemini' | 'openrouter';

export interface ProviderStatus {
  provider: StoredProviderName;
  configured: boolean;
  source: 'key' | 'instance' | 'none';
  last4?: string;
  model?: string | null;
  updatedAt?: string;
}

export interface ListProvidersResponse {
  success: true;
  providers: ProviderStatus[];
}

export interface SaveProviderRequest {
  apiKey: string;
  model?: string;
}

export interface SaveProviderResponse {
  success: true;
  provider: StoredProviderName;
  last4?: string;
  model?: string | null;
}

export interface RemoveProviderResponse {
  success: true;
}

export type ServiceHealthStatus = 'ok' | 'degraded' | 'unhealthy';

export interface Health {
  status: ServiceHealthStatus;
  version?: string;
  services?: Record<string, { status: ServiceHealthStatus; detail?: string }>;
  providers?: Record<string, { configured?: boolean; model?: string }>;
}

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
