import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings route contract. Postgres is a fake: the point is the surface —
 * the admin gate, what may be written at all, the confirmation a guarded
 * setting demands, and whether a change is reported as applied or as needing a
 * restart.
 */

interface Call {
  text: string;
  values: unknown[];
}

const db = vi.hoisted(() => {
  const state = { calls: [] as Call[], overrides: [] as { key: string; value: unknown }[] };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    if (text.startsWith('DELETE FROM instance_settings')) return { rows: [], rowCount: 1 };
    if (text.includes('FROM instance_settings')) {
      return { rows: state.overrides.map((o) => ({ ...o, updated_at: new Date(0), updated_by: null })), rowCount: state.overrides.length };
    }
    if (text.includes('FROM encryption_key_versions')) return { rows: [{ version: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { registerSettings } from './settings.js';
import { registerAuth } from '../core/auth.js';

const TOKEN = 'admin-token-for-tests';

function targets() {
  return {
    browserPool: { setLimits: vi.fn() } as never,
    sessions: { setLimits: vi.fn() } as never,
  };
}

async function buildApp(opts?: { adminToken?: string | undefined; live?: ReturnType<typeof targets> }) {
  const app = Fastify();
  const live = opts?.live ?? targets();
  await registerSettings(app, {
    adminToken: 'adminToken' in (opts ?? {}) ? opts?.adminToken : TOKEN,
    envValues: { browserMaxContexts: 20, allowPrivateUrls: false, crawlMaxDepth: 50 },
    live,
    encryptionKey: Buffer.alloc(32, 7),
  });
  await app.ready();
  return { app, live };
}

const auth = { authorization: `Bearer ${TOKEN}` };

beforeEach(() => {
  db.state.calls = [];
  db.state.overrides = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('settings auth', () => {
  it('is not registered at all when no admin token is set', async () => {
    const { app } = await buildApp({ adminToken: undefined });
    const response = await app.inject({ method: 'GET', url: '/settings' });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a request with no token', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/settings' });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/settings', headers: { authorization: 'Bearer nope' } });

    expect(response.statusCode).toBe(401);
  });
});

describe('the API-key auth hook', () => {
  /**
   * `/settings` is listed in `registerAuth`'s `open` prefixes so the admin-token
   * gate is the one that answers. Dropping it from that list makes every
   * settings request fail as "Invalid API key", and adding a route under a
   * prefix the hook does not know about is easy to get wrong in the other
   * direction too — so pin both halves: exempt from the key check, still
   * refused without the admin token.
   */
  it('lets a settings request past the key check and into the admin gate', async () => {
    const app = Fastify();
    registerAuth(app, {
      verifyApiKey: async () => undefined,
      limiter: { check: () => ({ allowed: true, remaining: 1, resetAt: 0 }) } as never,
      tickets: { redeem: () => undefined } as never,
      open: ['/v1/health', '/settings'],
    });
    await registerSettings(app, {
      adminToken: TOKEN,
      envValues: { browserMaxContexts: 20 },
      live: targets(),
      encryptionKey: Buffer.alloc(32, 7),
    });
    await app.ready();

    const rejected = await app.inject({ method: 'GET', url: '/settings' });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toMatchObject({ error: 'unauthorized' });
    // Not the key check's message: the admin gate answered.
    expect(JSON.stringify(rejected.json())).not.toContain('API key');

    const accepted = await app.inject({ method: 'GET', url: '/settings', headers: auth });
    expect(accepted.statusCode).toBe(200);
  });
});

describe('PUT /settings/:key', () => {
  it('refuses a key that is not in the registry', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'PUT', url: '/settings/databaseUrl', headers: auth, payload: { value: 'postgres://elsewhere' } });

    expect(response.statusCode).toBe(404);
  });

  it('refuses a value the setting schema rejects', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'PUT', url: '/settings/browserMaxContexts', headers: auth, payload: { value: -1 } });

    expect(response.statusCode).toBe(400);
  });

  it('applies a live setting immediately through its setter', async () => {
    const { app, live } = await buildApp();
    const response = await app.inject({ method: 'PUT', url: '/settings/browserMaxContexts', headers: auth, payload: { value: 42 } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ applied: true, restartRequired: false });
    expect((live.browserPool as unknown as { setLimits: ReturnType<typeof vi.fn> }).setLimits).toHaveBeenCalledWith({ maxContexts: 42 });
  });

  it('converts an interact timeout from seconds to milliseconds', async () => {
    const { app, live } = await buildApp();
    await app.inject({ method: 'PUT', url: '/settings/interactIdleTimeoutSeconds', headers: auth, payload: { value: 30 } });

    expect((live.sessions as unknown as { setLimits: ReturnType<typeof vi.fn> }).setLimits).toHaveBeenCalledWith({ idleTimeoutMs: 30_000 });
  });

  it('reports a restart-effect setting as needing a restart', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'PUT', url: '/settings/crawlMaxDepth', headers: auth, payload: { value: 10 } });

    expect(response.json()).toMatchObject({ applied: false, restartRequired: true });
  });
});

describe('guarded settings', () => {
  it('refuses to widen network reach without a confirmation', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'PUT', url: '/settings/allowPrivateUrls', headers: auth, payload: { value: true } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'confirmation_required', confirm: 'allowPrivateUrls' });
  });

  it('refuses a confirmation naming a different setting', async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/settings/allowPrivateUrls',
      headers: auth,
      payload: { value: true, confirm: 'lightpandaEnabled' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('accepts the change when the confirmation names the setting', async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/settings/allowPrivateUrls',
      headers: auth,
      payload: { value: true, confirm: 'allowPrivateUrls' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ restartRequired: true });
  });
});

describe('DELETE /settings/:key', () => {
  it('reverts a live setting to the environment value straight away', async () => {
    const { app, live } = await buildApp();
    const response = await app.inject({ method: 'DELETE', url: '/settings/browserMaxContexts', headers: auth });

    expect(response.statusCode).toBe(200);
    expect((live.browserPool as unknown as { setLimits: ReturnType<typeof vi.fn> }).setLimits).toHaveBeenCalledWith({ maxContexts: 20 });
  });
});

describe('encryption key rotation', () => {
  it('refuses to rotate without the explicit confirmation', async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/settings/encryption-key/rotate',
      headers: auth,
      payload: { newKey: 'a'.repeat(64) },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ confirm: 'rotate-encryption-key' });
  });

  it('rejects a new key that is not 32 bytes', async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/settings/encryption-key/rotate',
      headers: auth,
      payload: { newKey: 'too-short', confirm: 'rotate-encryption-key' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /settings', () => {
  it('reports each setting with the environment value behind it', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/settings', headers: auth });
    const body = response.json() as { settings: { key: string; envValue: unknown; overridden: boolean; effect: string }[] };

    const contexts = body.settings.find((s) => s.key === 'browserMaxContexts');
    expect(contexts).toMatchObject({ envValue: 20, overridden: false, effect: 'live' });
  });

  it('never lists a setting that is not editable', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/settings', headers: auth });
    const body = response.json() as { settings: { key: string }[] };
    const keys = body.settings.map((s) => s.key);

    for (const forbidden of ['databaseUrl', 'port', 'internalAdminToken', 'encryptionKey', 'bootstrapKey']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
