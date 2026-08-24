import { describe, expect, it } from 'vitest';
import { generateKey, hashKey, safeEqual } from './api-keys.js';

describe('API key generation', () => {
  it('produces prefixed, high-entropy keys', () => {
    const { key } = generateKey();
    expect(key).toMatch(/^hx_[0-9a-f]{64}$/);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 500 }, () => generateKey().key));
    expect(keys.size).toBe(500);
  });

  it('exposes a prefix that identifies without revealing', () => {
    const { key, prefix } = generateKey();
    expect(key.startsWith(prefix)).toBe(true);
    // Short enough to be useless to an attacker, long enough to pick out of a list.
    expect(prefix.length).toBe(11);
    expect(prefix.length).toBeLessThan(key.length / 4);
  });

  it('hashes deterministically, and the hash is not the key', () => {
    const { key, hash } = generateKey();
    expect(hashKey(key)).toBe(hash);
    expect(hash).not.toContain(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives unrelated hashes to keys differing by one character', () => {
    const a = hashKey('hx_aaaa');
    const b = hashKey('hx_aaab');
    expect(a).not.toBe(b);

    // Sanity-check the avalanche property rather than trusting SHA-256 blindly.
    const differing = [...a].filter((c, i) => c !== b[i]).length;
    expect(differing).toBeGreaterThan(a.length / 4);
  });
});

describe('safeEqual', () => {
  it('matches identical strings', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });

  it('rejects different strings', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
  });

  it('rejects different lengths without throwing', () => {
    // timingSafeEqual throws on length mismatch; the wrapper must absorb that.
    expect(safeEqual('short', 'muchlongerstring')).toBe(false);
  });

  it('handles empty input', () => {
    expect(safeEqual('', '')).toBe(true);
    expect(safeEqual('', 'x')).toBe(false);
  });
});
