import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * The key-sync surface the hosted website mirrors its keys through.
 *
 * Its only trust boundary is a shared secret, and the route is the whole of
 * that boundary — there is no per-caller identity behind it. So the gate gets
 * tested from every angle a mistake could open it: absent, wrong, wrong shape,
 * right value in the wrong header form, and the disabled-by-default case that
 * is what a self-host deployment actually runs.
 */

interface KeyRow {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  rate_limit: number;
  revoked_at: Date | null;
}

const db = vi.hoisted(() => {
  const state = { rows: [] as KeyRow[], nextId: 0 };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (text.startsWith('INSERT INTO api_keys')) {
      const [name, hash, prefix, rateLimit] = values as [string, string, string, number];
      const existing = state.rows.find((r) => r.key_hash === hash);
      if (existing) {
        // Mirrors ON CONFLICT (key_hash) DO UPDATE: an import is idempotent and
        // un-revokes, which is how the website re-enables a key it re-issues.
        existing.name = name;
        existing.rate_limit = rateLimit;
        existing.revoked_at = null;
        return { rows: [existing], rowCount: 1 };
      }
      const row: KeyRow = {
        id: `id-${++state.nextId}`,
        name,
        key_hash: hash,
        key_prefix: prefix,
        rate_limit: rateLimit,
        revoked_at: null,
      };
      state.rows.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (text.startsWith('UPDATE api_keys SET revoked_at')) {
      const [hash] = values as [string];
      const row = state.rows.find((r) => r.key_hash === hash && r.revoked_at === null);
      if (!row) return { rows: [], rowCount: 0 };
      row.revoked_at = new Date('2026-02-01T00:00:00Z');
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { registerInternal } from './internal.js';

const TOKEN = 'internal-admin-token-for-tests';
const KEY = 'helix-ABCDEFGHIJKLMNOP';

let app: FastifyInstance;

// A default parameter would fire on an explicit `undefined`, quietly turning
// the disabled-instance cases back into enabled ones.
async function build(...args: [] | [adminToken: string | undefined]): Promise<FastifyInstance> {
  const adminToken = args.length === 0 ? TOKEN : args[0];
  const built = Fastify();
  await registerInternal(built, { adminToken });
  await built.ready();
  return built;
}

const auth = { authorization: `Bearer ${TOKEN}` };

beforeEach(() => {
  db.state.rows = [];
  db.state.nextId = 0;
});

afterEach(async () => {
  await app?.close();
  vi.clearAllMocks();
});

describe('internal routes are off unless an admin token is configured', () => {
  it('registers nothing at all when the token is unset, the self-host default', async () => {
    app = await build(undefined);

    const imported = await app.inject({ method: 'POST', url: '/internal/keys', payload: { key: KEY, name: 'n' } });
    const revoked = await app.inject({ method: 'DELETE', url: '/internal/keys', payload: { key: KEY } });

    expect(imported.statusCode).toBe(404);
    expect(revoked.statusCode).toBe(404);
    expect(db.state.rows).toHaveLength(0);
  });

  it('registers nothing when the token is the empty string, which is an unset variable in practice', async () => {
    app = await build('');

    const response = await app.inject({ method: 'POST', url: '/internal/keys', payload: { key: KEY, name: 'n' } });

    expect(response.statusCode).toBe(404);
  });
});

describe('the shared-secret gate', () => {
  it('refuses an import with no Authorization header', async () => {
    app = await build();

    const response = await app.inject({ method: 'POST', url: '/internal/keys', payload: { key: KEY, name: 'n' } });

    expect(response.statusCode).toBe(401);
    expect(db.state.rows).toHaveLength(0);
  });

  it('refuses an import bearing the wrong token', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'n' },
      headers: { authorization: 'Bearer not-the-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(db.state.rows).toHaveLength(0);
  });

  it('refuses a token that is a prefix of the real one, which a length-blind compare would accept', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'n' },
      headers: { authorization: `Bearer ${TOKEN.slice(0, -1)}` },
    });

    expect(response.statusCode).toBe(401);
    expect(db.state.rows).toHaveLength(0);
  });

  it('refuses a token carrying trailing whitespace rather than trimming it into a match', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'n' },
      headers: { authorization: `Bearer ${TOKEN} ` },
    });

    expect(response.statusCode).toBe(401);
  });

  it('refuses an empty bearer value', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'n' },
      headers: { authorization: 'Bearer ' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('refuses a revocation with no token, so a stolen key cannot be un-mirrored by a stranger', async () => {
    app = await build();
    await app.inject({ method: 'POST', url: '/internal/keys', payload: { key: KEY, name: 'n' }, headers: auth });

    const response = await app.inject({ method: 'DELETE', url: '/internal/keys', payload: { key: KEY } });

    expect(response.statusCode).toBe(401);
    expect(db.state.rows[0]!.revoked_at).toBeNull();
  });

  it('accepts the bare token without the Bearer prefix, the shape the website may send', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'n' },
      headers: { authorization: TOKEN },
    });

    expect(response.statusCode).toBe(201);
  });
});

describe('POST /internal/keys', () => {
  it('mirrors a key by hash and never stores the plaintext', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'website-key', rateLimitPerMin: 500 },
      headers: auth,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: 'id-1', keyPrefix: 'helix-ABCD', rateLimit: 500 });
    expect(db.state.rows[0]!.key_hash).toBe(createHash('sha256').update(KEY).digest('hex'));
    expect(JSON.stringify(db.state.rows)).not.toContain(KEY);
  });

  it('never echoes the imported key back in its response', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'n' },
      headers: auth,
    });

    expect(response.body).not.toContain(KEY);
  });

  it('rejects a key that is not in the helix- format', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: 'sk-some-other-vendor-key', name: 'n' },
      headers: auth,
    });

    expect(response.statusCode).toBe(400);
    expect(db.state.rows).toHaveLength(0);
  });

  it('rejects a key of the right prefix but the wrong length', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: 'helix-TOOSHORT', name: 'n' },
      headers: auth,
    });

    expect(response.statusCode).toBe(400);
  });

  it('defaults the rate limit when the website omits it', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'n' },
      headers: auth,
    });

    expect(response.json().rateLimit).toBe(1000);
  });

  it('treats a null rate limit as the default rather than as no limit', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'n', rateLimitPerMin: null },
      headers: auth,
    });

    expect(response.json().rateLimit).toBe(1000);
  });

  it('is idempotent: re-importing the same key updates it instead of duplicating it', async () => {
    app = await build();

    await app.inject({ method: 'POST', url: '/internal/keys', payload: { key: KEY, name: 'first' }, headers: auth });
    const second = await app.inject({
      method: 'POST',
      url: '/internal/keys',
      payload: { key: KEY, name: 'second', rateLimitPerMin: 42 },
      headers: auth,
    });

    expect(second.statusCode).toBe(201);
    expect(db.state.rows).toHaveLength(1);
    expect(db.state.rows[0]!.name).toBe('second');
    expect(db.state.rows[0]!.rate_limit).toBe(42);
  });
});

describe('DELETE /internal/keys', () => {
  it('revokes a mirrored key by its hash', async () => {
    app = await build();
    await app.inject({ method: 'POST', url: '/internal/keys', payload: { key: KEY, name: 'n' }, headers: auth });

    const response = await app.inject({ method: 'DELETE', url: '/internal/keys', payload: { key: KEY }, headers: auth });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ revoked: true });
    expect(db.state.rows[0]!.revoked_at).not.toBeNull();
  });

  it('reports revoked:false for a key this instance never mirrored', async () => {
    app = await build();

    const response = await app.inject({
      method: 'DELETE',
      url: '/internal/keys',
      payload: { key: 'helix-ZZZZZZZZZZZZZZZZ' },
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ revoked: false });
  });

  it('reports revoked:false on a second revocation of the same key', async () => {
    app = await build();
    await app.inject({ method: 'POST', url: '/internal/keys', payload: { key: KEY, name: 'n' }, headers: auth });
    await app.inject({ method: 'DELETE', url: '/internal/keys', payload: { key: KEY }, headers: auth });

    const again = await app.inject({ method: 'DELETE', url: '/internal/keys', payload: { key: KEY }, headers: auth });

    expect(again.json()).toEqual({ revoked: false });
  });

  it('rejects a malformed key rather than hashing arbitrary input into a lookup', async () => {
    app = await build();

    const response = await app.inject({
      method: 'DELETE',
      url: '/internal/keys',
      payload: { key: 'not-a-helix-key' },
      headers: auth,
    });

    expect(response.statusCode).toBe(400);
  });
});
