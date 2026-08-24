import 'server-only';
import { supabaseAdmin, supabaseConfigured } from './supabase/server';
import type { ProfileRow, ApiKeyRow } from './supabase/types';
import { decryptApiKey, encryptApiKey, generateApiKey, hashApiKey, keyLast3, keyPrefix } from './keys';

/** Find or create the profile for a Clerk user. Idempotent; safe from the webhook and from first request. */
export async function ensureProfile(input: { clerkUserId: string; email: string; name?: string | null; avatarUrl?: string | null }): Promise<ProfileRow> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from('profiles').select('*').eq('clerk_user_id', input.clerkUserId).maybeSingle();
  if (existing) return existing as ProfileRow;

  const { data, error } = await db
    .from('profiles')
    .insert({ clerk_user_id: input.clerkUserId, email: input.email, name: input.name ?? null, avatar_url: input.avatarUrl ?? null })
    .select('*')
    .single();
  if (error) throw error;
  const profile = data as ProfileRow;
  await createApiKey({ profileId: profile.id, name: 'Default' });
  return profile;
}

export async function getProfileByClerkId(clerkUserId: string): Promise<ProfileRow | null> {
  if (!supabaseConfigured()) return null;
  const { data } = await supabaseAdmin().from('profiles').select('*').eq('clerk_user_id', clerkUserId).maybeSingle();
  return (data as ProfileRow) ?? null;
}

/** Mints a `helix-…` key, stores hash + ciphertext, returns the plaintext exactly once. */
export async function createApiKey(input: { profileId: string; name: string; rateLimitPerMin?: number | null }): Promise<{ key: string; row: ApiKeyRow }> {
  const key = generateApiKey();
  const { ciphertext, iv } = encryptApiKey(key);
  if (!supabaseConfigured()) {
    return { key, row: { ...localStubKey(input.profileId), id: `local-${Date.now()}`, name: input.name, prefix: keyPrefix(key), last3: keyLast3(key), key_hash: hashApiKey(key), key_ciphertext: `\\x${ciphertext.toString('hex')}`, key_iv: `\\x${iv.toString('hex')}`, created_at: new Date().toISOString() } };
  }
  const { data, error } = await supabaseAdmin()
    .from('api_keys')
    .insert({
      profile_id: input.profileId,
      name: input.name,
      prefix: keyPrefix(key),
      last3: keyLast3(key),
      key_hash: hashApiKey(key),
      key_ciphertext: `\\x${ciphertext.toString('hex')}`,
      key_iv: `\\x${iv.toString('hex')}`,
      rate_limit_per_min: input.rateLimitPerMin ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  await syncKeyToHostedApi(key, input.name, input.rateLimitPerMin ?? null).catch(() => undefined);
  return { key, row: data as ApiKeyRow };
}

/**
 * Local-dev stand-in when Supabase is not configured: one deterministic key so
 * every page renders. The key is never valid against a real API.
 */
const LOCAL_KEY = 'helix-LOCALDEVKEY00001';
function localStubKey(profileId: string): ApiKeyRow {
  const { ciphertext, iv } = encryptApiKey(LOCAL_KEY);
  return {
    id: 'local-default', profile_id: profileId, name: 'Default', prefix: keyPrefix(LOCAL_KEY), last3: keyLast3(LOCAL_KEY),
    key_hash: hashApiKey(LOCAL_KEY), key_ciphertext: `\\x${ciphertext.toString('hex')}`, key_iv: `\\x${iv.toString('hex')}`,
    rate_limit_per_min: null, last_used_at: null, created_at: new Date(0).toISOString(), revoked_at: null,
  };
}

export async function listApiKeys(profileId: string): Promise<ApiKeyRow[]> {
  if (!supabaseConfigured()) return [localStubKey(profileId)];
  const { data } = await supabaseAdmin().from('api_keys').select('*').eq('profile_id', profileId).order('created_at', { ascending: true });
  return (data as ApiKeyRow[]) ?? [];
}

export async function revokeApiKey(profileId: string, keyId: string): Promise<void> {
  if (!supabaseConfigured()) return;
  const db = supabaseAdmin();
  const { data: row } = await db.from('api_keys').select('*').eq('id', keyId).eq('profile_id', profileId).maybeSingle();
  const { error } = await db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', keyId).eq('profile_id', profileId);
  if (error) throw error;
  if (row) {
    const r = row as ApiKeyRow;
    const key = decryptApiKey(byteaToBuffer(r.key_ciphertext), byteaToBuffer(r.key_iv));
    await hostedApiRequest('DELETE', { key }).catch(() => undefined);
  }
}

/** Postgres bytea comes back as `\xHEX` text through PostgREST. */
export function byteaToBuffer(value: string): Buffer {
  return Buffer.from(value.startsWith('\\x') ? value.slice(2) : value, 'hex');
}

/**
 * The hosted API validates keys by SHA-256 lookup in its own table (WEBSITE.md §8).
 * Mirror the key there through the internal admin endpoint; a failure here is
 * logged by the caller, never surfaced to the user, and retried on next use.
 */
async function syncKeyToHostedApi(key: string, name: string, rateLimitPerMin: number | null): Promise<void> {
  await hostedApiRequest('POST', { key, name, rateLimitPerMin });
}

async function hostedApiRequest(method: 'POST' | 'DELETE', body: Record<string, unknown>): Promise<void> {
  const base = process.env.HELIX_HOSTED_API_URL;
  const token = process.env.HELIX_INTERNAL_ADMIN_TOKEN;
  if (!base || !token) return;
  const res = await fetch(`${base}/internal/keys`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`hosted API key sync failed: ${res.status}`);
}
