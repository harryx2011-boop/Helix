import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Route contract tests. Postgres is replaced with an in-memory fake so the
 * point stays the request/response surface and the encryption round trip,
 * not a real database.
 */

interface Row {
  provider: string;
  key_ciphertext: Buffer | null;
  key_iv: Buffer | null;
  key_last4: string | null;
  model: string | null;
  base_url: string | null;
  updated_at: Date;
}

const db = vi.hoisted(() => {
  const state = { rows: [] as Row[] };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (text.startsWith('SELECT provider, key_ciphertext')) {
      const [apiKeyId] = values as [string];
      return { rows: state.rows.filter((r) => (r as unknown as { api_key_id: string }).api_key_id === apiKeyId) };
    }
    if (text.startsWith('INSERT INTO provider_keys')) {
      const [apiKeyId, provider, ciphertext, iv, keyLast4, model, baseUrl] = values as [
        string,
        string,
        Buffer | null,
        Buffer | null,
        string | null,
        string | null,
        string | null,
      ];
      const existing = state.rows.find(
        (r) => (r as unknown as { api_key_id: string }).api_key_id === apiKeyId && r.provider === provider,
      );
      if (existing) {
        existing.key_ciphertext = ciphertext;
        existing.key_iv = iv;
        existing.key_last4 = keyLast4;
        existing.model = model;
        existing.base_url = baseUrl;
        existing.updated_at = new Date();
        return { rows: [{ model: existing.model, base_url: existing.base_url }] };
      }
      const row = {
        provider,
        key_ciphertext: ciphertext,
        key_iv: iv,
        key_last4: keyLast4,
        model,
        base_url: baseUrl,
        updated_at: new Date(),
        api_key_id: apiKeyId,
      } as unknown as Row;
      state.rows.push(row);
      return { rows: [{ model, base_url: baseUrl }] };
    }
    if (text.startsWith('DELETE FROM provider_keys')) {
      const [apiKeyId, provider] = values as [string, string];
      state.rows = state.rows.filter(
        (r) => !((r as unknown as { api_key_id: string }).api_key_id === apiKeyId && r.provider === provider),
      );
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { registerProviders } from './providers.js';
import type { Provider } from '../providers/repository.js';

const ENCRYPTION_KEY = createHash('sha256').update('test-secret').digest();
const KEY_A = { id: 'key-a', name: 'a', keyPrefix: 'helix-test', rateLimit: 1000, createdAt: new Date(), lastUsedAt: null, revokedAt: null };
const KEY_B = { ...KEY_A, id: 'key-b' };

let app: FastifyInstance;

async function build(instanceConfigured: Partial<Record<Provider, boolean>> = {}): Promise<FastifyInstance> {
  const built = Fastify();
  built.addHook('onRequest', async (request) => {
    const header = request.headers['x-test-key'];
    if (header === 'a') request.apiKey = KEY_A;
    if (header === 'b') request.apiKey = KEY_B;
  });
  await built.register(
    async (instance) => {
      await registerProviders(instance, {
        encryptionKey: ENCRYPTION_KEY,
        instanceConfigured: {
          anthropic: false,
          openai: false,
          gemini: false,
          openrouter: false,
          ollama: false,
          vllm: false,
          'openai-compatible': false,
          ...instanceConfigured,
        },
      });
    },
    { prefix: '/v1' },
  );
  await built.ready();
  return built;
}

beforeEach(() => {
  db.state.rows = [];
});

afterEach(async () => {
  await app?.close();
});

describe('GET /v1/providers', () => {
  it('lists all seven providers as unconfigured with no stored keys and no instance keys', async () => {
    app = await build();
    const response = await app.inject({ method: 'GET', url: '/v1/providers', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.providers).toEqual([
      { provider: 'anthropic', configured: false, source: 'none' },
      { provider: 'openai', configured: false, source: 'none' },
      { provider: 'gemini', configured: false, source: 'none' },
      { provider: 'openrouter', configured: false, source: 'none' },
      { provider: 'ollama', configured: false, source: 'none' },
      { provider: 'vllm', configured: false, source: 'none' },
      { provider: 'openai-compatible', configured: false, source: 'none' },
    ]);
  });

  it('reports source "instance" when the instance has a key and the caller has none', async () => {
    app = await build({ openai: true });
    const response = await app.inject({ method: 'GET', url: '/v1/providers', headers: { 'x-test-key': 'a' } });

    const openai = response.json().providers.find((p: { provider: string }) => p.provider === 'openai');
    expect(openai).toEqual({ provider: 'openai', configured: true, source: 'instance' });
  });

  it('reports source "key" and never returns the plaintext once a key is stored', async () => {
    app = await build();
    await app.inject({
      method: 'PUT',
      url: '/v1/providers/anthropic',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: 'sk-ant-abcdefgh1234', model: 'claude-sonnet-4-5' },
    });

    const response = await app.inject({ method: 'GET', url: '/v1/providers', headers: { 'x-test-key': 'a' } });
    const anthropic = response.json().providers.find((p: { provider: string }) => p.provider === 'anthropic');

    expect(anthropic.configured).toBe(true);
    expect(anthropic.source).toBe('key');
    expect(anthropic.last4).toBe('1234');
    expect(anthropic.model).toBe('claude-sonnet-4-5');
    expect(JSON.stringify(anthropic)).not.toContain('sk-ant-abcdefgh1234');
  });

  it('requires auth', async () => {
    app = await build();
    const response = await app.inject({ method: 'GET', url: '/v1/providers' });
    expect(response.statusCode).toBe(401);
  });
});

describe('PUT /v1/providers/:provider', () => {
  it('stores a key and returns last4 and model but never the plaintext', async () => {
    app = await build();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/providers/openai',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: 'sk-openai-12345678', model: 'gpt-4o-mini' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      success: true,
      provider: 'openai',
      last4: '5678',
      model: 'gpt-4o-mini',
      baseUrl: null,
    });
  });

  it('stores an ollama provider with only a baseUrl and no key', async () => {
    app = await build();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/providers/ollama',
      headers: { 'x-test-key': 'a' },
      payload: { baseUrl: 'http://localhost:11434/v1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      provider: 'ollama',
      last4: null,
      model: null,
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  it('rejects an ollama PUT with no baseUrl', async () => {
    app = await build();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/providers/ollama',
      headers: { 'x-test-key': 'a' },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('baseUrl');
  });

  it('rejects an anthropic PUT with no apiKey', async () => {
    app = await build();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/providers/anthropic',
      headers: { 'x-test-key': 'a' },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('apiKey');
  });

  it('rejects an unknown provider', async () => {
    app = await build();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/providers/bogus',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: '12345678' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_request');
    expect(response.json().field).toBe('provider');
  });

  it('rejects an apiKey shorter than 8 characters', async () => {
    app = await build();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/providers/openai',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: 'short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('apiKey');
  });

  it('rejects an apiKey longer than 512 characters', async () => {
    app = await build();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/providers/openai',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: 'x'.repeat(513) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('apiKey');
  });

  it('trims the apiKey before storing', async () => {
    app = await build();
    await app.inject({
      method: 'PUT',
      url: '/v1/providers/openai',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: '  sk-openai-12345678  ' },
    });

    const response = await app.inject({ method: 'GET', url: '/v1/providers', headers: { 'x-test-key': 'a' } });
    const openai = response.json().providers.find((p: { provider: string }) => p.provider === 'openai');
    expect(openai.last4).toBe('5678');
  });

  it('upserts: a second PUT for the same provider replaces the key', async () => {
    app = await build();
    await app.inject({
      method: 'PUT',
      url: '/v1/providers/gemini',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: 'first-key-aaaa' },
    });
    const second = await app.inject({
      method: 'PUT',
      url: '/v1/providers/gemini',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: 'second-key-bbbb' },
    });

    expect(second.json().last4).toBe('bbbb');
    expect(db.state.rows.filter((r) => r.provider === 'gemini')).toHaveLength(1);
  });

  it('keeps keys scoped per API key', async () => {
    app = await build();
    await app.inject({
      method: 'PUT',
      url: '/v1/providers/openrouter',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: 'key-for-a-11111111' },
    });

    const response = await app.inject({ method: 'GET', url: '/v1/providers', headers: { 'x-test-key': 'b' } });
    const openrouter = response.json().providers.find((p: { provider: string }) => p.provider === 'openrouter');
    expect(openrouter.configured).toBe(false);
  });

  it('requires auth', async () => {
    app = await build();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/providers/openai',
      payload: { apiKey: '12345678' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('DELETE /v1/providers/:provider', () => {
  it('deletes a stored key', async () => {
    app = await build();
    await app.inject({
      method: 'PUT',
      url: '/v1/providers/anthropic',
      headers: { 'x-test-key': 'a' },
      payload: { apiKey: 'sk-ant-12345678' },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: '/v1/providers/anthropic',
      headers: { 'x-test-key': 'a' },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ success: true });

    const response = await app.inject({ method: 'GET', url: '/v1/providers', headers: { 'x-test-key': 'a' } });
    const anthropic = response.json().providers.find((p: { provider: string }) => p.provider === 'anthropic');
    expect(anthropic.configured).toBe(false);
  });

  it('is idempotent: deleting an unstored key still returns success', async () => {
    app = await build();
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/providers/openai',
      headers: { 'x-test-key': 'a' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
  });

  it('rejects an unknown provider', async () => {
    app = await build();
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/providers/bogus',
      headers: { 'x-test-key': 'a' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('requires auth', async () => {
    app = await build();
    const response = await app.inject({ method: 'DELETE', url: '/v1/providers/openai' });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /v1/providers/:provider/models', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists installed models once a base URL is stored', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ models: [{ name: 'llama3.2', details: { parameter_size: '3.2B' } }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    app = await build();
    await app.inject({
      method: 'PUT',
      url: '/v1/providers/ollama',
      headers: { 'x-test-key': 'a' },
      payload: { baseUrl: 'http://localhost:11434/v1' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/providers/ollama/models',
      headers: { 'x-test-key': 'a' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      provider: 'ollama',
      models: [{ name: 'llama3.2', parameterSize: '3.2B' }],
    });
  });

  it('returns a typed failure body, not a 500, when the runtime is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    app = await build();
    await app.inject({
      method: 'PUT',
      url: '/v1/providers/ollama',
      headers: { 'x-test-key': 'a' },
      payload: { baseUrl: 'http://localhost:11434/v1' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/providers/ollama/models',
      headers: { 'x-test-key': 'a' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('unreachable');
  });

  it('rejects when no base URL has been stored for the provider yet', async () => {
    app = await build();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/providers/ollama/models',
      headers: { 'x-test-key': 'a' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('baseUrl');
  });

  it('rejects a non-local provider', async () => {
    app = await build();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/providers/anthropic/models',
      headers: { 'x-test-key': 'a' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('provider');
  });

  it('requires auth', async () => {
    app = await build();
    const response = await app.inject({ method: 'GET', url: '/v1/providers/ollama/models' });
    expect(response.statusCode).toBe(401);
  });
});
