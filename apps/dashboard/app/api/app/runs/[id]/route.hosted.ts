import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { RunRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const profile = await requireProfile();
  const { id } = await params;

  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'not_found', message: 'Run not found.' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin()
    .from('runs')
    .select('*')
    .eq('profile_id', profile.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return NextResponse.json({ error: 'not_found', message: 'Run not found.' }, { status: 404 });

  return NextResponse.json(data as RunRow);
}
