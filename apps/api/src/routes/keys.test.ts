import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Key management contract, wired behind the real auth hook rather than a stub.
 *
 * The gate is what makes this route safe, so the tests drive it through
 * `registerAuth` with a fake key store: a route tested with auth mocked away
 * passes just as happily when the gate is deleted.
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

async function build(options: { multiTenant?: boolean } = {}): Promise<FastifyInstance> {
  const built = Fastify();
  registerAuth(built, {
    verifyApiKey,
    limiter: new RateLimiter({ limit: 1000, windowMs: 60_000 }),
    tickets: new InternalTickets(),
    open: ['/v1/health'],
  });
  await built.register(
    async (instance) => {
      await registerKeys(instance, { multiTenant: options.multiTenant === true });
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

const auth = (key: string) => ({ authorization: `Bearer ${key}` });

beforeEach(() => {
  db.state.rows = [];
  db.state.nextId = 0;
});

afterEach(async () => {
  await app?.close();
  vi.clearAllMocks();
});

describe('POST /v1/keys', () => {
  it('refuses to mint a key for a caller with no credential', async () => {
    app = await build();
    await seedKey();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'new' } });

    expect(response.statusCode).toBe(401);
    // The gate must stop the write, not merely colour the response.
    expect(db.state.rows).toHaveLength(1);
  });

  it('refuses a credential that was revoked', async () => {
    app = await build();
    const { key, id } = await seedKey();
    db.state.rows.find((r) => r.id === id)!.revoked_at = new Date();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'new' }, headers: auth(key) });

    expect(response.statusCode).toBe(401);
  });

  it('refuses a well-formed credential that was never issued', async () => {
    app = await build();
    await seedKey();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/keys',
      payload: { name: 'new' },
      headers: auth('helix-AAAAAAAAAAAAAAAA'),
    });

    expect(response.statusCode).toBe(401);
  });

  it('mints a key for a valid credential and returns the plaintext exactly once', async () => {
    app = await build();
    const { key } = await seedKey();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'ci' }, headers: auth(key) });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe('ci');
    expect(body.key).toMatch(/^helix-[A-Za-z0-9]{16}$/);
    expect(body.keyPrefix).toBe(body.key.slice(0, 10));
    expect(body.rateLimit).toBe(1000);

    const listed = await app.inject({ method: 'GET', url: '/v1/keys', headers: auth(key) });
    expect(JSON.stringify(listed.json())).not.toContain(body.key);
  });

  it('stores only a hash, never the plaintext', async () => {
    app = await build();
    const { key } = await seedKey();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'ci' }, headers: auth(key) });
    const plaintext = response.json().key;

    const stored = db.state.rows.find((r) => r.name === 'ci')!;
    expect(stored.key_hash).toBe(createHash('sha256').update(plaintext).digest('hex'));
    expect(JSON.stringify(db.state.rows)).not.toContain(plaintext);
  });

  it('rejects an empty name rather than creating an unidentifiable key', async () => {
    app = await build();
    const { key } = await seedKey();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: '' }, headers: auth(key) });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_request');
    expect(db.state.rows).toHaveLength(1);
  });

  it('rejects a rate limit above the cap', async () => {
    app = await build();
    const { key } = await seedKey();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/keys',
      payload: { name: 'huge', rateLimit: 1_000_001 },
      headers: auth(key),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('rateLimit');
  });

  it('defaults the rate limit rather than leaving a key unbounded', async () => {
    app = await build();
    const { key } = await seedKey();

    const response = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'd' }, headers: auth(key) });

    expect(response.json().rateLimit).toBe(1000);
  });
});

describe('GET /v1/keys', () => {
  it('refuses an unauthenticated listing', async () => {
    app = await build();
    await seedKey();

    const response = await app.inject({ method: 'GET', url: '/v1/keys' });

    expect(response.statusCode).toBe(401);
  });

  it('never returns key material for any listed key', async () => {
    app = await build();
    const { key } = await seedKey();
    const minted = await app.inject({ method: 'POST', url: '/v1/keys', payload: { name: 'x' }, headers: auth(key) });
    const plaintext = minted.json().key;

    const response = await app.inject({ method: 'GET', url: '/v1/keys', headers: auth(key) });

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

  /**
   * There is no ownership model on `api_keys` — the schema has no owner column
   * and the route has no filter — so any valid key sees every key on the
   * instance. That is the designed self-host behaviour, not an oversight, and
   * this pins it: if a multi-tenant scope is ever added, this test must be the
   * thing that fails and forces the decision to be explicit.
   */
  it('shows every key on the instance to any valid caller, the flat self-host model', async () => {
    app = await build();
    const a = await seedKey('owner-a');
    await seedKey('owner-b');

    const response = await app.inject({ method: 'GET', url: '/v1/keys', headers: auth(a.key) });

    expect(response.json().keys.map((k: { name: string }) => k.name).sort()).toEqual(['owner-a', 'owner-b']);
  });
});

describe('DELETE /v1/keys/:id', () => {
  it('refuses an unauthenticated revocation', async () => {
    app = await build();
    const target = await seedKey();

    const response = await app.inject({ method: 'DELETE', url: `/v1/keys/${target.id}` });

    expect(response.statusCode).toBe(401);
    expect(db.state.rows.find((r) => r.id === target.id)!.revoked_at).toBeNull();
  });

  it('revokes a key and makes it unusable for the next request', async () => {
    app = await build();
    const caller = await seedKey('caller');
    const victimKey = await app.inject({
      method: 'POST',
      url: '/v1/keys',
      payload: { name: 'victim' },
      headers: auth(caller.key),
    });
    const victim = victimKey.json();

    const revoked = await app.inject({ method: 'DELETE', url: `/v1/keys/${victim.id}`, headers: auth(caller.key) });
    expect(revoked.statusCode).toBe(204);

    const afterwards = await app.inject({ method: 'GET', url: '/v1/keys', headers: auth(victim.key) });
    expect(afterwards.statusCode).toBe(401);
  });

  it('answers 404 for a second revocation rather than reporting success twice', async () => {
    app = await build();
    const caller = await seedKey('caller');
    const target = await seedKey('target');

    await app.inject({ method: 'DELETE', url: `/v1/keys/${target.id}`, headers: auth(caller.key) });
    const again = await app.inject({ method: 'DELETE', url: `/v1/keys/${target.id}`, headers: auth(caller.key) });

    expect(again.statusCode).toBe(404);
    expect(again.json().error).toBe('not_found');
  });

  it('answers 404 for an id that does not exist', async () => {
    app = await build();
    const caller = await seedKey();

    const response = await app.inject({ method: 'DELETE', url: '/v1/keys/id-999', headers: auth(caller.key) });

    expect(response.statusCode).toBe(404);
  });

  /**
   * Any valid key can revoke any other key, including the one it is not. On a
   * flat self-host instance every key is an operator credential, so this is the
   * intended reach; it is pinned because it is the assumption a hosted
   * deployment would have to break, and it must break loudly.
   */
  it('lets one key revoke another, the flat self-host model', async () => {
    app = await build();
    const a = await seedKey('owner-a');
    const b = await seedKey('owner-b');

    const response = await app.inject({ method: 'DELETE', url: `/v1/keys/${b.id}`, headers: auth(a.key) });

    expect(response.statusCode).toBe(204);
    expect(db.state.rows.find((r) => r.id === b.id)!.revoked_at).not.toBeNull();
  });

  it('does not let a revoked key revoke anything', async () => {
    app = await build();
    const a = await seedKey('owner-a');
    const b = await seedKey('owner-b');
    db.state.rows.find((r) => r.id === a.id)!.revoked_at = new Date();

    const response = await app.inject({ method: 'DELETE', url: `/v1/keys/${b.id}`, headers: auth(a.key) });

    expect(response.statusCode).toBe(401);
    expect(db.state.rows.find((r) => r.id === b.id)!.revoked_at).toBeNull();
  });
});

/**
 * Listing and revoking have no owner predicate, so on a shared instance they
 * read and destroy every tenant's credentials. Withheld rather than narrowed:
 * nothing in the hosted deployment calls them.
 */
describe('multi-tenant registration', () => {
  it('does not register the instance-wide key list', async () => {
    app = await build({ multiTenant: true });
    const { key } = await seedKey();

    const response = await app.inject({ method: 'GET', url: '/v1/keys', headers: auth(key) });

    expect(response.statusCode).toBe(404);
  });

  it('does not let one tenant revoke another tenant key', async () => {
    app = await build({ multiTenant: true });
    const { key } = await seedKey('attacker');
    const victim = await seedKey('victim');

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/keys/${victim.id}`,
      headers: auth(key),
    });

    expect(response.statusCode).toBe(404);
    expect(db.state.rows.find((r) => r.id === victim.id)!.revoked_at).toBeNull();
  });

  it('does not register minting either', async () => {
    app = await build({ multiTenant: true });
    const { key } = await seedKey();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/keys',
      payload: { name: 'new' },
      headers: auth(key),
    });

    expect(response.statusCode).toBe(404);
    // The gate must stop the write, not merely colour the response.
    expect(db.state.rows).toHaveLength(1);
  });

  it('serves both routes under self-host, where every key is the same operator', async () => {
    app = await build();
    const { key } = await seedKey();
    const other = await seedKey('other');

    const list = await app.inject({ method: 'GET', url: '/v1/keys', headers: auth(key) });
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/v1/keys/${other.id}`,
      headers: auth(key),
    });

    expect(list.statusCode).toBe(200);
    expect(revoke.statusCode).toBe(204);
  });
});
