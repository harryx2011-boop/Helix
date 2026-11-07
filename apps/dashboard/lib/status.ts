import { resolveBaseUrl } from './api';
import { HOSTED } from './mode';

const STORAGE_KEY = 'helix.statusInstanceUrl';

export function getStoredInstanceUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

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

export function resolveStatusApiUrl(stored: string | null): string | null {
  if (!HOSTED) return resolveBaseUrl().replace(/\/v1$/, '');
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
