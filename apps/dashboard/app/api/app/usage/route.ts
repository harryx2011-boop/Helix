import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { UsageDailyRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(dayKey(d));
  }
  return days;
}

export async function GET(request: Request): Promise<NextResponse> {
  const profile = await requireProfile();
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 30));
  const labels = lastNDays(days);

  if (!supabaseConfigured()) {
    return NextResponse.json({
      labels,
      requests: labels.map(() => 0),
      costUsd: labels.map(() => 0),
      byEndpoint: [],
    });
  }

  const since = labels[0];
  const { data, error } = await supabaseAdmin()
    .from('usage_daily')
    .select('*')
    .eq('profile_id', profile.id)
    .gte('day', since)
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

  return NextResponse.json({
    labels,
    requests: labels.map((day) => requestsByDay.get(day) ?? 0),
    costUsd: labels.map((day) => Number((costByDay.get(day) ?? 0).toFixed(4))),
    byEndpoint: Array.from(byEndpointMap.values()).sort((a, b) => b.requests - a.requests),
  });
}
