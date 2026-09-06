'use client';

import { HelixApiError, HelixClient } from '@/lib/api';
import type { Job, MonitorListResponse } from '@/lib/api';
import { HOSTED, PUBLIC_API_URL } from '@/lib/mode';
import { HostedKeysError, isHostedKeysNotConfigured, listHostedKeys } from '@/lib/hosted-keys';
import { KeysError, listInstanceKeys } from '@/lib/instance-keys';

/**
 * Live instance data for the command palette. Every section answers with a
 * list or a reason, never an empty list standing in for "could not ask":
 * an unreachable instance and an account with no monitors look identical
 * otherwise, and the palette has to say which one it is.
 *
 * `unavailable` is reserved for a real failure (network error, rejected key,
 * 5xx) and renders with a warning icon. `empty` is an expected no-data state
 * (no key saved yet, no jobs run yet) with the same reason text but no
 * warning treatment — conflating the two made the palette show what looked
 * like three simultaneous errors on a brand-new instance.
 */
export type Section<T> =
  | { status: 'ok'; items: T[] }
  | { status: 'unavailable'; reason: string }
  | { status: 'empty'; reason: string };

export interface KeySummary {
  id: string;
  name: string;
  masked: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

export interface MonitorSummary {
  id: string;
  url: string;
  status: 'active' | 'paused' | 'error';
  schedule: string;
  lastChangeAt: string | null;
}

export interface JobSummary {
  id: string;
  status: string;
  type: string | undefined;
  completed: number | undefined;
  total: number | undefined;
}

export interface InstanceData {
  keys: Section<KeySummary>;
  monitors: Section<MonitorSummary>;
  jobs: Section<JobSummary>;
}

export const NO_JOBS_REASON = 'The instance keeps no job list to search; jobs started from this browser appear here, and none have yet.';

function reasonOf(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'The instance did not answer in time.';
  if (err instanceof HostedKeysError) return err.status === 0 ? 'Could not reach the dashboard server.' : err.message;
  if (err instanceof KeysError) return err.message;
  if (err instanceof HelixApiError) {
    if (err.status === 0) return `Could not reach the API at ${PUBLIC_API_URL}.`;
    if (err.status === 401) return 'The saved API key was rejected.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Unexpected error.';
}

/** The hosted-keys client takes no signal, so its call is raced against the palette's deadline here. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function proxyGet<T>(query: Record<string, string>, signal: AbortSignal): Promise<T> {
  const params = new URLSearchParams(query);
  let response: Response;
  try {
    response = await fetch(`/api/app/instance?${params.toString()}`, { signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new HelixApiError('Could not reach the dashboard server.', 0);
  }
  const json = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!response.ok) {
    const message =
      json?.error === 'not_configured'
        ? 'This deployment has no key store configured.'
        : (json?.message ?? `Request failed with status ${response.status}`);
    throw new HelixApiError(message, response.status, { error: json?.error ?? 'proxy_error', message });
  }
  return json as T;
}

async function loadKeys(apiKey: string | null, signal: AbortSignal): Promise<Section<KeySummary>> {
  const toSummary = (k: { id: string; name: string; keyPrefix: string; lastUsedAt: string | null; revokedAt: string | null }): KeySummary => ({
    id: k.id,
    name: k.name,
    masked: `${k.keyPrefix}${'•'.repeat(8)}`,
    lastUsedAt: k.lastUsedAt,
    revoked: Boolean(k.revokedAt),
  });

  // Same ladder as the Keys page: hosted account keys first, and only a
  // deployment without Supabase falls through to the instance's own list.
  if (HOSTED) {
    try {
      return { status: 'ok', items: (await abortable(listHostedKeys(), signal)).map(toSummary) };
    } catch (err) {
      if (!isHostedKeysNotConfigured(err)) return { status: 'unavailable', reason: reasonOf(err) };
    }
  } else if (!apiKey) {
    return { status: 'empty', reason: NO_KEY_REASON };
  }
  try {
    return { status: 'ok', items: (await abortable(listInstanceKeys(), signal)).map(toSummary) };
  } catch (err) {
    return { status: 'unavailable', reason: reasonOf(err) };
  }
}

async function loadMonitors(apiKey: string | null, signal: AbortSignal): Promise<Section<MonitorSummary>> {
  if (!HOSTED && !apiKey) return { status: 'empty', reason: NO_KEY_REASON };
  try {
    const response = HOSTED
      ? await proxyGet<MonitorListResponse>({ resource: 'monitors' }, signal)
      : await instanceClient(apiKey).listMonitors(signal);
    return {
      status: 'ok',
      items: response.monitors.map((m) => ({
        id: m.id,
        url: m.url,
        status: m.status,
        schedule: m.schedule.every ?? m.schedule.cron,
        lastChangeAt: m.lastChangeAt,
      })),
    };
  } catch (err) {
    return { status: 'unavailable', reason: reasonOf(err) };
  }
}

async function loadJobs(apiKey: string | null, jobIds: readonly string[], signal: AbortSignal): Promise<Section<JobSummary>> {
  if (jobIds.length === 0) return { status: 'empty', reason: NO_JOBS_REASON };
  if (!HOSTED && !apiKey) return { status: 'empty', reason: NO_KEY_REASON };

  const settled = await Promise.allSettled(
    jobIds.map(async (id) => (HOSTED ? proxyGet<Job>({ resource: 'job', id }, signal) : instanceClient(apiKey).job(id, signal))),
  );
  const items = settled
    .filter((s): s is PromiseFulfilledResult<Job> => s.status === 'fulfilled')
    .map(({ value }) => ({ id: value.id, status: value.status ?? 'unknown', type: value.type, completed: value.completed, total: value.total }));
  if (items.length > 0) return { status: 'ok', items };

  const first = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
  return { status: 'unavailable', reason: first ? reasonOf(first.reason) : 'No job answered.' };
}

const NO_KEY_REASON = 'No API key saved in this browser.';

function instanceClient(apiKey: string | null): HelixClient {
  if (!apiKey) throw new KeysError(NO_KEY_REASON, 401);
  return new HelixClient({ apiKey });
}

export async function loadInstanceData(apiKey: string | null, jobIds: readonly string[], signal: AbortSignal): Promise<InstanceData> {
  const [keys, monitors, jobs] = await Promise.all([loadKeys(apiKey, signal), loadMonitors(apiKey, signal), loadJobs(apiKey, jobIds, signal)]);
  return { keys, monitors, jobs };
}
