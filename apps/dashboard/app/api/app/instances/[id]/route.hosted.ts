import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const profile = await requireProfile();
  const { id } = await params;

  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin().from('instances').delete().eq('profile_id', profile.id).eq('id', id);
  if (error) throw error;

  return NextResponse.json({ ok: true });
}
