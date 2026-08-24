import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getPool } from '../db/pool.js';

/**
 * Helix API keys.
 *
 * These authenticate a caller to this instance. They are unrelated to the
 * operator's LLM, proxy and vector-store credentials, which live in environment
 * variables and are never stored here — Helix calls your models with your keys.
 *
 * Keys are stored as SHA-256 hashes. The plaintext is returned exactly once, at
 * creation, and cannot be recovered afterwards.
 */

const PREFIX = 'hx_';
const KEY_BYTES = 32;

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  rateLimit: number;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreatedApiKey extends ApiKey {
  /** Shown once. Not recoverable. */
  key: string;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Compare hex digests without leaking timing information.
 *
 * Lookup is by hash so the database does the work, but any direct comparison
 * still goes through this.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function generateKey(): { key: string; hash: string; prefix: string } {
  const key = PREFIX + randomBytes(KEY_BYTES).toString('hex');
  return {
    key,
    hash: hashKey(key),
    // Enough to identify a key in a list without revealing it.
    prefix: key.slice(0, PREFIX.length + 8),
  };
}

interface KeyRow {
  id: string;
  name: string;
  key_prefix: string;
  rate_limit: number;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

const toApiKey = (r: KeyRow): ApiKey => ({
  id: r.id,
  name: r.name,
  keyPrefix: r.key_prefix,
  rateLimit: r.rate_limit,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
  revokedAt: r.revoked_at,
});

export async function createApiKey(name: string, rateLimit = 1000): Promise<CreatedApiKey> {
  const { key, hash, prefix } = generateKey();

  const { rows } = await getPool().query<KeyRow>(
    `INSERT INTO api_keys (name, key_hash, key_prefix, rate_limit)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, key_prefix, rate_limit, created_at, last_used_at, revoked_at`,
    [name, hash, prefix, rateLimit],
  );

  const row = rows[0];
  if (!row) throw new Error('failed to create API key');

  return { ...toApiKey(row), key };
}

/**
 * Resolve a presented key. Returns undefined for unknown or revoked keys —
 * the caller must not be able to distinguish the two.
 */
export async function verifyApiKey(key: string): Promise<ApiKey | undefined> {
  if (!key.startsWith(PREFIX)) return undefined;

  const { rows } = await getPool().query<KeyRow>(
    `SELECT id, name, key_prefix, rate_limit, created_at, last_used_at, revoked_at
       FROM api_keys
      WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hashKey(key)],
  );

  const row = rows[0];
  if (!row) return undefined;

  // Fire-and-forget: a failed usage stamp must never fail the request.
  void getPool()
    .query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [row.id])
    .catch(() => undefined);

  return toApiKey(row);
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const { rows } = await getPool().query<KeyRow>(
    `SELECT id, name, key_prefix, rate_limit, created_at, last_used_at, revoked_at
       FROM api_keys
      ORDER BY created_at DESC`,
  );
  return rows.map(toApiKey);
}

export async function revokeApiKey(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
    [id],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Ensure the bootstrap key from the environment exists as a real row.
 *
 * Without this the first request has nothing to authenticate against. Idempotent,
 * so restarts are harmless.
 */
export async function ensureBootstrapKey(plaintext: string): Promise<void> {
  const hash = hashKey(plaintext);
  const prefix = plaintext.slice(0, PREFIX.length + 8);

  await getPool().query(
    `INSERT INTO api_keys (name, key_hash, key_prefix, rate_limit)
     VALUES ('bootstrap', $1, $2, 10000)
     ON CONFLICT (key_hash) DO NOTHING`,
    [hash, prefix],
  );
}
