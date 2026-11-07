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

  it('treats 429 as valid, because a rate-limited key is an authenticated key', () => {
    expect(classifyKeyResponse(429, '')).toBe('valid');
  });

  it('treats 401 and 403 as the provider rejecting the credential itself', () => {
    expect(classifyKeyResponse(401, '')).toBe('invalid');
    expect(classifyKeyResponse(403, '')).toBe('invalid');
  });

  it("reads Gemini's 400 API_KEY_INVALID shape as invalid", () => {
    expect(classifyKeyResponse(400, '{"error":{"status":"API_KEY_INVALID"}}')).toBe('invalid');
    expect(classifyKeyResponse(400, 'API key not valid. Please pass a valid API key.')).toBe('invalid');
  });

  it('leaves an ordinary 400 unverifiable rather than blaming the key', () => {
    expect(classifyKeyResponse(400, '{"error":"missing parameter"}')).toBe('unverifiable');
  });

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
  it('probes a bare Ollama origin at /api/tags, not /models', async () => {
    let seen = '';
    globalThis.fetch = vi.fn(async (url: unknown) => {
      seen = String(url);
      if (seen === 'http://127.0.0.1:11434/api/tags') {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await verifyProvider('ollama', { baseUrl: 'http://127.0.0.1:11434' });
    expect(seen).toBe('http://127.0.0.1:11434/api/tags');
    expect(result.verdict).toBe('valid');
  });

  it('strips a /v1 suffix before probing Ollama, same as listLocalProviderModels', async () => {
    let seen = '';
    globalThis.fetch = vi.fn(async (url: unknown) => {
      seen = String(url);
      if (seen === 'http://127.0.0.1:11434/api/tags') {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await verifyProvider('ollama', { baseUrl: 'http://127.0.0.1:11434/v1' });
    expect(seen).toBe('http://127.0.0.1:11434/api/tags');
    expect(result.verdict).toBe('valid');
  });

  it('still probes /models for vllm and openai-compatible runtimes', async () => {
    let seen = '';
    globalThis.fetch = vi.fn(async (url: unknown) => {
      seen = String(url);
      if (seen.endsWith('/models')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const vllm = await verifyProvider('vllm', { baseUrl: 'http://127.0.0.1:8000/v1' });
    expect(seen).toBe('http://127.0.0.1:8000/v1/models');
    expect(vllm.verdict).toBe('valid');

    const compat = await verifyProvider('openai-compatible', { baseUrl: 'http://127.0.0.1:1234' });
    expect(seen).toBe('http://127.0.0.1:1234/models');
    expect(compat.verdict).toBe('valid');
  });

  it('treats an unreachable local runtime as unverifiable, so the URL can still be saved', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const result = await verifyProvider('ollama', { baseUrl: 'http://127.0.0.1:11434' });
    expect(result.verdict).toBe('unverifiable');
  });

  it('does not follow a redirect from a local runtime', async () => {
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.redirect === 'manual'
        ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
        : new Response(JSON.stringify({ models: [] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await verifyProvider('ollama', { baseUrl: 'http://127.0.0.1:11434' });
    expect(result.verdict).not.toBe('valid');
  });

  it('refuses a local runtime URL in the link-local range', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await verifyProvider('ollama', { baseUrl: 'http://169.254.169.254' });
    expect(result.verdict).toBe('invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers unverifiable when there is no credential to check at all', async () => {
    expect((await verifyProvider('anthropic', {})).verdict).toBe('unverifiable');
    expect((await verifyProvider('ollama', {})).verdict).toBe('unverifiable');
  });
});
