import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { deleteConnection, setAgentMayUse } from '@/lib/github';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const notConfigured = () => NextResponse.json(
  { error: 'not_configured', message: 'No Supabase project configured for local dev.' },
  { status: 400 },
);

/** Toggles whether a RUN may act with this connection. Separate from
    connecting, and never re-granted implicitly by reconnecting. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  if (!supabaseConfigured()) return notConfigured();

  const body = await request.json().catch(() => ({}));
  if (typeof body.agentMayUse !== 'boolean') {
    return NextResponse.json(
      { error: 'bad_request', message: 'agentMayUse must be a boolean.' },
      { status: 400 },
    );
  }

  const ok = await setAgentMayUse(profile.id, id, body.agentMayUse);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  if (!supabaseConfigured()) return notConfigured();

  const ok = await deleteConnection(profile.id, id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
