import { describe, expect, it, vi } from 'vitest';
import { API_KEY_LIST_LIMIT, generateKey, hashKey, safeEqual } from './api-keys.js';

describe('API key generation', () => {
  it('produces prefixed, high-entropy keys', () => {
    const { key } = generateKey();
    expect(key).toMatch(/^helix-[A-Za-z0-9]{16}$/);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 500 }, () => generateKey().key));
    expect(keys.size).toBe(500);
  });

  it('exposes a prefix that identifies without revealing', () => {
    const { key, prefix } = generateKey();
    expect(key.startsWith(prefix)).toBe(true);
    // Short enough to be useless to an attacker, long enough to pick out of a list.
    expect(prefix.length).toBe(10);
    expect(prefix.length).toBeLessThan(key.length / 2);
  });

  it('hashes deterministically, and the hash is not the key', () => {
    const { key, hash } = generateKey();
    expect(hashKey(key)).toBe(hash);
    expect(hash).not.toContain(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives unrelated hashes to keys differing by one character', () => {
    const a = hashKey('helix-aaaa');
    const b = hashKey('helix-aaab');
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

describe('listApiKeys', () => {
  /**
   * /usage/all runs one aggregate query per key this returns, so an unbounded
   * list here is an unbounded fan-out there rather than merely a large response.
   */
  it('asks the database for a bounded page', async () => {
    const queries: string[] = [];
    vi.doMock('../db/pool.js', () => ({
      getPool: () => ({
        query: async (text: string) => {
          queries.push(text);
          return { rows: [], rowCount: 0 };
        },
      }),
    }));
    vi.resetModules();
    const { listApiKeys: scoped } = await import('./api-keys.js');

    await scoped();

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain(`LIMIT ${API_KEY_LIST_LIMIT}`);
    vi.doUnmock('../db/pool.js');
    vi.resetModules();
  });
});
