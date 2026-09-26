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

describe('ensureBootstrapKey', () => {
  /**
   * The desktop app injects the bootstrap key from its bridge. A revoke from the
   * Keys page that survived a restart would lock the app out for good.
   */
  it('reactivates a revoked bootstrap key on the next boot', async () => {
    const { pgliteDriver } = await import('../db/drivers/pglite.js');
    const db = pgliteDriver({});
    await db.query(`CREATE TABLE api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      key_hash text NOT NULL UNIQUE,
      key_prefix text NOT NULL,
      rate_limit integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz,
      revoked_at timestamptz
    )`);
    vi.doMock('../db/pool.js', () => ({ getPool: () => db }));
    vi.resetModules();
    try {
      const keys = await import('./api-keys.js');
      const plaintext = 'helix-BootstrapKey000001';

      await keys.ensureBootstrapKey(plaintext);
      expect(await keys.revokeApiKeyByHash(keys.hashKey(plaintext))).toBe(true);
      expect(await keys.verifyApiKey(plaintext)).toBeUndefined();

      await keys.ensureBootstrapKey(plaintext);
      expect((await keys.verifyApiKey(plaintext))?.name).toBe('bootstrap');
      const { rows } = await db.query<{ n: string }>('SELECT count(*) AS n FROM api_keys', []);
      expect(rows[0]!.n).toBe('1');
    } finally {
      vi.doUnmock('../db/pool.js');
      vi.resetModules();
      await db.end();
    }
  }, 60_000);
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
