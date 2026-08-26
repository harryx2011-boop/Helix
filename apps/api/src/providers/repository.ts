import { getPool } from '../db/pool.js';
import { decryptSecret, encryptSecret, last4 } from './crypto.js';

/**
 * Caller-supplied LLM provider keys.
 *
 * A caller stores their own Anthropic/OpenAI/Gemini/OpenRouter key against
 * their Helix API key; every LLM-backed call made with that key then uses it
 * instead of the instance's environment credentials. The plaintext is never
 * logged and never returned after storage — only its last 4 characters are.
 */

export const PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface ProviderKeyStatus {
  provider: Provider;
  configured: boolean;
  source: 'key' | 'instance' | 'none';
  last4?: string;
  model?: string | null;
  updatedAt?: string;
}

interface ProviderKeyRow {
  provider: Provider;
  key_ciphertext: Buffer;
  key_iv: Buffer;
  key_last4: string;
  model: string | null;
  updated_at: Date;
}

export async function listProviderKeys(apiKeyId: string): Promise<ProviderKeyRow[]> {
  const { rows } = await getPool().query<ProviderKeyRow>(
    `SELECT provider, key_ciphertext, key_iv, key_last4, model, updated_at
       FROM provider_keys
      WHERE api_key_id = $1`,
    [apiKeyId],
  );
  return rows;
}

export async function upsertProviderKey(
  apiKeyId: string,
  provider: Provider,
  plaintext: string,
  encryptionKey: Buffer,
  model?: string | undefined,
): Promise<{ last4: string; model: string | null }> {
  const { ciphertext, iv } = encryptSecret(plaintext, encryptionKey);
  const keyLast4 = last4(plaintext);

  const { rows } = await getPool().query<{ model: string | null }>(
    `INSERT INTO provider_keys (api_key_id, provider, key_ciphertext, key_iv, key_last4, model)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (api_key_id, provider) DO UPDATE
       SET key_ciphertext = EXCLUDED.key_ciphertext,
           key_iv = EXCLUDED.key_iv,
           key_last4 = EXCLUDED.key_last4,
           model = EXCLUDED.model,
           updated_at = now()
     RETURNING model`,
    [apiKeyId, provider, ciphertext, iv, keyLast4, model ?? null],
  );

  const row = rows[0];
  if (!row) throw new Error('failed to store provider key');
  return { last4: keyLast4, model: row.model };
}

/** Idempotent: deleting an unstored provider key is not an error. */
export async function deleteProviderKey(apiKeyId: string, provider: Provider): Promise<void> {
  await getPool().query('DELETE FROM provider_keys WHERE api_key_id = $1 AND provider = $2', [apiKeyId, provider]);
}

export async function getProviderStatuses(
  apiKeyId: string,
  instanceConfigured: Record<Provider, boolean>,
): Promise<ProviderKeyStatus[]> {
  const rows = await listProviderKeys(apiKeyId);
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return PROVIDERS.map((provider): ProviderKeyStatus => {
    const row = byProvider.get(provider);
    if (row) {
      return {
        provider,
        configured: true,
        source: 'key',
        last4: row.key_last4,
        model: row.model,
        updatedAt: row.updated_at.toISOString(),
      };
    }
    if (instanceConfigured[provider]) {
      return { provider, configured: true, source: 'instance' };
    }
    return { provider, configured: false, source: 'none' };
  });
}

export interface ResolvedProviderKeys {
  anthropic?: { key: string; model?: string | null };
  openai?: { key: string; model?: string | null };
  gemini?: { key: string; model?: string | null };
  openrouter?: { key: string; model?: string | null };
}

/** Decrypted provider keys for one Helix API key, keyed by provider. Empty when the caller stored none. */
export async function resolveProviderKeys(apiKeyId: string, encryptionKey: Buffer): Promise<ResolvedProviderKeys> {
  const rows = await listProviderKeys(apiKeyId);
  const resolved: ResolvedProviderKeys = {};

  for (const row of rows) {
    resolved[row.provider] = {
      key: decryptSecret(row.key_ciphertext, row.key_iv, encryptionKey),
      model: row.model,
    };
  }

  return resolved;
}
