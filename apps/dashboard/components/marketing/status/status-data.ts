'use client';

import * as React from 'react';
import { fetchHealth, fetchStatusHistory } from '@/lib/api';
import type { HealthResponse, ServiceHistory, StatusHistoryResponse } from '@/lib/status';

/*
 * The data layer both status surfaces share: the public /status page and the
 * operator's /app/self-host/health screen poll the same two open routes and
 * derive the same rows, so the polling, ordering and incident maths live here
 * once and each page only decides how to paint them.
 */

export const HEALTH_POLL_MS = 30_000;

export const SERVICE_ORDER = ['api', 'fetch', 'extract', 'postgres', 'browser', 'lightpanda'];

export type OverallState = HealthResponse['status'];

export function overallCopy(state: OverallState): { title: string; tone: string } {
  if (state === 'ok') return { title: 'All services are online', tone: 'text-success' };
  if (state === 'degraded') return { title: 'Some services are degraded', tone: 'text-warning' };
  return { title: 'Some services are down', tone: 'text-destructive' };
}

export function formatLastUpdated(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Fetches `/health` every 30s while the tab is visible; pauses in the
 * background rather than burning cycles on a hidden tab. Bumping `nonce`
 * restarts the loop, which is what a manual refresh is.
 */
export function useHealthPolling(
  baseUrl: string | null,
  nonce = 0,
): {
  health: HealthResponse | null;
  error: boolean;
  loading: boolean;
  fetching: boolean;
  lastUpdated: Date | null;
} {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [error, setError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  React.useEffect(() => {
    if (!baseUrl) {
      setLoading(false);
      return;
    }

    const base = baseUrl;
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== 'visible') return;
      const started = performance.now();
      setFetching(true);
      try {
        const body = await fetchHealth(base);
        if (cancelled) return;
        // `/health` reports its dependencies, not itself — the round trip of
        // this very request is the API row's own latency signal.
        body.services['api'] = { status: body.status, latencyMs: Math.round(performance.now() - started) };
        setHealth(body);
        setError(false);
        setLastUpdated(new Date());
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setFetching(false);
        }
      }
    }

    void poll();
    const id = setInterval(() => void poll(), HEALTH_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [baseUrl, nonce]);

  return { health, error, loading, fetching, lastUpdated };
}

export function useHistory(baseUrl: string | null, nonce = 0): { history: StatusHistoryResponse | null; error: boolean } {
  const [history, setHistory] = React.useState<StatusHistoryResponse | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!baseUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const body = await fetchStatusHistory(baseUrl, 90);
        if (cancelled) return;
        setHistory(body);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, nonce]);

  return { history, error };
}

export function indexHistory(history: StatusHistoryResponse | null): Map<string, ServiceHistory> {
  const map = new Map<string, ServiceHistory>();
  for (const s of history?.services ?? []) map.set(s.service, s);
  return map;
}

/** Known services in their fixed order, then anything else the instance reports, so a new dependency never goes unlisted. */
export function orderServices(health: HealthResponse | null, historyByService: Map<string, ServiceHistory>): string[] {
  const names = new Set<string>(SERVICE_ORDER);
  for (const key of Object.keys(health?.services ?? {})) names.add(key);
  for (const key of historyByService.keys()) names.add(key);
  return SERVICE_ORDER.filter((s) => names.has(s)).concat(Array.from(names).filter((s) => !SERVICE_ORDER.includes(s)));
}

/** Mean of the days that have samples, or null when none do yet. */
export function averageUptime(history: ServiceHistory | undefined): number | null {
  if (!history) return null;
  const withData = history.days.filter((d) => d.okPct !== null);
  if (withData.length === 0) return null;
  return withData.reduce((sum, d) => sum + (d.okPct ?? 0), 0) / withData.length;
}

export interface Incident {
  day: string;
  service: string;
  okPct: number;
}

export function collectIncidents(services: ServiceHistory[]): Incident[] {
  const incidents: Incident[] = [];
  for (const service of services) {
    for (const bucket of service.days) {
      if (bucket.okPct !== null && bucket.okPct < 95) {
        incidents.push({ day: bucket.day, service: service.service, okPct: bucket.okPct });
      }
    }
  }
  return incidents.sort((a, b) => (a.day < b.day ? 1 : -1));
}
