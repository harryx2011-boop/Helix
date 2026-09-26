/**
 * The SDK's method table. Each row names an operation in openapi.yaml and
 * holds only what the spec cannot say: the method's public name where it
 * differs from the operationId, the TypeScript types from src/types.ts where
 * the spec's schema is inline, and argument shapes kept for compatibility.
 * HTTP method, path, path and query parameters, whether a body is optional,
 * multipart fields, 204-means-void and unauthenticated routes all come from
 * the spec. codegen/generate.ts turns this into src/client.ts.
 *
 * Every operation in the spec is either a row here or listed in NOT_IN_SDK,
 * and the generator refuses to run otherwise, so a new endpoint cannot land
 * in the spec without a decision about the SDK.
 */

export interface SdkMethod {
  /** Public method name. */
  name: string;
  /** operationId in openapi.yaml. */
  op: string;
  doc?: string;
  /** Argument names for the path parameters, in path order, where they differ from the spec's. */
  pathArgs?: readonly string[];
  /** TypeScript types for path parameters, by spec name, where `string`/`number` is too loose. */
  pathTypes?: Readonly<Record<string, string>>;
  /** How query parameters are taken: one options object (default), one argument each, or not at all. */
  query?: 'options' | 'positional' | 'none';
  /** Named type for the options object; otherwise it is written out from the spec's parameters. */
  queryType?: string;
  /** Type of the body argument where the spec's JSON schema is inline or broader. */
  request?: string;
  /** Name of the body argument. Defaults to `request`. */
  bodyArg?: string;
  /** An upload type accepted in place of `request` and sent as multipart/form-data. */
  upload?: string;
  /** Builds the body from one argument instead of taking it whole. */
  bodyFrom?: { field: string; arg: string; type: string };
  /** Return type where the spec's response schema is inline or differs. */
  response?: string;
  /** A function in src/transport.ts that decodes a non-JSON response. */
  decode?: string;
  /** Build and return the URL instead of sending a request. */
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
  // Typed `unknown` since before generation; the spec's MonitorSnapshot would narrow it.
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

/** Operations in the spec with no SDK method, and why. */
export const NOT_IN_SDK: Readonly<Record<string, string>> = {
  interactLiveView: 'An HTML page for a browser tab, not an API call.',
  pdfAssess: 'Not in the SDK yet; reachable through document({ op: "assess" }).',
  robotsCheck: 'Not in the SDK yet.',
  diff: 'Not in the SDK yet.',
  getJobSchema: 'Not in the SDK yet.',
  getJobLadder: 'Not in the SDK yet.',
  getJobCost: 'Not in the SDK yet.',
  listProviderModels: 'Not in the SDK yet.',
  getStatusHistory: 'Not in the SDK yet.',
  getProfileHealth: 'Not in the SDK yet.',
  listKeys: 'Operator key management; not in the SDK yet.',
  createKey: 'Operator key management; not in the SDK yet.',
  revokeKey: 'Operator key management; not in the SDK yet.',
  getUsageAll: 'Operator, instance-wide usage; not in the SDK yet.',
};
