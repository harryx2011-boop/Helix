import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const state = { rows: [] as Record<string, unknown>[] };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (/^INSERT INTO provider_keys/.test(text)) {
      return { rows: [{ model: values[5] ?? null, base_url: values[6] ?? null }] };
    }
    return { rows: state.rows };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

const { upsertProviderKey } = await import('./repository.js');

const ENCRYPTION_KEY = Buffer.alloc(32, 7);

describe('upsertProviderKey', () => {
  /* A PUT that only changes the base URL (the local-provider case: e.g. saving
     a new port for an openai-compatible server after a key was already stored)
     must not blank out the previously-stored key. The route always fetches
     EXCLUDED.* in the ON CONFLICT clause; without COALESCE against the
     existing row, an omitted apiKey overwrites the ciphertext columns with
     NULL. */
  it('keeps the stored key, iv and last4 when the upsert carries no apiKey', async () => {
    db.query.mockClear();
    await upsertProviderKey('key-1', 'openai-compatible', ENCRYPTION_KEY, {
      baseUrl: 'http://127.0.0.1:8000/v1',
      model: 'llama-3',
    });

    const call = db.query.mock.calls.find(([sql]) => /INSERT INTO provider_keys/.test(sql))!;
    const [text, values] = call;
    expect(text).toMatch(/COALESCE\(EXCLUDED\.key_ciphertext, provider_keys\.key_ciphertext\)/);
    expect(text).toMatch(/COALESCE\(EXCLUDED\.key_iv, provider_keys\.key_iv\)/);
    expect(text).toMatch(/COALESCE\(EXCLUDED\.key_last4, provider_keys\.key_last4\)/);
    expect(values).toEqual(['key-1', 'openai-compatible', null, null, null, 'llama-3', 'http://127.0.0.1:8000/v1']);
  });

  it('keeps the stored model and baseUrl when the upsert carries neither', async () => {
    db.query.mockClear();
    await upsertProviderKey('key-1', 'anthropic', ENCRYPTION_KEY, { apiKey: 'sk-ant-abcdefgh' });

    const [text, values] = db.query.mock.calls.find(([sql]) => /INSERT INTO provider_keys/.test(sql))!;
    expect(text).toMatch(/COALESCE\(EXCLUDED\.model, provider_keys\.model\)/);
    expect(text).toMatch(/COALESCE\(EXCLUDED\.base_url, provider_keys\.base_url\)/);
    expect(values?.[5]).toBeNull();
    expect(values?.[6]).toBeNull();
  });

  it('still writes a fresh key when the upsert does carry one', async () => {
    db.query.mockClear();
    const result = await upsertProviderKey('key-1', 'openai', ENCRYPTION_KEY, { apiKey: 'sk-openai-abcdefgh' });
    expect(result.last4).toBe('efgh');

    const [, values] = db.query.mock.calls.find(([sql]) => /INSERT INTO provider_keys/.test(sql))!;
    expect(values?.[2]).toBeInstanceOf(Buffer);
    expect(values?.[3]).toBeInstanceOf(Buffer);
    expect(values?.[4]).toBe('efgh');
  });
});
