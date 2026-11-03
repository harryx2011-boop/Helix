
export interface SdkMethod {
  name: string;
  op: string;
  doc?: string;
  pathArgs?: readonly string[];
  pathTypes?: Readonly<Record<string, string>>;
  query?: 'options' | 'positional' | 'none';
  queryType?: string;
  request?: string;
  bodyArg?: string;
  upload?: string;
  bodyFrom?: { field: string; arg: string; type: string };
  response?: string;
  decode?: string;
  url?: boolean;
}

export const SDK_METHODS: readonly SdkMethod[] = [
  { name: 'scrape', op: 'scrape' },
  { name: 'parse', op: 'parse', upload: 'ParseUpload' },
  {
    name: 'metadataScan',
    op: 'metadataScan',
    upload: 'MetadataUpload',
    doc: 'Read what a file discloses about the person and machine that made it.',
  },
  {
    name: 'metadataScrub',
    op: 'metadataScrub',
    upload: 'MetadataUpload',
    response: 'MetadataScrubResponse',
    decode: 'decodeMetadataScrub',
    doc: `Strip a file's metadata and get the cleaned bytes back.

The endpoint answers with the file itself and puts the report in a header,
so this unwraps both into one value. Check \`report.retained\` before
treating the result as clean: some formats cannot drop every entry without
corrupting the file, and those are reported rather than silently kept.`,
  },
  { name: 'map', op: 'map' },
  { name: 'search', op: 'search' },
  {
    name: 'enrich',
    op: 'enrich',
    doc: `Sparse identifier in, grounded columns out.

Every value comes back tied to a passage in a page the API fetched, or null
with the reason it could not be. A field is never a guess, so \`value\` alone
is safe to trust without re-checking the citation.`,
  },
  { name: 'crawl', op: 'crawl', response: 'CrawlResponse' },
  {
    name: 'estimateCrawl',
    op: 'estimateCrawl',
    doc: `Price a crawl without submitting one.

\`crawl({ estimate: true })\` answers the same thing; this exists so a caller
does not have to construct a job body it has no intention of running.`,
  },
  {
    name: 'resumeCrawl',
    op: 'crawl',
    bodyFrom: { field: 'resume', arg: 'jobId', type: 'string' },
    response: 'CrawlResumeResponse',
    doc: 'Revive a cancelled crawl under its original id.',
  },
  { name: 'getCrawl', op: 'getCrawl', pathArgs: ['jobId'], query: 'positional' },
  { name: 'cancelCrawl', op: 'cancelCrawl', pathArgs: ['jobId'], query: 'none' },
  { name: 'batchScrape', op: 'batchScrape' },
  { name: 'getBatchScrape', op: 'getBatchScrape', pathArgs: ['jobId'], query: 'positional' },
  { name: 'cancelBatchScrape', op: 'cancelBatchScrape', pathArgs: ['jobId'], query: 'none' },
  { name: 'getJob', op: 'getJob', query: 'positional' },
  { name: 'cancelJob', op: 'cancelJob', query: 'none' },
  { name: 'getJobErrors', op: 'getJobErrors', response: 'JobErrorsResponse' },
  {
    name: 'document',
    op: 'document',
    request: 'DocumentRequest | FormData',
    query: 'none',
    response: 'DocumentResponse',
    doc: `One surface over parse, metadata and assess; \`op\` picks which.

The four original methods still work and are better typed — reach for this
when the operation is chosen at runtime rather than written in the code.`,
  },
  {
    name: 'screenshot',
    op: 'screenshot',
    doc: 'One screenshot and nothing else: full page, viewport, or a single element.',
  },
  {
    name: 'extract',
    op: 'extract',
    doc: `The same shape across a set of URLs, as a table.

A field with no grounding span in its source is dropped and reported in
\`dropped\` rather than returned, so check that alongside \`data\`.`,
  },
  { name: 'agentSchema', op: 'agentSchema' },
  { name: 'interact', op: 'interact' },
  { name: 'openInteractSession', op: 'openInteractSession', response: 'OpenInteractSessionResponse' },
  { name: 'getInteractSession', op: 'getInteractSession', pathArgs: ['sessionId'], response: 'InteractSessionStatus' },
  { name: 'closeInteractSession', op: 'closeInteractSession', pathArgs: ['sessionId'] },
  { name: 'interactLiveStreamUrl', op: 'streamInteractLive', pathArgs: ['sessionId'], query: 'positional', url: true },
  { name: 'listMonitors', op: 'listMonitors', response: 'ListMonitorsResponse' },
  { name: 'createMonitor', op: 'createMonitor' },
  { name: 'getMonitor', op: 'getMonitor' },
  { name: 'updateMonitor', op: 'updateMonitor', bodyArg: 'patch' },
  { name: 'deleteMonitor', op: 'deleteMonitor' },
  { name: 'monitorHistory', op: 'monitorHistory', response: 'MonitorHistoryResponse' },
  { name: 'monitorSnapshot', op: 'monitorSnapshot', response: 'unknown' },
  { name: 'checkMonitor', op: 'checkMonitor', response: 'CheckMonitorResponse' },
  { name: 'monitorDeliveries', op: 'monitorDeliveries', response: 'MonitorDeliveriesResponse' },
  { name: 'replayMonitorDelivery', op: 'replayMonitorDelivery', response: 'ReplayDeliveryResponse' },
  { name: 'listProviders', op: 'listProviders', response: 'ListProvidersResponse' },
  {
    name: 'saveProvider',
    op: 'putProvider',
    pathTypes: { provider: 'StoredProviderName' },
    request: 'SaveProviderRequest',
    response: 'SaveProviderResponse',
  },
  {
    name: 'removeProvider',
    op: 'deleteProvider',
    pathTypes: { provider: 'StoredProviderName' },
    response: 'RemoveProviderResponse',
  },
  {
    name: 'usage',
    op: 'getUsage',
    queryType: 'UsageOptions',
    response: 'UsageResponse',
    doc: 'Request counts for the calling key. Scoped to that key and no other.',
  },
  { name: 'health', op: 'health' },
];

export const NOT_IN_SDK: Readonly<Record<string, string>> = {
  interactLiveView: 'An HTML page for a browser tab, not an API call.',
  pdfAssess: 'Not in the SDK yet; reachable through document({ op: "assess" }).',
  robotsCheck: 'Not in the SDK yet.',
  imageSheet: 'Not in the SDK yet.',
  diff: 'Not in the SDK yet.',
  getJobSchema: 'Not in the SDK yet.',
  getJobLadder: 'Not in the SDK yet.',
  getJobCost: 'Not in the SDK yet.',
  vectorsSearch: 'Not in the SDK yet.',
  listProviderModels: 'Not in the SDK yet.',
  getStatusHistory: 'Not in the SDK yet.',
  getProfileHealth: 'Not in the SDK yet.',
  listKeys: 'Operator key management; not in the SDK yet.',
  createKey: 'Operator key management; not in the SDK yet.',
  revokeKey: 'Operator key management; not in the SDK yet.',
  getUsageAll: 'Operator, instance-wide usage; not in the SDK yet.',
};
