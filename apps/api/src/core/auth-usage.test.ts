import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { InternalTickets, registerAuth } from './auth.js';
import { RateLimiter } from './rate-limit.js';
import type { ApiKey } from './api-keys.js';

/**
 * The recorder is only worth having if the auth hook actually calls it. A
 * usage module wired to nothing looks identical to a working one from the
 * outside, so these assert the hook itself rather than the module.
 */

const KEY: ApiKey = {
  id: '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  name: 'test',
  keyPrefix: 'helix-abcd',
  rateLimit: 1000,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastUsedAt: null,
  revokedAt: null,
};

function build(usage: { record: ReturnType<typeof vi.fn> } | undefined, rateLimit = 1000) {
  const app = Fastify();
  // The limiter takes the key's own rateLimit as an override, so the budget
  // under test lives on the key rather than on the limiter.
  const key: ApiKey = { ...KEY, rateLimit };
  registerAuth(app, {
    verifyApiKey: async (token: string) => (token === 'helix-good' ? key : undefined),
    limiter: new RateLimiter({ limit: 1000, windowMs: 60_000 }),
    tickets: new InternalTickets(),
    open: ['/v1/health'],
    ...(usage ? { usage: usage as never } : {}),
  });
  app.get('/v1/health', async () => ({ ok: true }));
  app.get('/v1/scrape', async () => ({ ok: true }));
  app.get('/v1/boom', async (_req, reply) => reply.code(500).send({ error: 'internal_error' }));
  return app;
}

describe('auth usage recording', () => {
  it('records an authenticated request with its status and path', async () => {
    const record = vi.fn();
    const app = build({ record });

    const res = await app.inject({ method: 'GET', url: '/v1/scrape', headers: { authorization: 'Bearer helix-good' } });

    expect(res.statusCode).toBe(200);
    expect(record).toHaveBeenCalledWith(KEY.id, '/v1/scrape', 200);
    await app.close();
  });

  it('records a rate-limited request, which is the number the headroom panel exists to show', async () => {
    const record = vi.fn();
    const app = build({ record }, 1);

    await app.inject({ method: 'GET', url: '/v1/scrape', headers: { authorization: 'Bearer helix-good' } });
    const limited = await app.inject({
      method: 'GET',
      url: '/v1/scrape',
      headers: { authorization: 'Bearer helix-good' },
    });

    expect(limited.statusCode).toBe(429);
    expect(record).toHaveBeenCalledWith(KEY.id, '/v1/scrape', 429);
    await app.close();
  });

  it('records a server error under its own class', async () => {
    const record = vi.fn();
    const app = build({ record });

    await app.inject({ method: 'GET', url: '/v1/boom', headers: { authorization: 'Bearer helix-good' } });

    expect(record).toHaveBeenCalledWith(KEY.id, '/v1/boom', 500);
    await app.close();
  });

  it('records nothing for an open route, which has no key to attribute', async () => {
    const record = vi.fn();
    const app = build({ record });

    const res = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(res.statusCode).toBe(200);
    expect(record).not.toHaveBeenCalled();
    await app.close();
  });

  it('records nothing when the key is rejected', async () => {
    const record = vi.fn();
    const app = build({ record });

    const res = await app.inject({ method: 'GET', url: '/v1/scrape', headers: { authorization: 'Bearer helix-bad' } });

    expect(res.statusCode).toBe(401);
    expect(record).not.toHaveBeenCalled();
    await app.close();
  });

  it('serves normally with no recorder configured', async () => {
    const app = build(undefined);
    const res = await app.inject({ method: 'GET', url: '/v1/scrape', headers: { authorization: 'Bearer helix-good' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
