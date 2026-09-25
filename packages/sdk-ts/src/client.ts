// GENERATED from openapi.yaml by codegen/generate.ts, with names and types from
// codegen/methods.ts. Do not edit: change either of those and run `npm run generate`.

import { HelixTransport, decodeMetadataScrub, toFormData } from './transport.js';
import type {
  AgentSchemaRequest,
  AgentSchemaResponse,
  BatchAccepted,
  BatchScrapeRequest,
  CheckMonitorResponse,
  CrawlRequest,
  CrawlResponse,
  CrawlResumeResponse,
  DocumentRequest,
  DocumentResponse,
  EnrichRequest,
  EnrichResponse,
  Estimate,
  ExtractRequest,
  ExtractResponse,
  Health,
  InteractRequest,
  InteractResponse,
  InteractSessionRequest,
  InteractSessionStatus,
  Job,
  JobCancelled,
  JobErrorsResponse,
  ListMonitorsResponse,
  ListProvidersResponse,
  MapRequest,
  MapResponse,
  MetadataRequest,
  MetadataResponse,
  MetadataScrubResponse,
  MetadataUpload,
  Monitor,
  MonitorDeliveriesResponse,
  MonitorHistoryResponse,
  MonitorPatch,
  MonitorRequest,
  OpenInteractSessionResponse,
  ParseRequest,
  ParseResponse,
  ParseUpload,
  RemoveProviderResponse,
  ReplayDeliveryResponse,
  SaveProviderRequest,
  SaveProviderResponse,
  ScrapeRequest,
  ScrapeResponse,
  ScreenshotRequest,
  ScreenshotResponse,
  SearchRequest,
  SearchResponse,
  StoredProviderName,
  UsageOptions,
  UsageResponse,
} from './types.js';

export type { HelixClientOptions } from './transport.js';

export class HelixClient extends HelixTransport {
  async scrape(request: ScrapeRequest, signal?: AbortSignal): Promise<ScrapeResponse> {
    return this.send<ScrapeResponse>('POST', '/scrape', { body: request, signal });
  }

  async parse(request: ParseRequest | ParseUpload, signal?: AbortSignal): Promise<ParseResponse> {
    const body = 'file' in request ? toFormData(request, ['formats', 'jsonOptions', 'ocr', 'maxPages', 'tables']) : request;
    return this.send<ParseResponse>('POST', '/parse', { body, signal });
  }

  /** Read what a file discloses about the person and machine that made it. */
  async metadataScan(request: MetadataRequest | MetadataUpload, signal?: AbortSignal): Promise<MetadataResponse> {
    const body = 'file' in request ? toFormData(request, ['timeout']) : request;
    return this.send<MetadataResponse>('POST', '/metadata', { body, signal });
  }

  /**
   * Strip a file's metadata and get the cleaned bytes back.
   *
   * The endpoint answers with the file itself and puts the report in a header,
   * so this unwraps both into one value. Check `report.retained` before
   * treating the result as clean: some formats cannot drop every entry without
   * corrupting the file, and those are reported rather than silently kept.
   */
  async metadataScrub(request: MetadataRequest | MetadataUpload, signal?: AbortSignal): Promise<MetadataScrubResponse> {
    const body = 'file' in request ? toFormData(request, ['timeout']) : request;
    return decodeMetadataScrub(await this.raw('POST', '/metadata/scrub', { body, signal }));
  }

  async map(request: MapRequest, signal?: AbortSignal): Promise<MapResponse> {
    return this.send<MapResponse>('POST', '/map', { body: request, signal });
  }

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    return this.send<SearchResponse>('POST', '/search', { body: request, signal });
  }

  /**
   * Sparse identifier in, grounded columns out.
   *
   * Every value comes back tied to a passage in a page the API fetched, or null
   * with the reason it could not be. A field is never a guess, so `value` alone
   * is safe to trust without re-checking the citation.
   */
  async enrich(request: EnrichRequest, signal?: AbortSignal): Promise<EnrichResponse> {
    return this.send<EnrichResponse>('POST', '/enrich', { body: request, signal });
  }

  async crawl(request: CrawlRequest, signal?: AbortSignal): Promise<CrawlResponse> {
    return this.send<CrawlResponse>('POST', '/crawl', { body: request, signal });
  }

  /**
   * Price a crawl without submitting one.
   *
   * `crawl({ estimate: true })` answers the same thing; this exists so a caller
   * does not have to construct a job body it has no intention of running.
   */
  async estimateCrawl(request: CrawlRequest, signal?: AbortSignal): Promise<Estimate> {
    return this.send<Estimate>('POST', '/crawl/estimate', { body: request, signal });
  }

  /** Revive a cancelled crawl under its original id. */
  async resumeCrawl(jobId: string, signal?: AbortSignal): Promise<CrawlResumeResponse> {
    return this.send<CrawlResumeResponse>('POST', '/crawl', { body: { resume: jobId }, signal });
  }

  async getCrawl(jobId: string, cursor?: string, signal?: AbortSignal): Promise<Job> {
    return this.send<Job>('GET', `/crawl/${encodeURIComponent(jobId)}`, { query: { cursor }, signal });
  }

  async cancelCrawl(jobId: string, signal?: AbortSignal): Promise<JobCancelled> {
    return this.send<JobCancelled>('DELETE', `/crawl/${encodeURIComponent(jobId)}`, { signal });
  }

  async batchScrape(request: BatchScrapeRequest, signal?: AbortSignal): Promise<BatchAccepted> {
    return this.send<BatchAccepted>('POST', '/batch/scrape', { body: request, signal });
  }

  async getBatchScrape(jobId: string, cursor?: string, signal?: AbortSignal): Promise<Job> {
    return this.send<Job>('GET', `/batch/scrape/${encodeURIComponent(jobId)}`, { query: { cursor }, signal });
  }

  async cancelBatchScrape(jobId: string, signal?: AbortSignal): Promise<JobCancelled> {
    return this.send<JobCancelled>('DELETE', `/batch/scrape/${encodeURIComponent(jobId)}`, { signal });
  }

  async getJob(id: string, cursor?: string, signal?: AbortSignal): Promise<Job> {
    return this.send<Job>('GET', `/jobs/${encodeURIComponent(id)}`, { query: { cursor }, signal });
  }

  async cancelJob(id: string, signal?: AbortSignal): Promise<Job> {
    return this.send<Job>('DELETE', `/jobs/${encodeURIComponent(id)}`, { signal });
  }

  async getJobErrors(id: string, signal?: AbortSignal): Promise<JobErrorsResponse> {
    return this.send<JobErrorsResponse>('GET', `/jobs/${encodeURIComponent(id)}/errors`, { signal });
  }

  /**
   * One surface over parse, convert, metadata and assess; `op` picks which.
   *
   * The four original methods still work and are better typed — reach for this
   * when the operation is chosen at runtime rather than written in the code.
   */
  async document(request: DocumentRequest | FormData, signal?: AbortSignal): Promise<DocumentResponse> {
    return this.send<DocumentResponse>('POST', '/document', { body: request, signal });
  }

  /** One screenshot and nothing else: full page, viewport, or a single element. */
  async screenshot(request: ScreenshotRequest, signal?: AbortSignal): Promise<ScreenshotResponse> {
    return this.send<ScreenshotResponse>('POST', '/screenshot', { body: request, signal });
  }

  /**
   * The same shape across a set of URLs, as a table.
   *
   * A field with no grounding span in its source is dropped and reported in
   * `dropped` rather than returned, so check that alongside `data`.
   */
  async extract(request: ExtractRequest, signal?: AbortSignal): Promise<ExtractResponse> {
    return this.send<ExtractResponse>('POST', '/extract', { body: request, signal });
  }

  async agentSchema(request: AgentSchemaRequest, signal?: AbortSignal): Promise<AgentSchemaResponse> {
    return this.send<AgentSchemaResponse>('POST', '/agent/schema', { body: request, signal });
  }

  async interact(request: InteractRequest, signal?: AbortSignal): Promise<InteractResponse> {
    return this.send<InteractResponse>('POST', '/interact', { body: request, signal });
  }

  async openInteractSession(
    request?: InteractSessionRequest,
    signal?: AbortSignal,
  ): Promise<OpenInteractSessionResponse> {
    return this.send<OpenInteractSessionResponse>('POST', '/interact/session', { body: request, signal });
  }

  async getInteractSession(sessionId: string, signal?: AbortSignal): Promise<InteractSessionStatus> {
    return this.send<InteractSessionStatus>('GET', `/interact/session/${encodeURIComponent(sessionId)}`, { signal });
  }

  async closeInteractSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    await this.raw('DELETE', `/interact/session/${encodeURIComponent(sessionId)}`, { signal });
  }

  interactLiveStreamUrl(sessionId: string, token: string): string {
    return this.url(`/interact/live/${encodeURIComponent(sessionId)}/stream`, { token });
  }

  async listMonitors(signal?: AbortSignal): Promise<ListMonitorsResponse> {
    return this.send<ListMonitorsResponse>('GET', '/monitor', { signal });
  }

  async createMonitor(request: MonitorRequest, signal?: AbortSignal): Promise<Monitor> {
    return this.send<Monitor>('POST', '/monitor', { body: request, signal });
  }

  async getMonitor(id: string, signal?: AbortSignal): Promise<Monitor> {
    return this.send<Monitor>('GET', `/monitor/${encodeURIComponent(id)}`, { signal });
  }

  async updateMonitor(id: string, patch: MonitorPatch, signal?: AbortSignal): Promise<Monitor> {
    return this.send<Monitor>('PATCH', `/monitor/${encodeURIComponent(id)}`, { body: patch, signal });
  }

  async deleteMonitor(id: string, signal?: AbortSignal): Promise<void> {
    await this.raw('DELETE', `/monitor/${encodeURIComponent(id)}`, { signal });
  }

  async monitorHistory(
    id: string,
    options?: { cursor?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<MonitorHistoryResponse> {
    return this.send<MonitorHistoryResponse>('GET', `/monitor/${encodeURIComponent(id)}/history`, { query: { cursor: options?.cursor, limit: options?.limit }, signal });
  }

  async monitorSnapshot(id: string, snapshotId: number, signal?: AbortSignal): Promise<unknown> {
    return this.send<unknown>('GET', `/monitor/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshotId)}`, { signal });
  }

  async checkMonitor(id: string, signal?: AbortSignal): Promise<CheckMonitorResponse> {
    return this.send<CheckMonitorResponse>('POST', `/monitor/${encodeURIComponent(id)}/check`, { signal });
  }

  async monitorDeliveries(id: string, signal?: AbortSignal): Promise<MonitorDeliveriesResponse> {
    return this.send<MonitorDeliveriesResponse>('GET', `/monitor/${encodeURIComponent(id)}/deliveries`, { signal });
  }

  async replayMonitorDelivery(id: string, deliveryId: number, signal?: AbortSignal): Promise<ReplayDeliveryResponse> {
    return this.send<ReplayDeliveryResponse>('POST', `/monitor/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/replay`, { signal });
  }

  async listProviders(signal?: AbortSignal): Promise<ListProvidersResponse> {
    return this.send<ListProvidersResponse>('GET', '/providers', { signal });
  }

  async saveProvider(
    provider: StoredProviderName,
    request: SaveProviderRequest,
    signal?: AbortSignal,
  ): Promise<SaveProviderResponse> {
    return this.send<SaveProviderResponse>('PUT', `/providers/${encodeURIComponent(provider)}`, { body: request, signal });
  }

  async removeProvider(provider: StoredProviderName, signal?: AbortSignal): Promise<RemoveProviderResponse> {
    return this.send<RemoveProviderResponse>('DELETE', `/providers/${encodeURIComponent(provider)}`, { signal });
  }

  /** Request counts for the calling key. Scoped to that key and no other. */
  async usage(options?: UsageOptions, signal?: AbortSignal): Promise<UsageResponse> {
    return this.send<UsageResponse>('GET', '/usage', { query: { hours: options?.hours }, signal });
  }

  async health(signal?: AbortSignal): Promise<Health> {
    return this.send<Health>('GET', '/health', { signal, auth: false });
  }
}
