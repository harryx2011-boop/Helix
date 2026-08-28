import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { listApiKeys, createApiKey } from '@/lib/profiles';
import { maskApiKey } from '@/lib/keys';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await requireProfile();

  if (!supabaseConfigured()) {
    return NextResponse.json({ keys: [], storageConfigured: false });
  }

  const keys = await listApiKeys(profile.id);
  return NextResponse.json({
    storageConfigured: true,
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
    return NextResponse.json(
      {
        error: 'not_configured',
        message:
          'Key storage is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY, or create keys directly on your instance with POST /v1/keys.',
      },
      { status: 400 },
    );
  }

  const { key, row } = await createApiKey({ profileId: profile.id, name, rateLimitPerMin });
  return NextResponse.json({ key, id: row.id, name: row.name });
}
