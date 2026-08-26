import { describe, expect, it } from 'vitest';
import { toClientKeys } from './resolve.js';

describe('toClientKeys', () => {
  it('returns undefined maps when the caller has stored no keys', () => {
    expect(toClientKeys({})).toEqual({ providerKeys: undefined, providerModels: undefined });
  });

  it('maps each stored provider key and model', () => {
    const result = toClientKeys({
      anthropic: { key: 'sk-ant-1', model: 'claude-sonnet-4-5' },
      openai: { key: 'sk-openai-1', model: null },
    });

    expect(result.providerKeys).toEqual({ anthropic: 'sk-ant-1', openai: 'sk-openai-1' });
    expect(result.providerModels).toEqual({ anthropic: 'claude-sonnet-4-5' });
  });

  it('omits a null model rather than sending it as a key', () => {
    const result = toClientKeys({ gemini: { key: 'g-1', model: null } });
    expect(result.providerModels).toEqual({});
    expect(result.providerKeys).toEqual({ gemini: 'g-1' });
  });
});
