import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin, supabaseConfigured } from './supabase/server';
import type { GithubConnectionRow } from './supabase/types';

/**
 * GitHub App connections — a repo-scoped grant, separate from the GitHub
 * identity Clerk holds for users who signed in with GitHub.
 *
 * WHY SEPARATE FROM SIGN-IN. Clerk's external-account token carries the scopes
 * SIGN-IN asked for, and users who signed in with Google or email have no
 * GitHub token at all. A distinct App means every user can connect regardless
 * of how they signed in, and the scopes are Helix's to choose and to narrow.
 *
 * THE TOKEN NEVER LEAVES THIS MODULE. Routes receive `GithubConnectionMeta`,
 * which has no ciphertext and no token; `authorizationFor` returns HEADERS.
 * That is the same shape the API's provider keys keep, and it is what makes
 * "the token is server-side" a property of the code rather than a convention.
 */

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';

/**
 * Read scopes only. A token that never requested a write scope cannot write,
 * whatever a later prompt says — incremental consent is the mechanism, and
 * this list is the floor.
 */
export const GITHUB_READ_SCOPES = ['read:user', 'repo'] as const;

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function clientId(): string {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) throw new Error('GITHUB_CLIENT_ID is not set');
  return id;
}

function clientSecret(): string {
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!secret) throw new Error('GITHUB_CLIENT_SECRET is not set');
  return secret;
}

/* Reuses the API-key encryption key rather than introducing a second secret to
   rotate and to forget. Same AES-256-GCM shape as `keys.ts`; kept here rather
   than imported because that module's helpers are named for API keys and a
   `decryptApiKey` call on a GitHub token reads as a bug at every call site. */
function encryptionKey(): Buffer {
  const raw = process.env.HELIX_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error('HELIX_KEY_ENCRYPTION_KEY is not set (32 bytes, base64)');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('HELIX_KEY_ENCRYPTION_KEY must decode to 32 bytes');
  return buf;
}

function encryptToken(token: string): { ciphertext: Buffer; iv: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return { ciphertext: Buffer.concat([enc, cipher.getAuthTag()]), iv };
}

function decryptToken(ciphertext: Buffer, iv: Buffer): string {
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const body = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

/** PostgREST hands `bytea` back as `\x…` hex. */
function fromBytea(value: string): Buffer {
  return Buffer.from(value.startsWith('\\x') ? value.slice(2) : value, 'hex');
}

function toBytea(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`;
}

/** Safe to send to the browser: no token, no ciphertext, no client secret. */
export interface GithubConnectionMeta {
  id: string;
  login: string;
  avatarUrl: string | null;
  scopes: string[];
  agentMayUse: boolean;
  tokenLast4: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export function toMeta(row: GithubConnectionRow): GithubConnectionMeta {
  return {
    id: row.id,
    login: row.github_login,
    avatarUrl: row.avatar_url,
    scopes: row.scopes ?? [],
    agentMayUse: row.agent_may_use,
    tokenLast4: row.token_last4,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

/* --------------------------------------------------------------- the flow */

/**
 * The authorize URL, plus the `state` the callback must present back.
 *
 * `state` is what binds a callback to the flow this server started. It is
 * compared with `timingSafeEqual` at the far end rather than `===`: the
 * comparison is against a value an attacker supplies, and a byte-at-a-time
 * early return is measurable.
 */
export function authorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(GITHUB_AUTHORIZE);
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', GITHUB_READ_SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

export function newState(): string {
  return randomBytes(24).toString('base64url');
}

export function stateMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  /* Length is not secret, and timingSafeEqual throws on a mismatch. */
  return a.length === b.length && timingSafeEqual(a, b);
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Exchanges the code for a token. GitHub requires the client secret here even
 * when PKCE is used — it does not distinguish public from confidential
 * clients — which is why this half must stay server-side.
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<{
  token: string; refresh: string | null; expiresIn: number | null; scopes: string[];
}> {
  const res = await fetch(GITHUB_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`GitHub refused the sign-in (${res.status}).`);
  const json = (await res.json()) as TokenResponse;
  /* GitHub answers 200 with an `error` field rather than a status code, so a
     bare `res.ok` check would treat a refusal as a success and store an empty
     token. */
  if (json.error) throw new Error(json.error_description ?? json.error);
  if (!json.access_token) throw new Error('GitHub did not return an access token.');
  return {
    token: json.access_token,
    refresh: json.refresh_token ?? null,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : null,
    /* What GitHub ACTUALLY granted, not what was asked for. */
    scopes: json.scope ? json.scope.split(/[\s,]+/).filter(Boolean) : [...GITHUB_READ_SCOPES],
  };
}

export async function fetchViewer(token: string): Promise<{
  login: string; id: number; avatarUrl: string | null;
}> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'helix',
    },
  });
  if (!res.ok) throw new Error(`Could not read the GitHub account (${res.status}).`);
  const json = (await res.json()) as { login?: string; id?: number; avatar_url?: string };
  if (!json.login || typeof json.id !== 'number') {
    throw new Error('GitHub returned an unexpected account shape.');
  }
  return { login: json.login, id: json.id, avatarUrl: json.avatar_url ?? null };
}

/* --------------------------------------------------------------- storage */

export async function listConnections(profileId: string): Promise<GithubConnectionMeta[]> {
  if (!supabaseConfigured()) return [];
  const { data } = await supabaseAdmin()
    .from('github_connections')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true });
  return ((data as GithubConnectionRow[] | null) ?? []).map(toMeta);
}

/**
 * Records a completed connection. Upserts on (profile_id, github_login) so
 * reconnecting the same account REPLACES its token rather than leaving the old
 * one decryptable beside the new one.
 *
 * `agent_may_use` is deliberately absent from the update path: re-authorizing
 * must never silently re-grant agent use the user had turned off.
 */
export async function saveConnection(input: {
  profileId: string;
  login: string;
  githubUserId: number;
  avatarUrl: string | null;
  token: string;
  refresh: string | null;
  expiresIn: number | null;
  scopes: string[];
}): Promise<GithubConnectionMeta> {
  const enc = encryptToken(input.token);
  const ref = input.refresh ? encryptToken(input.refresh) : null;
  const { data, error } = await supabaseAdmin()
    .from('github_connections')
    .upsert({
      profile_id: input.profileId,
      github_login: input.login,
      github_user_id: input.githubUserId,
      avatar_url: input.avatarUrl,
      token_ciphertext: toBytea(enc.ciphertext),
      token_iv: toBytea(enc.iv),
      token_last4: input.token.slice(-4),
      refresh_ciphertext: ref ? toBytea(ref.ciphertext) : null,
      refresh_iv: ref ? toBytea(ref.iv) : null,
      scopes: input.scopes,
      expires_at: input.expiresIn
        ? new Date(Date.now() + input.expiresIn * 1000).toISOString()
        : null,
    }, { onConflict: 'profile_id,github_login' })
    .select('*')
    .single();
  if (error) throw error;
  return toMeta(data as GithubConnectionRow);
}

export async function setAgentMayUse(
  profileId: string, id: string, may: boolean,
): Promise<boolean> {
  const { error, count } = await supabaseAdmin()
    .from('github_connections')
    .update({ agent_may_use: may }, { count: 'exact' })
    /* Scoped by profile as well as id: an id alone would let one user flip
       another's switch if an id ever leaked. */
    .eq('profile_id', profileId)
    .eq('id', id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function deleteConnection(profileId: string, id: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin()
    .from('github_connections')
    .delete({ count: 'exact' })
    .eq('profile_id', profileId)
    .eq('id', id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * The ONLY way a stored token reaches the network. Returns headers, never the
 * token, and refuses on three separate grounds:
 *
 *   - the connection does not exist for this profile,
 *   - the agent was never granted use of it (when acting for a run),
 *   - the target is not on GitHub's own API origin.
 *
 * The third is what stops a token being presented to a look-alike host: the
 * origin is checked here at every use rather than trusted from the caller.
 */
export async function authorizationFor(
  profileId: string, id: string, url: string, forAgent: boolean,
): Promise<{ ok: true; headers: Record<string, string> } | { ok: false; reason: string }> {
  if (!supabaseConfigured()) return { ok: false, reason: 'Not configured.' };
  const { data } = await supabaseAdmin()
    .from('github_connections')
    .select('*')
    .eq('profile_id', profileId)
    .eq('id', id)
    .maybeSingle();
  const row = data as GithubConnectionRow | null;
  if (!row) return { ok: false, reason: 'No such connection.' };
  if (forAgent && !row.agent_may_use) {
    return { ok: false, reason: 'The agent is not allowed to use your GitHub connection.' };
  }

  let target: URL;
  try { target = new URL(url); } catch { return { ok: false, reason: 'That URL is not valid.' }; }
  if (target.origin !== GITHUB_API) {
    return { ok: false, reason: `A GitHub token is only valid for ${GITHUB_API}.` };
  }
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    return { ok: false, reason: 'That GitHub connection has expired. Reconnect it.' };
  }

  const token = decryptToken(fromBytea(row.token_ciphertext), fromBytea(row.token_iv));
  await supabaseAdmin()
    .from('github_connections')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id);

  return {
    ok: true,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'helix',
    },
  };
}
