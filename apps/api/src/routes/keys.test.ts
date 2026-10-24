import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Key management contract, wired behind the real auth hook rather than a stub.
 *
 * One operator owns a Helix instance, and only the operator's admin token
 * manages its API keys. An API key, however valid, cannot mint, list or
 * revoke keys. The tests drive the routes through `registerAuth` with a fake
 * key store: a route tested with auth mocked away passes just as happily when
 * the gate is deleted.
 */

interface KeyRow {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  rate_limit: number;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

const db = vi.hoisted(() => {
  const state = { rows: [] as KeyRow[], nextId: 0 };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (text.startsWith('INSERT INTO api_keys')) {
      const [name, hash, prefix, rateLimit] = values as [string, string, string, number];
      const row: KeyRow = {
        id: `id-${++state.nextId}`,
        name,
        key_hash: hash,
        key_prefix: prefix,
        rate_limit: rateLimit,
        created_at: new Date('2026-01-01T00:00:00Z'),
        last_used_at: null,
        revoked_at: null,
      };
      state.rows.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (text.includes('FROM api_keys') && text.includes('key_hash = $1')) {
      const [hash] = values as [string];
      // The revoked predicate is honoured only because the statement asks for
      // it. Filtering unconditionally would let the lookup drop `revoked_at IS
      // NULL` while these tests still reported revoked keys as rejected.
      const excludesRevoked = text.includes('revoked_at IS NULL');
      const found = state.rows.filter(
        (r) => r.key_hash === hash && (!excludesRevoked || r.revoked_at === null),
      );
      return { rows: found, rowCount: found.length };
    }
    if (text.includes('FROM api_keys')) {
      return { rows: [...state.rows], rowCount: state.rows.length };
    }
    if (text.startsWith('UPDATE api_keys SET revoked_at')) {
      const [id] = values as [string];
      const onlyActive = text.includes('revoked_at IS NULL');
      const row = state.rows.find((r) => r.id === id && (!onlyActive || r.revoked_at === null));
      if (!row) return { rows: [], rowCount: 0 };
      row.revoked_at = new Date('2026-02-01T00:00:00Z');
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('UPDATE api_keys SET last_used_at')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { registerKeys } from './keys.js';
import { InternalTickets, registerAuth } from '../core/auth.js';
import { RateLimiter } from '../core/rate-limit.js';
import { createApiKey, hashKey, verifyApiKey } from '../core/api-keys.js';

let app: FastifyInstance;

const ADMIN = 'admin-token-for-key-tests';

// A default parameter would fire on an explicit `undefined`, quietly turning
// the disabled-instance case back into an enabled one.
async function build(...args: [] | [adminToken: string | undefined]): Promise<FastifyInstance> {
  const adminToken = args.length === 0 ? ADMIN : args[0];
  const built = Fastify();
  registerAuth(built, {
    verifyApiKey,
    limiter: new RateLimiter({ limit: 1000, windowMs: 60_000 }),
    tickets: new InternalTickets(),
    open: ['/v1/health'],
  });
  await built.register(
    async (instance) => {
      await registerKeys(instance, { adminToken });
    },
    { prefix: '/v1' },
  );
  await built.ready();
  return built;
}

/** Seeds a usable credential the way the bootstrap path does, so auth has something real to resolve. */
async function seedKey(name = 'seed'): Promise<{ key: string; id: string }> {
  const created = await createApiKey(name, 1000);
  return { key: created.key, id: created.id };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const admin = bearer(ADMIN);

beforeEach(() => {
  db.state.rows = [];
  db.state.nextId = 0;
});

afterEach(async () => {
  await app?.close();
  vi.clearAllMocks();
});

describe('only the admin token manages keys', () => {
  it('registers nothing when no admin token is configured', async () => {
    app = await build(undefined);
    const { key } = await seedKey();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'new' }, headers: bearer(key) });

    expect([401, 404]).toContain(response.statusCode);
    expect(db.state.rows).toHaveLength(1);
  });

  it('refuses a caller with no credential', async () => {
    app = await build();
    await seedKey();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'new' } });

    expect(response.statusCode).toBe(401);
    expect(db.state.rows).toHaveLength(1);
  });

  it.each([
    ['POST', '/v1/keys'],
    ['GET', '/v1/keys'],
    ['DELETE', '/v1/keys/id-1'],
    ['POST', '/v1/%6Beys'],
  ])('refuses a valid API key on %s %s', async (method, url) => {
    app = await build();
    const { key } = await seedKey();

    const response = await app.inject({ method: method as 'GET', url, payload: { name: 'new' }, headers: bearer(key) });

    expect(response.statusCode).toBe(401);
    expect(db.state.rows).toHaveLength(1);
    expect(db.state.rows[0]!.revoked_at).toBeNull();
  });

  it('refuses the admin token on a foreign host name', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/keys',
      payload: { name: 'new' },
      headers: { ...admin, host: 'rebind.example:7410' },
    });

    expect(response.statusCode).toBe(403);
    expect(db.state.rows).toHaveLength(0);
  });
});

describe('POST /v1/keys', () => {
  it('mints a key for the admin token and returns the plaintext exactly once', async () => {
    app = await build();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'ci' }, headers: admin });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe('ci');
    expect(body.key).toMatch(/^helix-[A-Za-z0-9]{16}$/);
    expect(body.keyPrefix).toBe(body.key.slice(0, 10));
    expect(body.rateLimit).toBe(1000);

    const listed = await app.inject({ method: 'GET', url: '/v1/keys', headers: admin });
    expect(JSON.stringify(listed.json())).not.toContain(body.key);
  });

  it('stores only a hash, never the plaintext', async () => {
    app = await build();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'ci' }, headers: admin });
    const plaintext = response.json().key;

    const stored = db.state.rows.find((r) => r.name === 'ci')!;
    expect(stored.key_hash).toBe(createHash('sha256').update(plaintext).digest('hex'));
    expect(JSON.stringify(db.state.rows)).not.toContain(plaintext);
  });

  it('rejects an empty name rather than creating an unidentifiable key', async () => {
    app = await build();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: '' }, headers: admin });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_request');
    expect(db.state.rows).toHaveLength(0);
  });

  it('rejects a rate limit above the cap', async () => {
    app = await build();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/keys',
      payload: { name: 'huge', rateLimit: 1_000_001 },
      headers: admin,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('rateLimit');
  });

  it('defaults the rate limit rather than leaving a key unbounded', async () => {
    app = await build();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'd' }, headers: admin });

    expect(response.json().rateLimit).toBe(1000);
  });
});

describe('GET /v1/keys', () => {
  it('never returns key material for any listed key', async () => {
    app = await build();
    const minted = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'x' }, headers: admin });
    const plaintext = minted.json().key;

    const response = await app.inject({ method: 'GET', url: '/v1/keys', headers: admin });

    expect(response.statusCode).toBe(200);
    const raw = response.body;
    expect(raw).not.toContain(plaintext);
    expect(raw).not.toContain(hashKey(plaintext));
    for (const entry of response.json().keys) {
      expect(Object.keys(entry).sort()).toEqual(
        ['createdAt', 'id', 'keyPrefix', 'lastUsedAt', 'name', 'rateLimit', 'revokedAt'].sort(),
      );
    }
  });

  it('shows every key on the instance to its one operator', async () => {
    app = await build();
    await seedKey('a');
    await seedKey('b');

    const response = await app.inject({ method: 'GET', url: '/v1/keys', headers: admin });

    expect(response.json().keys.map((k: { name: string }) => k.name).sort()).toEqual(['a', 'b']);
  });
});

describe('DELETE /v1/keys/:id', () => {
  it('revokes a key and makes it unusable', async () => {
    app = await build();
    const minted = (await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'victim' }, headers: admin })).json();

    const revoked = await app.inject({ method: 'DELETE', url: `/v1/keys/${minted.id}`, headers: admin });

    expect(revoked.statusCode).toBe(204);
    expect(await verifyApiKey(minted.key)).toBeUndefined();
  });

  it('answers 404 for a second revocation rather than reporting success twice', async () => {
    app = await build();
    const target = await seedKey('target');

    await app.inject({ method: 'DELETE', url: `/v1/keys/${target.id}`, headers: admin });
    const again = await app.inject({ method: 'DELETE', url: `/v1/keys/${target.id}`, headers: admin });

    expect(again.statusCode).toBe(404);
    expect(again.json().error).toBe('not_found');
  });

  it('answers 404 for an id that does not exist', async () => {
    app = await build();

    const response = await app.inject({ method: 'DELETE', url: '/v1/keys/id-999', headers: admin });

    expect(response.statusCode).toBe(404);
  });
});
