import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateApiKey, hashApiKey, keyPrefix } from '@/lib/keys';
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

export async function listApiKeys(profileId: string): Promise<ApiKeyRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('api_keys')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
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
