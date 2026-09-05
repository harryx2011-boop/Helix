import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveIntent } from '../client';
import { setProviderKey, clearProviderKey } from '../keys';

const ctx = { fileKind: 'video' as const, fileExt: 'mp4', fileSizeBytes: 10_000_000, durationSec: 30 };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  (globalThis as { window?: typeof globalThis }).window = globalThis as unknown as typeof globalThis;
  (globalThis as unknown as { localStorage: Storage }).localStorage = (() => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      get length() {
        return store.size;
      },
    } as Storage;
  })();
});

afterEach(() => {
  clearProviderKey('anthropic');
  vi.restoreAllMocks();
});

describe('resolveIntent: no key configured', () => {
  it('returns a plain-language failure and never calls fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await resolveIntent('anthropic', 'make this a gif', ctx);
    expect(result).toEqual({ ok: false, message: 'Add a provider key in Settings to use Ask AI.' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('resolveIntent: mocked model call, then the real validation boundary', () => {
  beforeEach(() => setProviderKey('anthropic', 'sk-test-key'));

  it('accepts a valid tool-call response and returns a validated intent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ content: [{ type: 'tool_use', input: { op: 'convert', to: 'mp4', options: { crf: 20 } } }] }),
    );
    const result = await resolveIntent('anthropic', 'make it smaller', ctx);
    expect(result).toEqual({ ok: true, intent: { op: 'convert', to: 'mp4', options: { crf: 20 } } });
  });

  it('rejects an out-of-range option via the real validate*Options function and falls back', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ content: [{ type: 'tool_use', input: { op: 'convert', to: 'mp4', options: { crf: 999 } } }] }),
    );
    const result = await resolveIntent('anthropic', 'make it smaller', ctx);
    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).toMatch(/invalid/);
  });

  it('rejects an unknown format and falls back', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ content: [{ type: 'tool_use', input: { op: 'convert', to: 'exe', options: {} } }] }),
    );
    const result = await resolveIntent('anthropic', 'make it an exe', ctx);
    expect(result.ok).toBe(false);
  });

  it('falls back with a plain-language message on an HTTP failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, false, 401));
    const result = await resolveIntent('anthropic', 'make it smaller', ctx);
    expect(result).toEqual({ ok: false, message: 'Could not reach the model. Try the format picker below.' });
  });

  it('falls back when the model does not return a tool call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'no.' }] }));
    const result = await resolveIntent('anthropic', 'make it smaller', ctx);
    expect(result.ok).toBe(false);
  });

  it('falls back when the model call rejects outright (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const result = await resolveIntent('anthropic', 'make it smaller', ctx);
    expect(result).toEqual({ ok: false, message: 'Could not reach the model. Try the format picker below.' });
  });
});
