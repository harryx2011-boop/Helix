import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { listConnections, githubConfigured } from '@/lib/github';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await requireProfile();
  if (!supabaseConfigured()) {
    return NextResponse.json({ connections: [], configured: githubConfigured() });
  }
  const connections = await listConnections(profile.id);
  return NextResponse.json({ connections, configured: githubConfigured() });
}
