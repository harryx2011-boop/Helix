import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyKeyResponse, verifyProvider, verifyProviderKey } from './verify.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('classifyKeyResponse', () => {
  it('treats any 2xx as proof the provider accepted the credential', () => {
    expect(classifyKeyResponse(200, '')).toBe('valid');
    expect(classifyKeyResponse(204, '')).toBe('valid');
  });

  /* A rate-limited key is a real key: the provider had to authenticate it to
     know it was over quota. Classifying 429 as invalid would refuse to store a
     working credential during a burst. */
  it('treats 429 as valid, because a rate-limited key is an authenticated key', () => {
    expect(classifyKeyResponse(429, '')).toBe('valid');
  });

  it('treats 401 and 403 as the provider rejecting the credential itself', () => {
    expect(classifyKeyResponse(401, '')).toBe('invalid');
    expect(classifyKeyResponse(403, '')).toBe('invalid');
  });

  /* Gemini rejects a bad key with 400, distinguishable from an ordinary bad
     request only by the body's reason. */
  it("reads Gemini's 400 API_KEY_INVALID shape as invalid", () => {
    expect(classifyKeyResponse(400, '{"error":{"status":"API_KEY_INVALID"}}')).toBe('invalid');
    expect(classifyKeyResponse(400, 'API key not valid. Please pass a valid API key.')).toBe('invalid');
  });

  it('leaves an ordinary 400 unverifiable rather than blaming the key', () => {
    expect(classifyKeyResponse(400, '{"error":"missing parameter"}')).toBe('unverifiable');
  });

  /* The whole point of the three-way split: a provider outage must never be
     reported as a bad key, or a transient 5xx refuses a good credential. */
  it('leaves 5xx unverifiable, never invalid', () => {
    expect(classifyKeyResponse(500, '')).toBe('unverifiable');
    expect(classifyKeyResponse(503, '')).toBe('unverifiable');
  });
});

describe('verifyProviderKey', () => {
  it('sends the key in the header each provider actually reads', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init: unknown) => {
      calls.push({
        url: String(url),
        headers: ((init as RequestInit).headers ?? {}) as Record<string, string>,
      });
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    await verifyProviderKey('anthropic', 'sk-ant-secret');
    await verifyProviderKey('openai', 'sk-openai-secret');
    await verifyProviderKey('gemini', 'gemini-secret');
    await verifyProviderKey('openrouter', 'or-secret');

    expect(calls[0]?.headers['x-api-key']).toBe('sk-ant-secret');
    expect(calls[0]?.headers['anthropic-version']).toBe('2023-06-01');
    expect(calls[1]?.headers.authorization).toBe('Bearer sk-openai-secret');
    expect(calls[2]?.headers['x-goog-api-key']).toBe('gemini-secret');
    expect(calls[3]?.headers.authorization).toBe('Bearer or-secret');
  });

  /* OpenRouter's /models catalogue is public and answers 200 to a garbage
     token, so checking it would pass every invalid key. /key reads the token. */
  it('checks OpenRouter against /key, not the public /models catalogue', async () => {
    let seen = '';
    globalThis.fetch = vi.fn(async (url: unknown) => {
      seen = String(url);
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    await verifyProviderKey('openrouter', 'or-secret');
    expect(seen).toBe('https://openrouter.ai/api/v1/key');
  });

  it('reports a rejected key as invalid', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const result = await verifyProviderKey('openai', 'bad');
    expect(result.verdict).toBe('invalid');
  });

  it('reports a network failure as unverifiable, never invalid', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const result = await verifyProviderKey('anthropic', 'sk-ant-good');
    expect(result.verdict).toBe('unverifiable');
  });

  /* The key goes into a request header and nowhere else. A message that echoed
     it would leak the credential into logs and toasts. */
  it('never puts the key in the returned message', async () => {
    const secret = 'sk-ant-do-not-leak-me';
    globalThis.fetch = vi.fn(async () => new Response(secret, { status: 401 })) as unknown as typeof fetch;
    const rejected = await verifyProviderKey('anthropic', secret);
    expect(JSON.stringify(rejected)).not.toContain(secret);

    globalThis.fetch = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED using ${secret}`);
    }) as unknown as typeof fetch;
    const offline = await verifyProviderKey('anthropic', secret);
    expect(JSON.stringify(offline)).not.toContain(secret);
  });
});

describe('verifyProvider', () => {
  it('verifies a local runtime by its base URL rather than a key', async () => {
    let seen = '';
    globalThis.fetch = vi.fn(async (url: unknown) => {
      seen = String(url);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await verifyProvider('ollama', { baseUrl: 'http://127.0.0.1:11434/v1' });
    expect(result.verdict).toBe('valid');
    expect(seen).toBe('http://127.0.0.1:11434/v1/models');
  });

  /* A runtime that is merely switched off is unverifiable, not invalid: the URL
     may be perfectly correct and Ollama simply not started yet, and refusing to
     save it would strand the caller. */
  it('treats an unreachable local runtime as unverifiable, so the URL can still be saved', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const result = await verifyProvider('ollama', { baseUrl: 'http://127.0.0.1:11434' });
    expect(result.verdict).toBe('unverifiable');
  });

  it('answers unverifiable when there is no credential to check at all', async () => {
    expect((await verifyProvider('anthropic', {})).verdict).toBe('unverifiable');
    expect((await verifyProvider('ollama', {})).verdict).toBe('unverifiable');
  });
});
