import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { localFetch } from '../src/local-fetch';

let server: Server | undefined;

async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe('localFetch', () => {
  it('returns status, ok, headers and a parsed JSON body', async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end('{"status":"degraded","version":"2.3.2"}');
    });
    const response = await localFetch(`${origin}/v1/health`);
    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(await response.json()).toEqual({ status: 'degraded', version: '2.3.2' });
  });

  it('sends the method and headers it is given', async () => {
    let seen = '';
    const origin = await serve((req, res) => {
      seen = `${req.method} ${req.headers.authorization}`;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end();
    });
    const response = await localFetch(`${origin}/app`, { method: 'HEAD', headers: { authorization: 'Bearer k' } });
    expect(seen).toBe('HEAD Bearer k');
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toBe('text/html');
  });

  it('rejects when the signal aborts before the server answers', async () => {
    const origin = await serve(() => {});
    await expect(localFetch(`${origin}/slow`, { signal: AbortSignal.timeout(50) })).rejects.toThrow();
  });

  it('rejects when nothing is listening', async () => {
    const origin = await serve((_req, res) => res.end());
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    await expect(localFetch(`${origin}/`)).rejects.toThrow();
  });
});
