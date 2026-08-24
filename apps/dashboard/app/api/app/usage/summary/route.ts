import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { UsageDailyRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function GET(): Promise<NextResponse> {
  const profile = await requireProfile();

  if (!supabaseConfigured()) {
    return NextResponse.json({ monthToDateUsd: 0, requests: 0, budgetUsd: profile.monthly_budget_usd ?? null });
  }

  const { data, error } = await supabaseAdmin()
    .from('usage_daily')
    .select('*')
    .eq('profile_id', profile.id)
    .gte('day', monthStart());
  if (error) throw error;

  const rows = (data as UsageDailyRow[]) ?? [];
  const monthToDateUsd = rows.reduce((sum, r) => sum + Number(r.est_provider_cost_usd), 0);
  const requests = rows.reduce((sum, r) => sum + r.requests, 0);

  return NextResponse.json({
    monthToDateUsd: Number(monthToDateUsd.toFixed(4)),
    requests,
    budgetUsd: profile.monthly_budget_usd ?? null,
  });
}
