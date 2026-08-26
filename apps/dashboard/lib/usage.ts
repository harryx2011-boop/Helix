import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { UsageDailyRow } from '@/lib/supabase/types';

export interface UsageSeries {
  labels: string[];
  requests: number[];
  costUsd: number[];
  byEndpoint: { endpoint: string; requests: number; costUsd: number }[];
}

export function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export function emptyUsageSeries(days: number): UsageSeries {
  const labels = lastNDays(days);
  return { labels, requests: labels.map(() => 0), costUsd: labels.map(() => 0), byEndpoint: [] };
}

export async function fetchUsageSeries(profileId: string, days: number): Promise<UsageSeries> {
  const labels = lastNDays(days);
  if (!supabaseConfigured()) return emptyUsageSeries(days);

  const { data, error } = await supabaseAdmin()
    .from('usage_daily')
    .select('*')
    .eq('profile_id', profileId)
    .gte('day', labels[0])
    .order('day', { ascending: true });
  if (error) throw error;

  const rows = (data as UsageDailyRow[]) ?? [];
  const requestsByDay = new Map<string, number>();
  const costByDay = new Map<string, number>();
  const byEndpointMap = new Map<string, { endpoint: string; requests: number; costUsd: number }>();

  for (const row of rows) {
    const day = row.day.slice(0, 10);
    requestsByDay.set(day, (requestsByDay.get(day) ?? 0) + row.requests);
    costByDay.set(day, (costByDay.get(day) ?? 0) + Number(row.est_provider_cost_usd));

    const existing = byEndpointMap.get(row.endpoint) ?? { endpoint: row.endpoint, requests: 0, costUsd: 0 };
    existing.requests += row.requests;
    existing.costUsd += Number(row.est_provider_cost_usd);
    byEndpointMap.set(row.endpoint, existing);
  }

  return {
    labels,
    requests: labels.map((day) => requestsByDay.get(day) ?? 0),
    costUsd: labels.map((day) => Number((costByDay.get(day) ?? 0).toFixed(4))),
    byEndpoint: Array.from(byEndpointMap.values()).sort((a, b) => b.requests - a.requests),
  };
}
