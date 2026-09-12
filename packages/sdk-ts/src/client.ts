import {
  HelixApiError,
  type AgentSchemaRequest,
  type AgentSchemaResponse,
  type ApiErrorBody,
  type BatchAccepted,
  type BatchScrapeRequest,
  type CheckMonitorResponse,
  type CrawlRequest,
  type CrawlResponse,
  type CrawlResumeResponse,
  type DocumentRequest,
  type DocumentResponse,
  type EnrichRequest,
  type EnrichResponse,
  type Estimate,
  type ExtractRequest,
  type ExtractResponse,
  type Health,
  type InteractRequest,
  type InteractResponse,
  type InteractSessionRequest,
  type InteractSessionStatus,
  type Job,
  type JobCancelled,
  type JobErrorsResponse,
  type ListMonitorsResponse,
  type ListProvidersResponse,
  type MapRequest,
  type MapResponse,
  type Monitor,
  type MonitorDeliveriesResponse,
  type MonitorHistoryResponse,
  type MonitorPatch,
  type MonitorRequest,
  type OpenInteractSessionResponse,
  type ParseRequest,
  type ParseResponse,
  type ParseUpload,
  type MetadataRequest,
  type MetadataResponse,
  type MetadataScrubReport,
  type MetadataScrubResponse,
  type MetadataUpload,
  type RemoveProviderResponse,
  type ReplayDeliveryResponse,
  type SaveProviderRequest,
  type SaveProviderResponse,
  type ScrapeRequest,
  type ScreenshotRequest,
  type ScreenshotResponse,
  type ScrapeResponse,
  type SearchRequest,
  type SearchResponse,
  type StoredProviderName,
  type UsageOptions,
  type UsageResponse,
} from './types.js';

export interface HelixClientOptions {
  baseUrl?: string;
  apiKey: string;
}

function buildParseFormData(upload: ParseUpload): FormData {
  const form = new FormData();
  form.set('file', upload.file, upload.filename);
  if (upload.formats) form.set('formats', upload.formats.join(','));
  if (upload.ocr) form.set('ocr', upload.ocr);
  if (upload.maxPages !== undefined) form.set('maxPages', String(upload.maxPages));
  if (upload.tables) form.set('tables', upload.tables);
  if (upload.jsonOptions) form.set('jsonOptions', JSON.stringify(upload.jsonOptions));
  return form;
}

function buildMetadataFormData(upload: MetadataUpload): FormData {
  const form = new FormData();
  form.set('file', upload.file, upload.filename);
  if (upload.timeout !== undefined) form.set('timeout', String(upload.timeout));
  return form;
}

export class HelixClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: HelixClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:7400/v1').replace(/\/$/, '');
    this.apiKey = options.apiKey;
  }

  async scrape(request: ScrapeRequest, signal?: AbortSignal): Promise<ScrapeResponse> {
    return this.post<ScrapeResponse>('/scrape', request, signal);
  }

  async parse(request: ParseRequest | ParseUpload, signal?: AbortSignal): Promise<ParseResponse> {
    const body = 'file' in request ? buildParseFormData(request) : request;
    return this.post<ParseResponse>('/parse', body, signal);
  }

  /** Read what a file discloses about the person and machine that made it. */
  async metadataScan(
    request: MetadataRequest | MetadataUpload,
    signal?: AbortSignal,
  ): Promise<MetadataResponse> {
    const body = 'file' in request ? buildMetadataFormData(request) : request;
    return this.post<MetadataResponse>('/metadata', body, signal);
  }

  /**
   * Strip a file's metadata and get the cleaned bytes back.
   *
   * The endpoint answers with the file itself and puts the report in a header,
   * so this unwraps both into one value. Check `report.retained` before
   * treating the result as clean: some formats cannot drop every entry without
   * corrupting the file, and those are reported rather than silently kept.
   */
  async metadataScrub(
    request: MetadataRequest | MetadataUpload,
    signal?: AbortSignal,
  ): Promise<MetadataScrubResponse> {
    const isUpload = 'file' in request;
    const body = isUpload ? buildMetadataFormData(request) : request;

    let response: Response;
    try {
      response = await fetch(this.url('/metadata/scrub'), {
        method: 'POST',
        headers: isUpload ? this.headers() : this.headers({ 'Content-Type': 'application/json' }),
        body: isUpload ? (body as FormData) : JSON.stringify(body),
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

    // A typed failure comes back as JSON in the usual envelope rather than as
    // file bytes, so the content type is what tells the two apart.
    if (response.headers.get('content-type')?.includes('application/json')) {
      return (await response.json()) as MetadataScrubResponse;
    }

    const header = response.headers.get('x-helix-metadata-report');
    if (!header) {
      // Handing back bytes with an invented empty report would claim nothing was
      // found, which is a worse answer than saying the report is missing.
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
      data: await response.blob(),
      filename: filenameFromDisposition(response.headers.get('content-disposition')) ?? 'file.scrubbed',
      report,
    };
  }

  async map(request: MapRequest, signal?: AbortSignal): Promise<MapResponse> {
    return this.post<MapResponse>('/map', request, signal);
  }

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    return this.post<SearchResponse>('/search', request, signal);
  }

  /**
   * Sparse identifier in, grounded columns out.
   *
   * Every value comes back tied to a passage in a page the API fetched, or null
   * with the reason it could not be. A field is never a guess, so `value` alone
   * is safe to trust without re-checking the citation.
   */
  async enrich(request: EnrichRequest, signal?: AbortSignal): Promise<EnrichResponse> {
    return this.post<EnrichResponse>('/enrich', request, signal);
  }

  async crawl(request: CrawlRequest, signal?: AbortSignal): Promise<CrawlResponse> {
    return this.post<CrawlResponse>('/crawl', request, signal);
  }

  /**
   * Price a crawl without submitting one.
   *
   * `crawl({ estimate: true })` answers the same thing; this exists so a caller
   * does not have to construct a job body it has no intention of running.
   */
  async estimateCrawl(request: CrawlRequest, signal?: AbortSignal): Promise<Estimate> {
    return this.post<Estimate>('/crawl/estimate', request, signal);
  }

  /** Revive a cancelled crawl under its original id. */
  async resumeCrawl(jobId: string, signal?: AbortSignal): Promise<CrawlResumeResponse> {
    return this.post<CrawlResumeResponse>('/crawl', { resume: jobId }, signal);
  }

  async getCrawl(jobId: string, cursor?: string, signal?: AbortSignal): Promise<Job> {
    return this.get<Job>(`/crawl/${jobId}`, cursor ? { cursor } : undefined, signal);
  }

  async cancelCrawl(jobId: string, signal?: AbortSignal): Promise<JobCancelled> {
    return this.delete<JobCancelled>(`/crawl/${jobId}`, signal);
  }

  async batchScrape(request: BatchScrapeRequest, signal?: AbortSignal): Promise<BatchAccepted> {
    return this.post<BatchAccepted>('/batch/scrape', request, signal);
  }

  async getBatchScrape(jobId: string, cursor?: string, signal?: AbortSignal): Promise<Job> {
    return this.get<Job>(`/batch/scrape/${jobId}`, cursor ? { cursor } : undefined, signal);
  }

  async cancelBatchScrape(jobId: string, signal?: AbortSignal): Promise<JobCancelled> {
    return this.delete<JobCancelled>(`/batch/scrape/${jobId}`, signal);
  }

  async getJob(id: string, cursor?: string, signal?: AbortSignal): Promise<Job> {
    return this.get<Job>(`/jobs/${id}`, cursor ? { cursor } : undefined, signal);
  }

  async cancelJob(id: string, signal?: AbortSignal): Promise<Job> {
    return this.delete<Job>(`/jobs/${id}`, signal);
  }

  async getJobErrors(id: string, signal?: AbortSignal): Promise<JobErrorsResponse> {
    return this.get<JobErrorsResponse>(`/jobs/${id}/errors`, undefined, signal);
  }

  /**
   * One surface over parse, convert, metadata and assess; `op` picks which.
   *
   * The four original methods still work and are better typed — reach for this
   * when the operation is chosen at runtime rather than written in the code.
   */
  async document(request: DocumentRequest | FormData, signal?: AbortSignal): Promise<DocumentResponse> {
    return this.post<DocumentResponse>('/document', request, signal);
  }

  /** One screenshot and nothing else: full page, viewport, or a single element. */
  async screenshot(request: ScreenshotRequest, signal?: AbortSignal): Promise<ScreenshotResponse> {
    return this.post<ScreenshotResponse>('/screenshot', request, signal);
  }

  /**
   * The same shape across a set of URLs, as a table.
   *
   * A field with no grounding span in its source is dropped and reported in
   * `dropped` rather than returned, so check that alongside `data`.
   */
  async extract(request: ExtractRequest, signal?: AbortSignal): Promise<ExtractResponse> {
    return this.post<ExtractResponse>('/extract', request, signal);
  }

  async agentSchema(request: AgentSchemaRequest, signal?: AbortSignal): Promise<AgentSchemaResponse> {
    return this.post<AgentSchemaResponse>('/agent/schema', request, signal);
  }

  async interact(request: InteractRequest, signal?: AbortSignal): Promise<InteractResponse> {
    return this.post<InteractResponse>('/interact', request, signal);
  }

  async openInteractSession(request?: InteractSessionRequest, signal?: AbortSignal): Promise<OpenInteractSessionResponse> {
    return this.post<OpenInteractSessionResponse>('/interact/session', request ?? {}, signal);
  }

  async getInteractSession(sessionId: string, signal?: AbortSignal): Promise<InteractSessionStatus> {
    return this.get<InteractSessionStatus>(`/interact/session/${sessionId}`, undefined, signal);
  }

  async closeInteractSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    await this.delete<undefined>(`/interact/session/${sessionId}`, signal, true);
  }

  interactLiveStreamUrl(sessionId: string, token: string): string {
    return `${this.baseUrl}/interact/live/${sessionId}/stream?token=${encodeURIComponent(token)}`;
  }

  async listMonitors(signal?: AbortSignal): Promise<ListMonitorsResponse> {
    return this.get<ListMonitorsResponse>('/monitor', undefined, signal);
  }

  async createMonitor(request: MonitorRequest, signal?: AbortSignal): Promise<Monitor> {
    return this.post<Monitor>('/monitor', request, signal);
  }

  async getMonitor(id: string, signal?: AbortSignal): Promise<Monitor> {
    return this.get<Monitor>(`/monitor/${id}`, undefined, signal);
  }

  async updateMonitor(id: string, patch: MonitorPatch, signal?: AbortSignal): Promise<Monitor> {
    return this.patch<Monitor>(`/monitor/${id}`, patch, signal);
  }

  async deleteMonitor(id: string, signal?: AbortSignal): Promise<void> {
    await this.delete<undefined>(`/monitor/${id}`, signal, true);
  }

  async monitorHistory(
    id: string,
    options?: { cursor?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<MonitorHistoryResponse> {
    const query: Record<string, string> = {};
    if (options?.cursor !== undefined) query['cursor'] = String(options.cursor);
    if (options?.limit !== undefined) query['limit'] = String(options.limit);
    return this.get<MonitorHistoryResponse>(`/monitor/${id}/history`, query, signal);
  }

  async monitorSnapshot(id: string, snapshotId: number, signal?: AbortSignal) {
    return this.get(`/monitor/${id}/snapshots/${snapshotId}`, undefined, signal);
  }

  async checkMonitor(id: string, signal?: AbortSignal): Promise<CheckMonitorResponse> {
    return this.post<CheckMonitorResponse>(`/monitor/${id}/check`, undefined, signal);
  }

  async monitorDeliveries(id: string, signal?: AbortSignal): Promise<MonitorDeliveriesResponse> {
    return this.get<MonitorDeliveriesResponse>(`/monitor/${id}/deliveries`, undefined, signal);
  }

  async replayMonitorDelivery(id: string, deliveryId: number, signal?: AbortSignal): Promise<ReplayDeliveryResponse> {
    return this.post<ReplayDeliveryResponse>(`/monitor/${id}/deliveries/${deliveryId}/replay`, undefined, signal);
  }

  async listProviders(signal?: AbortSignal): Promise<ListProvidersResponse> {
    return this.get<ListProvidersResponse>('/providers', undefined, signal);
  }

  async saveProvider(provider: StoredProviderName, request: SaveProviderRequest, signal?: AbortSignal): Promise<SaveProviderResponse> {
    return this.put<SaveProviderResponse>(`/providers/${provider}`, request, signal);
  }

  async removeProvider(provider: StoredProviderName, signal?: AbortSignal): Promise<RemoveProviderResponse> {
    return this.delete<RemoveProviderResponse>(`/providers/${provider}`, signal);
  }

  /** Request counts for the calling key. Scoped to that key and no other. */
  async usage(options?: UsageOptions, signal?: AbortSignal): Promise<UsageResponse> {
    const query: Record<string, string> = {};
    if (options?.hours !== undefined) query['hours'] = String(options.hours);
    return this.get<UsageResponse>('/usage', query, signal);
  }

  async health(signal?: AbortSignal): Promise<Health> {
    return this.get<Health>('/health', undefined, signal, false);
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, ...extra };
  }

  private url(path: string, query?: Record<string, string>): string {
    const url = `${this.baseUrl}${path}`;
    if (!query || Object.keys(query).length === 0) return url;
    return `${url}?${new URLSearchParams(query).toString()}`;
  }

  private async handle<T>(response: Response, expectBody: boolean): Promise<T> {
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
      throw new HelixApiError(errorBody?.message ?? `Request failed with status ${response.status}`, response.status, errorBody);
    }
    if (!expectBody || response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  /**
   * A caller-supplied AbortSignal firing is a deliberate cancellation, not a
   * network failure, and must reach the caller as itself: wrapping it as a
   * HelixApiError would make "I cancelled this" indistinguishable from "the
   * network is down". Anything else gets wrapped, with the original failure
   * attached as `cause` so it is not lost.
   */
  private static wrapFetchError(error: unknown): never {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const wrapped = new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
    wrapped.cause = error;
    throw wrapped;
  }

  private async get<T>(path: string, query: Record<string, string> | undefined, signal: AbortSignal | undefined, auth = true): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.url(path, query), {
        headers: auth ? this.headers() : {},
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      HelixClient.wrapFetchError(error);
    }
    return this.handle<T>(response, true);
  }

  private async put<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        method: 'PUT',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      HelixClient.wrapFetchError(error);
    }
    return this.handle<T>(response, true);
  }

  private async patch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        method: 'PATCH',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      HelixClient.wrapFetchError(error);
    }
    return this.handle<T>(response, true);
  }

  private async delete<T>(path: string, signal?: AbortSignal, expectNoBody = false): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        method: 'DELETE',
        headers: this.headers(),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      HelixClient.wrapFetchError(error);
    }
    return this.handle<T>(response, !expectNoBody);
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        method: 'POST',
        headers: isFormData ? this.headers() : this.headers({ 'Content-Type': 'application/json' }),
        body: isFormData ? (body as FormData) : JSON.stringify(body ?? {}),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      HelixClient.wrapFetchError(error);
    }
    return this.handle<T>(response, true);
  }
}

/** Pull the suggested filename out of a Content-Disposition header. */
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
