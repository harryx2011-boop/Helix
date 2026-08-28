import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { listApiKeys, byteaToBuffer } from '@/lib/profiles';
import { decryptApiKey } from '@/lib/keys';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** GET /api/app/keys/{id}/reveal — decrypts and returns the full key. `id` may be the literal "default" for the profile's first active key. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();

  if (!supabaseConfigured()) {
    return NextResponse.json(
      {
        error: 'not_configured',
        message: 'Key storage is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.',
      },
      { status: 400 },
    );
  }

  const keys = await listApiKeys(profile.id);
  const row = id === 'default' ? keys.find((k) => !k.revoked_at) ?? keys[0] : keys.find((k) => k.id === id);

  if (!row) {
    return NextResponse.json({ error: 'not_found', message: 'Key not found.' }, { status: 404 });
  }

  const key = decryptApiKey(byteaToBuffer(row.key_ciphertext), byteaToBuffer(row.key_iv));
  return NextResponse.json({ key });
}
