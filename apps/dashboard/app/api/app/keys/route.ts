import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import { createApiKey, DASHBOARD_KEY_NAME, ensureProfileForCurrentUser, listApiKeys, revokeApiKey } from '@/lib/profiles';
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

/**
 * Supabase errors arrive as bare throws from lib/profiles, and an uncaught
 * throw in a route handler is an opaque 500 with nothing in the response and
 * nothing useful in the log. Every handler routes failures through here so the
 * cause is recorded server-side and the caller gets a status that says which
 * side is at fault.
 */
type Postgrestish = { code?: string; message?: string; details?: string; hint?: string };

function failed(op: string, err: unknown): NextResponse {
  const e = (err ?? {}) as Postgrestish;
  console.error(`[keys] ${op} failed`, {
    code: e.code,
    message: e.message ?? String(err),
    details: e.details,
    hint: e.hint,
  });

  // 42P01 unknown table, 42501 RLS denial, 28P01 bad credentials: the key store
  // is misconfigured, not the request.
  if (e.code && ['42P01', '42501', '28P01', '3D000'].includes(e.code)) {
    return NextResponse.json(
      { error: 'key_store_unavailable', message: 'The key store rejected the request.' },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: 'key_store_error', message: 'Could not reach the key store.' },
    { status: 502 },
  );
}

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const rows = await listApiKeys(profile.id);
    return NextResponse.json({ keys: rows.map(toKeyJson) });
  } catch (err) {
    return failed('list', err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { name?: string; rateLimit?: number } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  let key: string;
  let row: ApiKeyRow;
  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    ({ key, row } = await createApiKey({
      profileId: profile.id,
      name,
      ...(body?.rateLimit ? { rateLimit: body.rateLimit } : {}),
    }));
  } catch (err) {
    return failed('create', err);
  }

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

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // The listing hides these, but a tab opened before that landed still offers
    // a Revoke button — and revoking the live one breaks the hosted playground,
    // agent and provider settings with no path back. Checked by name, since an
    // unlinked internal key is exactly the case an id check misses.
    const { data: target } = await supabaseAdmin()
      .from('api_keys')
      .select('name')
      .eq('id', id)
      .eq('profile_id', profile.id)
      .maybeSingle();
    if (target?.name === DASHBOARD_KEY_NAME) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const revoked = await revokeApiKey(profile.id, id);
    if (!revoked) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (err) {
    return failed('revoke', err);
  }

  return new NextResponse(null, { status: 204 });
}
