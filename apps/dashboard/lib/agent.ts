'use client';

import { HelixClient, HelixApiError } from '@/lib/api';
import type { AgentSchemaRequest, AgentSchemaResponse, SearchResponse, ScrapeResponse } from '@/lib/api';
import { runEndpoint } from '@/lib/run-endpoint';
import { HOSTED } from '@/lib/mode';

const MAX_CONCURRENT_PAGES = 3;

/** Hosted has no browser-held key to call the instance with; the proxy resolves the signed-in user's own key server-side. */
export async function requestAgentSchema(
  request: AgentSchemaRequest,
  apiKey: string | null,
): Promise<AgentSchemaResponse> {
  if (HOSTED) {
    const response = await fetch('/api/app/run?endpoint=agent-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const json = (await response.json().catch(() => null)) as (AgentSchemaResponse & { message?: string }) | null;
    if (!response.ok) {
      throw new HelixApiError(json?.message ?? `Request failed with status ${response.status}`, response.status);
    }
    return json as AgentSchemaResponse;
  }
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.agentSchema(request);
}

export interface AgentPageResult {
  url: string;
  ok: boolean;
  json?: Record<string, unknown> | null;
  errorMessage?: string;
}

/** Runs an async task list with a bounded number in flight, preserving input order in the output. */
async function runWithConcurrency<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index] as T, index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function failureMessage(response: ScrapeResponse): string {
  if (response.success) return '';
  return response.failure.detail ?? response.failure.reason;
}

/** Reads one URL and pulls its `jsonOptions.schema` extraction, keyed for the agent's merged results view. */
export async function scrapeForSchema(
  url: string,
  schema: Record<string, unknown>,
  apiKey: string | null,
): Promise<AgentPageResult> {
  try {
    const result = await runEndpoint<ScrapeResponse>(
      'scrape',
      { url, formats: ['json'], jsonOptions: { schema } },
      apiKey,
    );
    if (!result.body.success) {
      return { url, ok: false, errorMessage: failureMessage(result.body) };
    }
    return { url, ok: true, json: result.body.data.json ?? null };
  } catch (error) {
    return { url, ok: false, errorMessage: error instanceof HelixApiError ? error.message : 'Request failed.' };
  }
}

export async function scrapeUrlsForSchema(
  urls: string[],
  schema: Record<string, unknown>,
  apiKey: string | null,
  onPageDone?: (result: AgentPageResult, completed: number, total: number) => void,
): Promise<AgentPageResult[]> {
  let completed = 0;
  return runWithConcurrency(urls, MAX_CONCURRENT_PAGES, async (url) => {
    const result = await scrapeForSchema(url, schema, apiKey);
    completed += 1;
    onPageDone?.(result, completed, urls.length);
    return result;
  });
}

/** Search-driven mode: search for the prompt, then read each result's `json` extraction. */
export async function searchForSchema(
  prompt: string,
  schema: Record<string, unknown>,
  apiKey: string | null,
): Promise<AgentPageResult[]> {
  const result = await runEndpoint<SearchResponse>(
    'search',
    { query: prompt, limit: 5, scrapeOptions: { formats: ['json'], jsonOptions: { schema } } },
    apiKey,
  );
  if (!result.ok || !result.body.success) {
    throw new HelixApiError('Search failed.', result.status);
  }
  return result.body.data.web.map((item) => {
    if (item.failure) {
      return { url: item.url, ok: false, errorMessage: item.failure.detail ?? item.failure.reason };
    }
    return { url: item.url, ok: true, json: item.json ?? null };
  });
}

/** Flattens one level of nested objects/arrays into dotted keys, for CSV export. */
export function flattenRow(row: Record<string, unknown>, prefix = ''): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      flat[path] = JSON.stringify(value);
    } else {
      flat[path] = value === undefined || value === null ? '' : String(value);
    }
  }
  return flat;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const flatRows = rows.map((row) => flattenRow(row));
  const columns = Array.from(new Set(flatRows.flatMap((row) => Object.keys(row))));
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [columns.join(',')];
  for (const row of flatRows) {
    lines.push(columns.map((col) => escape(row[col] ?? '')).join(','));
  }
  return lines.join('\n');
}
