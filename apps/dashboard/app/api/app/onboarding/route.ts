import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { Endpoint } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

interface OnboardingBody {
  role?: string | null;
  use_cases?: string[];
  llm_provider?: string | null;
  deploy_intent?: string | null;
  selected_endpoints: Endpoint[];
  complete: boolean;
}

/** Saves onboarding answers and, on the final step, marks onboarding complete (WEBSITE.md §6.2). */
export async function POST(req: Request) {
  const profile = await requireProfile();
  const body = (await req.json()) as OnboardingBody;

  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: true, redirect: '/app' });
  }

  const update: Record<string, unknown> = {
    role: body.role ?? null,
    use_cases: body.use_cases ?? [],
    llm_provider: body.llm_provider ?? null,
    deploy_intent: body.deploy_intent ?? null,
    selected_endpoints: body.selected_endpoints ?? [],
  };
  if (body.complete) update.onboarding_completed_at = new Date().toISOString();

  const { error } = await supabaseAdmin().from('profiles').update(update).eq('id', profile.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, redirect: '/app' });
}
