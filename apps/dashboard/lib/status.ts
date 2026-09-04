import { HOSTED, PUBLIC_API_URL } from './mode';

const STORAGE_KEY = 'helix.statusInstanceUrl';

/**
 * Hosted mode ships with no instance behind it — `PUBLIC_API_URL` is only a
 * localhost default meant for self-host dev. The status page instead lets a
 * viewer point it at their own deployment, remembered per-browser the same
 * way `lib/auth.ts` remembers the API key.
 */
export function getStoredInstanceUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

/** An http(s) origin plus path with no trailing slash, or null when the input is not a fetchable URL. */
export function normalizeInstanceUrl(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
}

export function setStoredInstanceUrl(url: string): void {
  window.localStorage.setItem(STORAGE_KEY, url);
}

/** The API base the status page should poll, or null when hosted mode has no instance configured. */
export function resolveStatusApiUrl(stored: string | null): string | null {
  if (!HOSTED) return PUBLIC_API_URL;
  return stored;
}

export type { HealthService, HealthResponse, DayBucket, ServiceHistory, StatusHistoryResponse } from './api';

export const SERVICE_LABELS: Record<string, string> = {
  api: 'API',
  postgres: 'Postgres',
  fetch: 'Fetch',
  extract: 'Extract',
  browser: 'Browser',
  lightpanda: 'Lightpanda',
};

export function serviceLabel(service: string): string {
  return SERVICE_LABELS[service] ?? service;
}
