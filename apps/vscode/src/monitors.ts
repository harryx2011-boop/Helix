import type { FetchLike } from './target';

/**
 * Web Monitoring, read for the Monitors view: each monitor, and its latest
 * checks with the plain summary a change carries (`summarizeDiff`,
 * `apps/api/src/monitor/diff.ts`).
 */

/** Checks shown under one monitor. */
const HISTORY_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 10_000;

export interface MonitorItem {
  id: string;
  url: string;
  status: string;
  lastChangeAt: string | null;
}

export interface CheckItem {
  id: number;
  checkedAt: string;
  changed: boolean;
  reason: string;
  summary: string | null;
}

/** What a tree row shows. */
export interface Row {
  label: string;
  description: string;
  tooltip: string;
}

async function getJson(url: string, apiKey: string, fetchLike: FetchLike): Promise<unknown> {
  const response = await fetchLike(url, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Helix refused the API key (${response.status}). Run "Helix: Set API Key".`);
  }
  if (response.status !== 200) throw new Error(`Helix answered HTTP ${response.status}.`);
  return response.json();
}

/** The array under `key`, or empty when the body is not an object holding one. */
function listIn(body: unknown, key: string): Record<string, unknown>[] {
  if (typeof body !== 'object' || body === null) return [];
  const list = (body as Record<string, unknown>)[key];
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

export async function fetchMonitors(origin: string, apiKey: string, fetchLike: FetchLike): Promise<MonitorItem[]> {
  const body = await getJson(`${origin}/v1/monitor`, apiKey, fetchLike);
  return listIn(body, 'monitors').map((monitor) => ({
    id: String(monitor['id']),
    url: String(monitor['url']),
    status: String(monitor['status']),
    lastChangeAt: typeof monitor['lastChangeAt'] === 'string' ? monitor['lastChangeAt'] : null,
  }));
}

export async function fetchHistory(
  origin: string,
  apiKey: string,
  monitorId: string,
  fetchLike: FetchLike,
): Promise<CheckItem[]> {
  const url = `${origin}/v1/monitor/${encodeURIComponent(monitorId)}/history?limit=${HISTORY_LIMIT}`;
  const body = await getJson(url, apiKey, fetchLike);
  return listIn(body, 'entries').map((entry) => {
    const diff = entry['diff'] as { summary?: unknown } | null | undefined;
    return {
      id: Number(entry['id']),
      checkedAt: String(entry['checkedAt']),
      changed: entry['changed'] === true,
      reason: String(entry['reason']),
      summary: typeof diff?.summary === 'string' ? diff.summary : null,
    };
  });
}

export function monitorRow(monitor: MonitorItem): Row {
  return {
    label: monitor.url.replace(/^https?:\/\//, ''),
    description: monitor.status,
    tooltip: `${monitor.url} (${monitor.status})`,
  };
}

export function checkRow(check: CheckItem): Row {
  const detail = check.summary ?? check.reason;
  return {
    label: check.changed ? 'Changed' : 'No change',
    description: detail.split('\n')[0] ?? '',
    tooltip: `${check.checkedAt}\n${detail}`,
  };
}
