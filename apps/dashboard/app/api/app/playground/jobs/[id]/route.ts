import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { byteaToBuffer, listApiKeys } from '@/lib/profiles';
import { decryptApiKey } from '@/lib/keys';
import { supabaseConfigured } from '@/lib/supabase/server';
import { HOSTED_API_URL } from '@/lib/mode';

export const dynamic = 'force-dynamic';

async function resolveApiKey(profileId: string): Promise<string> {
  if (!supabaseConfigured()) return process.env.HELIX_BOOTSTRAP_KEY ?? '';
  const keys = await listApiKeys(profileId);
  const active = keys.find((k) => !k.revoked_at);
  if (!active) return process.env.HELIX_BOOTSTRAP_KEY ?? '';
  return decryptApiKey(byteaToBuffer(active.key_ciphertext), byteaToBuffer(active.key_iv));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const profile = await requireProfile();
  const { id } = await params;
  const apiKey = await resolveApiKey(profile.id);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${HOSTED_API_URL}/v1/jobs/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'service_unavailable', message: error instanceof Error ? error.message : 'Upstream request failed.' },
      { status: 502 },
    );
  }

  const upstreamBody = await upstreamResponse.json().catch(() => ({}));
  return NextResponse.json(upstreamBody, { status: upstreamResponse.status });
}
