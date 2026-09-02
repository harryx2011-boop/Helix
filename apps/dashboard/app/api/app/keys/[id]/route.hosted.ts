import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfileForCurrentUser, revokeApiKey } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const profile = await ensureProfileForCurrentUser();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const revoked = await revokeApiKey(profile.id, id);
  if (!revoked) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
