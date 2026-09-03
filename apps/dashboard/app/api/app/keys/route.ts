import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfigured } from '@/lib/supabase/server';
import { createApiKey, ensureProfileForCurrentUser, listApiKeys, revokeApiKey } from '@/lib/profiles';
import type { ApiKeyRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

function toKeyJson(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    rateLimit: row.rate_limit,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const profile = await ensureProfileForCurrentUser();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await listApiKeys(profile.id);
  return NextResponse.json({ keys: rows.map(toKeyJson) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const profile = await ensureProfileForCurrentUser();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: string; rateLimit?: number } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { key, row } = await createApiKey({
    profileId: profile.id,
    name,
    ...(body?.rateLimit ? { rateLimit: body.rateLimit } : {}),
  });

  return NextResponse.json(
    {
      id: row.id,
      name: row.name,
      key,
      keyPrefix: row.key_prefix,
      rateLimit: row.rate_limit,
      createdAt: row.created_at,
    },
    { status: 201 },
  );
}

/** Revoke by `?id=`. A `[id]` segment here trips Vercel's builder on a missing client-reference manifest for the dynamic route, so the id travels in the query. */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const profile = await ensureProfileForCurrentUser();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const revoked = await revokeApiKey(profile.id, id);
  if (!revoked) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
