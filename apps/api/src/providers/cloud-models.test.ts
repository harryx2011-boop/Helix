import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURATED_MODELS, listCloudModels, mergeModels } from './cloud-models.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('mergeModels', () => {
  it('keeps curated entries first and appends only the live models not already listed', () => {
    const merged = mergeModels([{ name: 'a' }, { name: 'b' }], [{ name: 'b' }, { name: 'c' }]);
    expect(merged.map((m) => m.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('listCloudModels', () => {
  it('answers the curated list with no key, so the picker works before one is saved', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;

    const result = await listCloudModels('anthropic', null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.models).toEqual(CURATED_MODELS.anthropic);
  });

  it("parses Anthropic's /v1/models shape", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ data: [{ id: 'claude-brand-new-1', display_name: 'Brand New' }] }),
    ) as unknown as typeof fetch;

    const result = await listCloudModels('anthropic', 'sk-ant');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.models.map((m) => m.name)).toContain('claude-brand-new-1');
  });

  /* Gemini names models `models/x` in its catalogue but takes the bare id
     everywhere else, so a picker that passed the prefixed form through would
     hand back a value that fails on use. */
  it("strips Gemini's models/ prefix and drops anything that cannot generate", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        models: [
          { name: 'models/gemini-9.9-pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await listCloudModels('gemini', 'gemini-key');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.models.map((m) => m.name);
      expect(names).toContain('gemini-9.9-pro');
      expect(names).not.toContain('models/gemini-9.9-pro');
      expect(names).not.toContain('text-embedding-004');
    }
  });

  /* A picker that empties itself when the network hiccups is worse than one
     showing slightly stale names the caller can still edit by hand. */
  it('falls back to the curated list when the catalogue is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const result = await listCloudModels('openai', 'sk-openai');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.models).toEqual(CURATED_MODELS.openai);
  });

  it('falls back to the curated list when the provider rejects the key', async () => {
    globalThis.fetch = vi.fn(async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;

    const result = await listCloudModels('openai', 'bad-key');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.models).toEqual(CURATED_MODELS.openai);
  });

  it('falls back to the curated list when the catalogue is not JSON', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;

    const result = await listCloudModels('openrouter', 'or-key');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.models).toEqual(CURATED_MODELS.openrouter);
  });
});
