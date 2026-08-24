import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { listApiKeys, revokeApiKey } from '@/lib/profiles';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();

  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'not_configured', message: 'No Supabase project configured for local dev.' }, { status: 400 });
  }

  const keys = await listApiKeys(profile.id);
  const active = keys.filter((k) => !k.revoked_at);
  if (active.length <= 1 && active.some((k) => k.id === id)) {
    return NextResponse.json({ error: 'last_key', message: 'The last remaining key cannot be revoked.' }, { status: 400 });
  }

  await revokeApiKey(profile.id, id);
  return NextResponse.json({ ok: true });
}
