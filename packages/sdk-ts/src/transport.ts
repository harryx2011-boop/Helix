import { HelixApiError, type ApiErrorBody, type MetadataScrubReport, type MetadataScrubResponse } from './types.js';

/**
 * The hand-written half of the SDK: how a request is sent, never which ones
 * exist. Every endpoint method lives in client.ts, generated from openapi.yaml
 * by codegen/generate.ts, and calls through `send`, `raw` or `url` here.
 */

export interface HelixClientOptions {
  baseUrl?: string;
  apiKey: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SendOptions {
  query?: Record<string, string | number | undefined> | undefined;
  body?: unknown;
  signal?: AbortSignal | undefined;
  /** False for the few operations the spec marks `security: []`. */
  auth?: boolean | undefined;
}

export class HelixTransport {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: HelixClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:7400/v1').replace(/\/$/, '');
    this.apiKey = options.apiKey;
  }

  /** An empty value is left out, so an unset cursor never becomes `?cursor=`. */
  protected url(path: string, query?: SendOptions['query']): string {
    const url = `${this.baseUrl}${path}`;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  /** Send a request and return the response once it is known to be 2xx. */
  protected async raw(method: HttpMethod, path: string, options: SendOptions = {}): Promise<Response> {
    const headers: Record<string, string> = options.auth === false ? {} : { Authorization: `Bearer ${this.apiKey}` };
    const init: RequestInit = method === 'GET' ? { headers } : { method, headers };
    if (method !== 'GET' && method !== 'DELETE') {
      if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
        init.body = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.body ?? {});
      }
    }
    if (options.signal) init.signal = options.signal;

    let response: Response;
    try {
      response = await fetch(this.url(path, options.query), init);
    } catch (error) {
      wrapFetchError(error);
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
      throw new HelixApiError(errorBody?.message ?? `Request failed with status ${response.status}`, response.status, errorBody);
    }
    return response;
  }

  protected async send<T>(method: HttpMethod, path: string, options: SendOptions = {}): Promise<T> {
    const response = await this.raw(method, path, options);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

/**
 * A caller-supplied AbortSignal firing is a deliberate cancellation, not a
 * network failure, and must reach the caller as itself: wrapping it as a
 * HelixApiError would make "I cancelled this" indistinguishable from "the
 * network is down". Anything else gets wrapped, with the original failure
 * attached as `cause` so it is not lost.
 */
function wrapFetchError(error: unknown): never {
  if (error instanceof Error && error.name === 'AbortError') throw error;
  const wrapped = new HelixApiError(error instanceof Error ? error.message : 'Network request failed', 0);
  wrapped.cause = error;
  throw wrapped;
}

/**
 * An upload as multipart/form-data. `fields` comes from the operation's
 * multipart schema in openapi.yaml; arrays go comma-separated and objects as
 * JSON strings, which is how the API reads them back.
 */
export function toFormData(upload: { file: Blob; filename?: string }, fields: readonly string[]): FormData {
  const form = new FormData();
  form.set('file', upload.file, upload.filename);
  const values = upload as unknown as Record<string, unknown>;
  for (const field of fields) {
    const value = values[field];
    if (value === undefined || value === null || value === '') continue;
    form.set(field, Array.isArray(value) ? value.join(',') : typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return form;
}

/**
 * `/metadata/scrub` answers with the file itself and puts the report in a
 * header, so this unwraps both into one value. Check `report.retained` before
 * treating the result as clean: some formats cannot drop every entry without
 * corrupting the file, and those are reported rather than silently kept.
 */
export async function decodeMetadataScrub(response: Response): Promise<MetadataScrubResponse> {
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
