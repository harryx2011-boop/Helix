import 'server-only';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin, supabaseConfigured } from './supabase';

/**
 * Share links (PERSONA-REVAMP.md Track 1): a frozen copy of a fork's body and
 * values under a random token. Tokens are only ever resolved here, server
 * side; the browser cannot select `persona_shares` by token (RLS, 0002), so
 * the space cannot be enumerated. Shares are anonymous: `profile_id` stays
 * null because Persona has no accounts.
 */

export interface ShareInput {
  title: string;
  bodyMd: string;
  values: Record<string, string>;
  roleSlug: string;
  personaSlug: string;
  sourceVersion: number;
}

export interface Share extends ShareInput {
  token: string;
  createdAt: string;
}

export const SHARE_LIMITS = {
  title: 200,
  body: 64 * 1024,
  values: 64,
  value: 2000,
} as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** Boundary validation for the POST body; returns null on anything malformed. */
export function parseShareInput(raw: unknown): ShareInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const bodyMd = typeof r.bodyMd === 'string' ? r.bodyMd : '';
  const roleSlug = typeof r.roleSlug === 'string' ? r.roleSlug : '';
  const personaSlug = typeof r.personaSlug === 'string' ? r.personaSlug : '';
  const sourceVersion = typeof r.sourceVersion === 'number' && Number.isInteger(r.sourceVersion) ? r.sourceVersion : NaN;
  if (!title || title.length > SHARE_LIMITS.title) return null;
  if (!bodyMd.trim() || bodyMd.length > SHARE_LIMITS.body) return null;
  if (!SLUG.test(roleSlug) || !SLUG.test(personaSlug)) return null;
  if (!Number.isFinite(sourceVersion) || sourceVersion < 1) return null;

  const values: Record<string, string> = {};
  if (r.values !== undefined) {
    if (!r.values || typeof r.values !== 'object' || Array.isArray(r.values)) return null;
    const entries = Object.entries(r.values as Record<string, unknown>);
    if (entries.length > SHARE_LIMITS.values) return null;
    for (const [key, value] of entries) {
      if (typeof value !== 'string' || value.length > SHARE_LIMITS.value) return null;
      if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(key)) return null;
      values[key] = value;
    }
  }
  return { title, bodyMd, values, roleSlug, personaSlug, sourceVersion };
}

export async function createShare(input: ShareInput): Promise<string> {
  const token = randomBytes(18).toString('base64url');
  const { error } = await supabaseAdmin()
    .from('persona_shares')
    .insert({
      token,
      title: input.title,
      body_md: input.bodyMd,
      values: input.values,
      role_slug: input.roleSlug,
      persona_slug: input.personaSlug,
      source_version: input.sourceVersion,
    });
  if (error) throw new Error(error.message);
  return token;
}

export async function getShare(token: string): Promise<Share | null> {
  if (!supabaseConfigured() || !TOKEN.test(token)) return null;
  const { data, error } = await supabaseAdmin()
    .from('persona_shares')
    .select('token,title,body_md,values,role_slug,persona_slug,source_version,created_at,expires_at')
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return {
    token: data.token as string,
    title: data.title as string,
    bodyMd: data.body_md as string,
    values: (data.values as Record<string, string> | null) ?? {},
    roleSlug: (data.role_slug as string | null) ?? '',
    personaSlug: (data.persona_slug as string | null) ?? '',
    sourceVersion: (data.source_version as number | null) ?? 1,
    createdAt: data.created_at as string,
  };
}
