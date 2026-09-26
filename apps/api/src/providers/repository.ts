import type { DetectedRuntime } from './detect.js';
import { getPool } from '../db/pool.js';
import { decryptSecret, encryptSecret, last4 } from './crypto.js';

/**
 * Caller-supplied LLM provider keys.
 *
 * A caller stores their own Anthropic/OpenAI/Gemini/OpenRouter key, or a local
 * runtime's base URL (Ollama/vLLM/OpenAI-compatible), against their Helix API
 * key; every LLM-backed call made with that key then uses it instead of the
 * instance's environment credentials. The plaintext is never logged and never
 * returned after storage — only its last 4 characters are.
 */

export const PROVIDERS = [
  'anthropic',
  'openai',
  'gemini',
  'openrouter',
  'ollama',
  'vllm',
  'openai-compatible',
] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Local runtimes are identified by a base URL rather than a key; most need no credential at all. */
export const LOCAL_PROVIDERS = ['ollama', 'vllm', 'openai-compatible'] as const;
export type LocalProvider = (typeof LOCAL_PROVIDERS)[number];

export function isLocalProvider(provider: Provider): provider is LocalProvider {
  return (LOCAL_PROVIDERS as readonly string[]).includes(provider);
}

export interface ProviderKeyStatus {
  provider: Provider;
  configured: boolean;
  source: 'key' | 'instance' | 'none';
  last4?: string | undefined;
  model?: string | null;
  baseUrl?: string | null;
  updatedAt?: string;
  /** A runtime answering on its default address that is not set up yet: offered, never used. */
  detected?: { baseUrl: string; models: string[] };
}

interface ProviderKeyRow {
  provider: Provider;
  key_ciphertext: Buffer | null;
  key_iv: Buffer | null;
  key_last4: string | null;
  model: string | null;
  base_url: string | null;
  updated_at: Date;
}

export async function listProviderKeys(apiKeyId: string): Promise<ProviderKeyRow[]> {
  const { rows } = await getPool().query<ProviderKeyRow>(
    `SELECT provider, key_ciphertext, key_iv, key_last4, model, base_url, updated_at
       FROM provider_keys
      WHERE api_key_id = $1`,
    [apiKeyId],
  );
  return rows;
}

export interface UpsertProviderKeyOptions {
  apiKey?: string | undefined;
  model?: string | undefined;
  baseUrl?: string | undefined;
}

export async function upsertProviderKey(
  apiKeyId: string,
  provider: Provider,
  encryptionKey: Buffer,
  opts: UpsertProviderKeyOptions,
): Promise<{ last4: string | null; model: string | null; baseUrl: string | null }> {
  let ciphertext: Buffer | null = null;
  let iv: Buffer | null = null;
  let keyLast4: string | null = null;

  if (opts.apiKey) {
    const encrypted = encryptSecret(opts.apiKey, encryptionKey);
    ciphertext = encrypted.ciphertext;
    iv = encrypted.iv;
    keyLast4 = last4(opts.apiKey);
  }

  /* COALESCE against the existing row on every conflicting column: a PUT that
     only touches baseUrl (the local-provider case, e.g. re-pointing a running
     vLLM instance after a key was already stored for it) carries no apiKey,
     and EXCLUDED.key_ciphertext alone would be NULL — overwriting a key that
     is still good. There is no partial-clear path into this route; removing a
     provider entirely goes through deleteProviderKey instead. */
  const { rows } = await getPool().query<{ model: string | null; base_url: string | null }>(
    `INSERT INTO provider_keys (api_key_id, provider, key_ciphertext, key_iv, key_last4, model, base_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (api_key_id, provider) DO UPDATE
       SET key_ciphertext = COALESCE(EXCLUDED.key_ciphertext, provider_keys.key_ciphertext),
           key_iv = COALESCE(EXCLUDED.key_iv, provider_keys.key_iv),
           key_last4 = COALESCE(EXCLUDED.key_last4, provider_keys.key_last4),
           model = COALESCE(EXCLUDED.model, provider_keys.model),
           base_url = COALESCE(EXCLUDED.base_url, provider_keys.base_url),
           updated_at = now()
     RETURNING model, base_url`,
    [apiKeyId, provider, ciphertext, iv, keyLast4, opts.model ?? null, opts.baseUrl ?? null],
  );

  const row = rows[0];
  if (!row) throw new Error('failed to store provider key');
  return { last4: keyLast4, model: row.model, baseUrl: row.base_url };
}

/** Idempotent: deleting an unstored provider key is not an error. */
export async function deleteProviderKey(apiKeyId: string, provider: Provider): Promise<void> {
  await getPool().query('DELETE FROM provider_keys WHERE api_key_id = $1 AND provider = $2', [apiKeyId, provider]);
}

export async function getProviderStatuses(
  apiKeyId: string,
  instanceConfigured: Record<Provider, boolean>,
  detected: DetectedRuntime[] = [],
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
        last4: row.key_last4 ?? undefined,
        model: row.model,
        baseUrl: row.base_url,
        updatedAt: row.updated_at.toISOString(),
      };
    }
    if (instanceConfigured[provider]) {
      return { provider, configured: true, source: 'instance' };
    }
    const runtime = detected.find((d) => d.provider === provider);
    return runtime
      ? { provider, configured: false, source: 'none', detected: { baseUrl: runtime.baseUrl, models: runtime.models } }
      : { provider, configured: false, source: 'none' };
  });
}

export type ResolvedProviderKeys = Partial<Record<Provider, { key?: string | null; model?: string | null; baseUrl?: string | null }>>;

/** Decrypted provider keys for one Helix API key, keyed by provider. Empty when the caller stored none. */
export async function resolveProviderKeys(apiKeyId: string, encryptionKey: Buffer): Promise<ResolvedProviderKeys> {
  const rows = await listProviderKeys(apiKeyId);
  const resolved: ResolvedProviderKeys = {};

  for (const row of rows) {
    resolved[row.provider] = {
      key: row.key_ciphertext && row.key_iv ? decryptSecret(row.key_ciphertext, row.key_iv, encryptionKey) : null,
      model: row.model,
      baseUrl: row.base_url,
    };
  }

  return resolved;
}
