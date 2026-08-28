import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await requireProfile();
  return NextResponse.json({ profile });
}

/** PATCH /api/app/profile — currently only the monthly budget is editable here; onboarding answers are owned by /api/app/onboarding. */
export async function PATCH(request: Request) {
  const profile = await requireProfile();
  const body = await request.json().catch(() => ({}));

  if (!('monthlyBudgetUsd' in body)) {
    return NextResponse.json({ error: 'bad_request', message: 'monthlyBudgetUsd is required.' }, { status: 400 });
  }

  const monthlyBudgetUsd = body.monthlyBudgetUsd === null ? null : Number(body.monthlyBudgetUsd);
  if (monthlyBudgetUsd !== null && (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0)) {
    return NextResponse.json({ error: 'bad_request', message: 'monthlyBudgetUsd must be a non-negative number or null.' }, { status: 400 });
  }

  if (!supabaseConfigured()) {
    return NextResponse.json({ profile: { ...profile, monthly_budget_usd: monthlyBudgetUsd } });
  }

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .update({ monthly_budget_usd: monthlyBudgetUsd })
    .eq('id', profile.id)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: 'update_failed', message: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

/** DELETE /api/app/profile — removes the Supabase profile (cascades to keys/instances/runs) then the Clerk user, so nothing outlives the account. */
export async function DELETE() {
  const profile = await requireProfile();

  if (supabaseConfigured()) {
    const { error } = await supabaseAdmin().from('profiles').delete().eq('id', profile.id);
    if (error) {
      return NextResponse.json({ error: 'delete_failed', message: error.message }, { status: 500 });
    }
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(profile.clerk_user_id);
  } catch {
    // Supabase row is already gone; a stray Clerk user with no profile is safe and can be cleaned up manually.
  }

  return NextResponse.json({ ok: true });
}
