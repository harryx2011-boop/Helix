'use client';

import * as React from 'react';
import type { Endpoint } from './endpoints';

/**
 * The playground is stateless by design; this is the one thing it remembers,
 * per browser: which endpoint ran against which URL, and when. Never a
 * response body and never a key. Enough for the palette to jump back, and
 * for an async run, enough to look the job up again.
 */
export interface RecentRun {
  endpoint: Endpoint;
  url: string;
  at: string;
  id?: string;
}

const STORAGE_KEY = 'helix.app.recentRuns';
const CAP = 20;
const EMPTY: readonly RecentRun[] = [];

let snapshot: readonly RecentRun[] | null = null;
const listeners = new Set<() => void>();

function isRun(value: unknown): value is RecentRun {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.endpoint === 'string' && typeof v.url === 'string' && typeof v.at === 'string';
}

function read(): readonly RecentRun[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRun).slice(0, CAP) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(runs: readonly RecentRun[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // Storage disabled: the run still happened, it just is not remembered.
  }
  snapshot = runs;
  for (const listener of listeners) listener();
}

function getSnapshot(): readonly RecentRun[] {
  snapshot ??= read();
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== STORAGE_KEY) return;
    snapshot = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function recordRun(run: Omit<RecentRun, 'at'>): void {
  const rest = getSnapshot().filter((r) => !(r.endpoint === run.endpoint && r.url === run.url));
  write([{ ...run, at: new Date().toISOString() }, ...rest].slice(0, CAP));
}

export function clearRecentRuns(): void {
  write(EMPTY);
}

/** The URL (or search query) a playground request was about; undefined for a bare file upload. */
export function subjectOf(body: Record<string, unknown> | FormData): string | undefined {
  const value = body instanceof FormData ? body.get('url') : (body.url ?? body.query);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function useRecentRuns(): readonly RecentRun[] {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
