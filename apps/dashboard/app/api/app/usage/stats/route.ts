import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { RunRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

const RUN_SCAN_LIMIT = 2000;

export async function GET(): Promise<NextResponse> {
  const profile = await requireProfile();

  if (!supabaseConfigured()) {
    return NextResponse.json({
      byEndpoint: [],
      successRate: 0,
      totalRuns: 0,
      tierDistribution: [],
      spendByProvider: [],
    });
  }

  const { data, error } = await supabaseAdmin()
    .from('runs')
    .select('*')
    .eq('profile_id', profile.id)
    .order('started_at', { ascending: false })
    .limit(RUN_SCAN_LIMIT);
  if (error) throw error;

  const runs = (data as RunRow[]) ?? [];
  const byEndpointMap = new Map<string, { endpoint: string; total: number; success: number }>();
  const tierMap = new Map<string, number>();
  const providerMap = new Map<string, number>();
  let successCount = 0;

  for (const run of runs) {
    const e = byEndpointMap.get(run.endpoint) ?? { endpoint: run.endpoint, total: 0, success: 0 };
    e.total += 1;
    if (run.status === 'success') e.success += 1;
    byEndpointMap.set(run.endpoint, e);

    if (run.status === 'success') successCount += 1;

    if (run.tier_resolved) tierMap.set(run.tier_resolved, (tierMap.get(run.tier_resolved) ?? 0) + 1);

    const provider = run.provider ?? 'unknown';
    providerMap.set(provider, (providerMap.get(provider) ?? 0) + Number(run.est_provider_cost_usd));
  }

  return NextResponse.json({
    totalRuns: runs.length,
    successRate: runs.length > 0 ? Number((successCount / runs.length).toFixed(4)) : 0,
    byEndpoint: Array.from(byEndpointMap.values()).sort((a, b) => b.total - a.total),
    tierDistribution: Array.from(tierMap.entries()).map(([tier, count]) => ({ tier, count })),
    spendByProvider: Array.from(providerMap.entries())
      .map(([provider, costUsd]) => ({ provider, costUsd: Number(costUsd.toFixed(4)) }))
      .sort((a, b) => b.costUsd - a.costUsd),
  });
}
