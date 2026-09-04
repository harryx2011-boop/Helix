import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { decryptApiKey, encryptApiKey, generateApiKey, hashApiKey, keyPrefix } from '@/lib/keys';
import type { ApiKeyRow, ProfileRow } from '@/lib/supabase/types';

export interface EnsureProfileInput {
  clerkUserId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export async function ensureProfile(input: EnsureProfileInput): Promise<ProfileRow> {
  const admin = supabaseAdmin();

  const { data: existing, error: findError } = await admin
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', input.clerkUserId)
    .maybeSingle<ProfileRow>();
  if (findError) throw findError;
  if (existing) return existing;

  const { data: created, error: insertError } = await admin
    .from('profiles')
    .insert({
      clerk_user_id: input.clerkUserId,
      email: input.email,
      name: input.name ?? null,
      avatar_url: input.avatarUrl ?? null,
    })
    .select('*')
    .single<ProfileRow>();
  if (insertError) throw insertError;
  return created;
}

export async function ensureProfileForCurrentUser(): Promise<ProfileRow | null> {
  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  return ensureProfile({
    clerkUserId: user.id,
    email,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
    avatarUrl: user.imageUrl ?? null,
  });
}

export interface CreateApiKeyInput {
  profileId: string;
  name: string;
  rateLimit?: number;
}

export interface CreatedApiKey {
  key: string;
  row: ApiKeyRow;
}

export async function createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
  const key = generateApiKey();
  const { data, error } = await supabaseAdmin()
    .from('api_keys')
    .insert({
      name: input.name,
      key_hash: hashApiKey(key),
      key_prefix: keyPrefix(key),
      rate_limit: input.rateLimit ?? 1000,
      profile_id: input.profileId,
    })
    .select('*')
    .single<ApiKeyRow>();
  if (error) throw error;

  return { key, row: data };
}

/**
 * The keys a user owns, minus the one the proxy routes use on their behalf.
 * Listing that key offers a Revoke button that silently breaks the hosted
 * playground, agent and provider settings — and orphans every BYOK credential
 * stored against it, since `provider_keys` is keyed on `api_key_id`. Filtered
 * on id rather than name so the name is not load-bearing.
 */
export async function listApiKeys(profileId: string, excludeId?: string | null): Promise<ApiKeyRow[]> {
  const query = supabaseAdmin()
    .from('api_keys')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  const { data, error } = await (excludeId ? query.neq('id', excludeId) : query);
  if (error) throw error;
  return data ?? [];
}

export async function revokeApiKey(profileId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('profile_id', profileId)
    .is('revoked_at', null)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** PostgREST's wire format for bytea: `\x` followed by hex. */
function byteaToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/^\\x/, ''), 'hex');
}

function bufferToBytea(value: Buffer): string {
  return `\\x${value.toString('hex')}`;
}

/**
 * The cached key, or null when there is no usable one.
 *
 * The cache is verified rather than trusted: a user who revokes the key (or an
 * operator who rotates HELIX_KEY_ENCRYPTION_KEY) would otherwise leave a
 * populated cache that decrypts to a dead credential, and every proxy call
 * would 401 forever because the mint branch is never reached again. Both cases
 * are treated as a miss so the caller re-mints.
 */
async function readCachedDashboardKey(profile: ProfileRow): Promise<string | null> {
  if (!profile.dashboard_key_ciphertext || !profile.dashboard_key_iv) return null;

  if (profile.dashboard_key_id) {
    const { data } = await supabaseAdmin()
      .from('api_keys')
      .select('id')
      .eq('id', profile.dashboard_key_id)
      .is('revoked_at', null)
      .maybeSingle();
    if (!data) return null;
  }

  try {
    return decryptApiKey(byteaToBuffer(profile.dashboard_key_ciphertext), byteaToBuffer(profile.dashboard_key_iv));
  } catch {
    return null;
  }
}

/**
 * The key the proxy routes call the Helix API with on a profile's behalf
 * (0006_dashboard_keys.sql). Minted once per profile and cached encrypted —
 * every other caller in this app either has its own key already (self-host)
 * or never needs one (marketing, onboarding), so this is the only place a
 * plaintext Helix key exists outside the moment a user-visible key is created.
 */
export async function resolveDashboardApiKey(profile: ProfileRow): Promise<string> {
  const cached = await readCachedDashboardKey(profile);
  if (cached) return cached;

  const { key, row } = await createApiKey({ profileId: profile.id, name: 'Dashboard (internal)' });
  const { ciphertext, iv } = encryptApiKey(key);

  // Conditional on the cache still being empty: the hosted app fires several
  // calls on mount, and an unconditional last-write-wins update let each of
  // them mint a live key while retaining only one — the losers were orphaned
  // credentials that nothing revoked and the filtered listing above would
  // never show.
  const { data: won, error } = await supabaseAdmin()
    .from('profiles')
    .update({
      dashboard_key_id: row.id,
      dashboard_key_ciphertext: bufferToBytea(ciphertext),
      dashboard_key_iv: bufferToBytea(iv),
    })
    .eq('id', profile.id)
    .is('dashboard_key_id', null)
    .select('id');

  if (!error && (won?.length ?? 0) === 0) {
    // Another request won the race. Drop ours rather than leaving it live, and
    // use the winner's.
    await revokeApiKey(profile.id, row.id).catch(() => undefined);
    const { data: fresh } = await supabaseAdmin()
      .from('profiles')
      .select('*')
      .eq('id', profile.id)
      .maybeSingle();
    const winner = fresh ? await readCachedDashboardKey(fresh as ProfileRow) : null;
    if (winner) return winner;
    throw new Error('dashboard key was claimed concurrently but could not be read back');
  }
  // The key is live in api_keys either way, so the request that triggered this
  // still works. But an uncached key is re-minted on the NEXT call too, and a
  // persistently failing cache write would leave a trail of live orphans that
  // nothing revokes — so revoke this one and fail, rather than leak keys once
  // per request.
  if (error) {
    console.error('[profiles] failed to cache dashboard key', { code: error.code, message: error.message });
    await revokeApiKey(profile.id, row.id).catch(() => undefined);
    throw error;
  }

  return key;
}
