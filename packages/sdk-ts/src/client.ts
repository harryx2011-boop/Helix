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
  type RemoveProviderResponse,
  type ReplayDeliveryResponse,
  type SaveProviderRequest,
  type SaveProviderResponse,
  type ScrapeRequest,
  type ScrapeResponse,
  type SearchRequest,
  type SearchResponse,
  type StoredProviderName,
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

  async map(request: MapRequest, signal?: AbortSignal): Promise<MapResponse> {
    return this.post<MapResponse>('/map', request, signal);
  }

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    return this.post<SearchResponse>('/search', request, signal);
  }

  async crawl(request: CrawlRequest, signal?: AbortSignal): Promise<CrawlResponse> {
    return this.post<CrawlResponse>('/crawl', request, signal);
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

  private async get<T>(path: string, query: Record<string, string> | undefined, signal: AbortSignal | undefined, auth = true): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.url(path, query), {
        headers: auth ? this.headers() : {},
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      throw new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
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
      throw new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
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
      throw new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
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
      throw new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
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
      throw new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
    }
    return this.handle<T>(response, true);
  }
}
