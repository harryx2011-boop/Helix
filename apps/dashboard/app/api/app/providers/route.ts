import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase/server';
import { listApiKeys, byteaToBuffer } from '@/lib/profiles';
import { decryptApiKey } from '@/lib/keys';
import { HOSTED_API_URL } from '@/lib/mode';

export const dynamic = 'force-dynamic';

/** Resolves the profile's default (first non-revoked) key, decrypted. Self-host falls back to a bootstrap key. */
async function resolveApiKey(profileId: string): Promise<string> {
  if (!supabaseConfigured()) return process.env.HELIX_BOOTSTRAP_KEY ?? '';
  const keys = await listApiKeys(profileId);
  const active = keys.find((k) => !k.revoked_at);
  if (!active) return process.env.HELIX_BOOTSTRAP_KEY ?? '';
  return decryptApiKey(byteaToBuffer(active.key_ciphertext), byteaToBuffer(active.key_iv));
}

export async function GET(): Promise<NextResponse> {
  const profile = await requireProfile();
  const apiKey = await resolveApiKey(profile.id);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${HOSTED_API_URL}/v1/providers`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        failure: {
          reason: 'service_unavailable',
          message: error instanceof Error ? error.message : 'Upstream request failed.',
        },
      },
      { status: 502 },
    );
  }

  const upstreamBody = await upstreamResponse.json().catch(() => ({ success: false }));
  return NextResponse.json(upstreamBody, { status: upstreamResponse.status });
}
