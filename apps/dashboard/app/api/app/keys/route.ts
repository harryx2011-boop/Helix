import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { listApiKeys, createApiKey } from '@/lib/profiles';
import { maskApiKey } from '@/lib/keys';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function localStubKeys() {
  return [
    {
      id: 'local-default',
      name: 'Default',
      prefix: 'helix-LOCA',
      last3: '001',
      masked: maskApiKey('helix-LOCA', '001'),
      rateLimitPerMin: null,
      lastUsedAt: null,
      createdAt: new Date(0).toISOString(),
      revoked: false,
    },
  ];
}

export async function GET() {
  const profile = await requireProfile();

  if (!supabaseConfigured()) {
    return NextResponse.json({ keys: localStubKeys() });
  }

  const keys = await listApiKeys(profile.id);
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      last3: k.last3,
      masked: maskApiKey(k.prefix, k.last3),
      rateLimitPerMin: k.rate_limit_per_min,
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at,
      revoked: Boolean(k.revoked_at),
    })),
  });
}

export async function POST(request: Request) {
  const profile = await requireProfile();
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'New key';
  const rateLimitPerMin = typeof body.rateLimitPerMin === 'number' ? body.rateLimitPerMin : null;

  if (!supabaseConfigured()) {
    return NextResponse.json({ key: 'helix-LOCALDEVKEY00001', id: 'local-default', name });
  }

  const { key, row } = await createApiKey({ profileId: profile.id, name, rateLimitPerMin });
  return NextResponse.json({ key, id: row.id, name: row.name });
}
