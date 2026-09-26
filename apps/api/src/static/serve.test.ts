import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InternalTickets, registerAuth } from '../core/auth.js';
import { RateLimiter } from '../core/rate-limit.js';
import type { ApiKey } from '../core/api-keys.js';
import { isApiPath, registerStatic } from './serve.js';

const KEY: ApiKey = {
  id: '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  name: 'test',
  keyPrefix: 'helix-abcd',
  rateLimit: 1000,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastUsedAt: null,
  revokedAt: null,
};

let dir: string;
let app: FastifyInstance;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'helix-static-'));
  mkdirSync(join(dir, 'app', 'keys'), { recursive: true });
  mkdirSync(join(dir, '_next', 'static'), { recursive: true });
  writeFileSync(join(dir, 'app', 'index.html'), '<html>app home</html>');
  writeFileSync(join(dir, 'app', 'keys', 'index.html'), '<html>keys</html>');
  writeFileSync(join(dir, 'pricing.html'), '<html>pricing</html>');
  writeFileSync(join(dir, '404.html'), '<html>not found page</html>');
  writeFileSync(join(dir, '_next', 'static', 'chunk.js'), 'console.log(1)');

  app = Fastify();
  registerAuth(app, {
    verifyApiKey: async (token: string) => (token === 'helix-good' ? KEY : undefined),
    limiter: new RateLimiter({ limit: 1000, windowMs: 60_000 }),
    tickets: new InternalTickets(),
    open: ['/v1/health', '/settings'],
  });
  app.get('/v1/health', async () => ({ status: 'ok' }));
  app.get('/v1/keys', async () => ({ keys: [] }));
  await registerStatic(app, { dir });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('registerStatic', () => {
  it('redirects / to /app', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/app');
  });

  it('serves <path>/index.html for a directory page, without a key', async () => {
    const res = await app.inject({ method: 'GET', url: '/app' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toBe('<html>app home</html>');

    const nested = await app.inject({ method: 'GET', url: '/app/keys?tab=all' });
    expect(nested.statusCode).toBe(200);
    expect(nested.body).toBe('<html>keys</html>');

    const slash = await app.inject({ method: 'GET', url: '/app/keys/' });
    expect(slash.body).toBe('<html>keys</html>');
  });

  it('serves <path>.html before <path>/index.html', async () => {
    const res = await app.inject({ method: 'GET', url: '/pricing' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<html>pricing</html>');
  });

  it('serves assets by their own name', async () => {
    const res = await app.inject({ method: 'GET', url: '/_next/static/chunk.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('answers HEAD for a page', async () => {
    const res = await app.inject({ method: 'HEAD', url: '/app' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('');
  });

  it('answers an unknown page with the export 404.html and a 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('<html>not found page</html>');
  });

  it('never reads outside the export', async () => {
    const res = await app.inject({ method: 'GET', url: '/app/%2e%2e/%2e%2e/secret' });
    expect(res.statusCode).not.toBe(200);
    expect(res.body).not.toContain('app home');
  });

  it('leaves /v1 routes to the API', async () => {
    const health = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });

    const keys = await app.inject({ method: 'GET', url: '/v1/keys' });
    expect(keys.statusCode).toBe(401);
  });

  it('keeps auth on unknown API paths instead of swallowing them into the UI', async () => {
    for (const url of ['/v1/nope', '/v1', '/internal/keys', '/mcp']) {
      const anonymous = await app.inject({ method: 'GET', url });
      expect(anonymous.statusCode, url).toBe(401);
    }

    const keyed = await app.inject({ method: 'GET', url: '/v1/nope', headers: { authorization: 'Bearer helix-good' } });
    expect(keyed.statusCode).toBe(404);
    expect(keyed.headers['content-type']).toMatch(/application\/json/);
    expect(keyed.body).not.toContain('not found page');
  });

  it('does not serve the UI under /settings', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('not found page');
  });
});

describe('isApiPath', () => {
  it('matches the API prefixes on a segment boundary only', () => {
    expect(isApiPath('/v1')).toBe(true);
    expect(isApiPath('/v1/scrape')).toBe(true);
    expect(isApiPath('/settings')).toBe(true);
    expect(isApiPath('/internal/keys')).toBe(true);
    expect(isApiPath('/mcp')).toBe(true);
    expect(isApiPath('/v1beta')).toBe(false);
    expect(isApiPath('/app')).toBe(false);
  });
});
