import { NextResponse } from 'next/server';
import { createShare, parseShareInput, SHARE_LIMITS } from '@/lib/share';
import { supabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/share`: freeze a fork (title, body, values, origin) into
 * `persona_shares` and return its token. 503 `not_configured` when the
 * deployment has no database, so the editor can hide the button rather than
 * fail on click.
 */
export async function POST(request: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > SHARE_LIMITS.body * 2) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const input = parseShareInput(raw);
  if (!input) {
    return NextResponse.json({ error: 'invalid_share' }, { status: 400 });
  }
  try {
    const token = await createShare(input);
    return NextResponse.json({ token, path: `/s/${token}` }, { status: 201 });
  } catch (err) {
    console.error('[persona] share insert failed', err);
    return NextResponse.json({ error: 'share_failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ configured: supabaseConfigured() });
}
