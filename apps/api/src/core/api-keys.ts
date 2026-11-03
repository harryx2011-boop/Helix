import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { getPool } from '../db/pool.js';


const PREFIX = 'helix-';
const KEY_LENGTH = 16;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PREFIX_VISIBLE = 4;

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
  key: string;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function generateKey(): { key: string; hash: string; prefix: string } {
  let body = '';
  for (let i = 0; i < KEY_LENGTH; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  const key = PREFIX + body;
  return {
    key,
    hash: hashKey(key),
    prefix: key.slice(0, PREFIX.length + PREFIX_VISIBLE),
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

  void getPool()
    .query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [row.id])
    .catch(() => undefined);

  return toApiKey(row);
}

export async function importApiKey(plaintext: string, name: string, rateLimit = 1000): Promise<ApiKey> {
  if (!plaintext.startsWith(PREFIX)) throw new Error('key must start with ' + PREFIX);
  const { rows } = await getPool().query<KeyRow>(
    `INSERT INTO api_keys (name, key_hash, key_prefix, rate_limit)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key_hash) DO UPDATE SET name = EXCLUDED.name, rate_limit = EXCLUDED.rate_limit, revoked_at = NULL
     RETURNING id, name, key_prefix, rate_limit, created_at, last_used_at, revoked_at`,
    [name, hashKey(plaintext), plaintext.slice(0, PREFIX.length + PREFIX_VISIBLE), rateLimit],
  );
  const row = rows[0];
  if (!row) throw new Error('failed to import API key');
  return toApiKey(row);
}

export async function revokeApiKeyByHash(plaintextHash: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'UPDATE api_keys SET revoked_at = now() WHERE key_hash = $1 AND revoked_at IS NULL',
    [plaintextHash],
  );
  return (rowCount ?? 0) > 0;
}

export const API_KEY_LIST_LIMIT = 500;

export async function listApiKeys(): Promise<ApiKey[]> {
  const { rows } = await getPool().query<KeyRow>(
    `SELECT id, name, key_prefix, rate_limit, created_at, last_used_at, revoked_at
       FROM api_keys
      ORDER BY created_at DESC
      LIMIT ${API_KEY_LIST_LIMIT}`,
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

export async function ensureBootstrapKey(plaintext: string): Promise<void> {
  const hash = hashKey(plaintext);
  const prefix = plaintext.slice(0, PREFIX.length + PREFIX_VISIBLE);

  await getPool().query(
    `INSERT INTO api_keys (name, key_hash, key_prefix, rate_limit)
     VALUES ('bootstrap', $1, $2, 10000)
     ON CONFLICT (key_hash) DO UPDATE SET revoked_at = NULL`,
    [hash, prefix],
  );
}
