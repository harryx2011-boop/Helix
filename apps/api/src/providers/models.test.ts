import { afterEach, describe, expect, it, vi } from 'vitest';
import { listLocalProviderModels } from './models.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('listLocalProviderModels', () => {
  it('parses the real Ollama /api/tags shape, including parameter size, quantization and capabilities', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        models: [
          {
            name: 'gemma4:e2b',
            model: 'gemma4:e2b',
            size: 7162405886,
            digest: 'abc',
            details: { parameter_size: '5.1B', quantization_level: 'Q4_K_M' },
            capabilities: ['completion', 'tools', 'thinking'],
          },
          {
            name: 'gemma3:4b',
            model: 'gemma3:4b',
            size: 3338801804,
            details: { parameter_size: '4.3B', quantization_level: 'Q4_K_M' },
            capabilities: ['completion'],
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listLocalProviderModels('ollama', 'http://localhost:11434/v1');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.models).toEqual([
      { name: 'gemma4:e2b', parameterSize: '5.1B', quantization: 'Q4_K_M', sizeBytes: 7162405886, capabilities: ['completion', 'tools', 'thinking'] },
      { name: 'gemma3:4b', parameterSize: '4.3B', quantization: 'Q4_K_M', sizeBytes: 3338801804, capabilities: ['completion'] },
    ]);
  });

  it('strips a stored /v1 suffix and calls the native Ollama tags endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ models: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await listLocalProviderModels('ollama', 'http://localhost:11434/v1');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything());
  });

  it('calls the native Ollama tags endpoint directly when the stored base URL has no /v1 suffix', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ models: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await listLocalProviderModels('ollama', 'http://localhost:11434');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything());
  });

  it('calls OpenAI-style GET /v1/models for vllm at the stored base URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ id: 'meta-llama/Llama-3.1-8B-Instruct' }] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listLocalProviderModels('vllm', 'http://localhost:8000/v1');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/v1/models', expect.anything());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.models).toEqual([{ name: 'meta-llama/Llama-3.1-8B-Instruct' }]);
  });

  it('parses the OpenAI-compatible /v1/models shape', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ id: 'llama-3.1-8b' }, { id: 'qwen2.5-7b' }] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listLocalProviderModels('openai-compatible', 'https://my-host.example/v1');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.models.map((m) => m.name)).toEqual(['llama-3.1-8b', 'qwen2.5-7b']);
  });

  it('returns a typed "unreachable" failure, never throws, when the runtime refuses the connection', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listLocalProviderModels('ollama', 'http://localhost:11434/v1');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('unreachable');
  });

  it('returns a typed "unreachable" failure on a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'nope' }, 500));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listLocalProviderModels('ollama', 'http://localhost:11434/v1');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('unreachable');
  });

  it('returns a typed "bad_response" failure when the body is not valid JSON', async () => {
    const fetchMock = vi.fn(async () => new Response('not json', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listLocalProviderModels('ollama', 'http://localhost:11434/v1');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('bad_response');
  });

  it('rejects a non-http(s) base URL as invalid rather than throwing', async () => {
    const result = await listLocalProviderModels('ollama', 'not-a-url');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('invalid_base_url');
  });

  it('does not follow a redirect, so a runtime cannot bounce the call to another host', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.redirect === 'manual'
        ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
        : jsonResponse({ models: [{ name: 'followed' }] }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listLocalProviderModels('ollama', 'http://127.0.0.1:11434/v1');

    expect(result.ok).toBe(false);
  });

  it('refuses a base URL in the link-local range', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ models: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listLocalProviderModels('ollama', 'http://169.254.169.254/v1');

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a loopback base URL — a local runtime is legitimately private', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ models: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listLocalProviderModels('ollama', 'http://127.0.0.1:11434/v1');

    expect(result.ok).toBe(true);
  });
});
