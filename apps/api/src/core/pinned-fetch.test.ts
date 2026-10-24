import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinnedFetch } from './pinned-fetch.js';

/**
 * The pinned fetch checks what a name resolves to inside the connection's own
 * lookup, so the address it checked is the address it connects to. A local
 * server stands in for the private target: a refused request never reaches it.
 */

let server: Server;
let port = 0;
let hits = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    hits++;
    if (request.url === '/hop') {
      response.writeHead(302, { location: 'http://169.254.169.254/' });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain', 'x-seen-method': request.method ?? '' });
    response.end(`hello ${request.headers['user-agent'] ?? ''}`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const toLoopback = async () => [{ address: '127.0.0.1', family: 4 }];

describe('createPinnedFetch', () => {
  it('refuses a private address literal without connecting', async () => {
    hits = 0;
    const pinned = createPinnedFetch();
    await expect(pinned(`http://127.0.0.1:${port}/`)).rejects.toThrow(/not a public address/);
    expect(hits).toBe(0);
  });

  it('refuses a name that resolves to a private address without connecting', async () => {
    hits = 0;
    const pinned = createPinnedFetch({ lookup: toLoopback });
    await expect(pinned(`http://rebind.helix-test:${port}/`)).rejects.toThrow(/not a public address/);
    expect(hits).toBe(0);
  });

  it('refuses a scheme other than http and https', async () => {
    const pinned = createPinnedFetch();
    await expect(pinned('file:///etc/passwd')).rejects.toThrow(/http/);
  });

  it('connects to the address the lookup checked and returns a Response', async () => {
    hits = 0;
    const pinned = createPinnedFetch({ lookup: toLoopback, blocked: () => false });
    const response = await pinned(`http://named.helix-test:${port}/`, { headers: { 'user-agent': 'helix-test' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(await response.text()).toBe('hello helix-test');
    expect(hits).toBe(1);
  });

  it('never follows a redirect, so the caller checks every hop', async () => {
    const pinned = createPinnedFetch({ lookup: toLoopback, blocked: () => false });
    const response = await pinned(`http://named.helix-test:${port}/hop`, { redirect: 'manual' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://169.254.169.254/');
  });

  it('sends the method and body it is given', async () => {
    const pinned = createPinnedFetch({ lookup: toLoopback, blocked: () => false });
    const response = await pinned(`http://named.helix-test:${port}/`, { method: 'POST', body: '{}' });

    expect(response.headers.get('x-seen-method')).toBe('POST');
  });
});
