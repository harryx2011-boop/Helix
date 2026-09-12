import { connect } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { InternalTickets, registerAuth } from './auth.js';
import { RateLimiter } from './rate-limit.js';
import type { ApiKey } from './api-keys.js';

/**
 * Which paths the open list actually opens.
 *
 * The list is a prefix match, so anything that makes a protected path *start*
 * with `/v1/health` is a bypass. `app.inject` normalises `..` away and cannot
 * reproduce it, so these drive a real socket and write the request line by
 * hand.
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

let app: FastifyInstance | undefined;

async function listen(): Promise<number> {
  const built = Fastify();
  registerAuth(built, {
    verifyApiKey: async (token: string) => (token === 'helix-good' ? KEY : undefined),
    limiter: new RateLimiter({ limit: 1000, windowMs: 60_000 }),
    tickets: new InternalTickets(),
    open: ['/v1/health'],
  });
  built.get('/v1/health', async () => ({ ok: true }));
  built.get('/v1/keys', async () => ({ keys: [] }));
  await built.listen({ port: 0, host: '127.0.0.1' });
  app = built;
  const address = built.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  return address.port;
}

/** Sends a request line verbatim, so the literal path reaches the server unnormalised. */
function rawGet(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let body = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      body += chunk;
    });
    socket.on('end', () => resolve(body));
    socket.on('error', reject);
  });
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('open prefix matching', () => {
  it('rejects a path that only reaches an open prefix through a .. segment', async () => {
    const port = await listen();

    const response = await rawGet(port, '/v1/health/../keys');

    expect(response).toContain('401');
    expect(response).not.toContain('"keys"');
  });

  it('rejects a path that hides the .. segment behind an encoded dot', async () => {
    const port = await listen();

    const response = await rawGet(port, '/v1/health/%2e%2e/keys');

    expect(response).toContain('401');
    expect(response).not.toContain('"keys"');
  });

  it('keeps an open path open when it carries a query string', async () => {
    const port = await listen();

    const response = await rawGet(port, '/v1/health?x=1');

    expect(response).toContain('200');
    expect(response).toContain('"ok":true');
  });

  it('keeps a plain open path open', async () => {
    const port = await listen();

    const response = await rawGet(port, '/v1/health');

    expect(response).toContain('200');
  });

  it('still protects an unrelated path', async () => {
    const port = await listen();

    const response = await rawGet(port, '/v1/keys');

    expect(response).toContain('401');
  });
});
