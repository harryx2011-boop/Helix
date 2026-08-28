import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface HealthResultBody {
  status: string;
  version?: string;
  services?: Record<string, unknown>;
  providers?: Record<string, unknown>;
  error?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const profile = await requireProfile();
  const { id } = await params;
  const body = (await request.json()) as HealthResultBody;

  const lastHealth = { ...body, checkedAt: new Date().toISOString() };

  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: true, last_health: lastHealth });
  }

  const { error } = await supabaseAdmin()
    .from('instances')
    .update({ last_health: lastHealth, last_checked_at: lastHealth.checkedAt })
    .eq('profile_id', profile.id)
    .eq('id', id);
  if (error) throw error;

  return NextResponse.json({ ok: true, last_health: lastHealth });
}
