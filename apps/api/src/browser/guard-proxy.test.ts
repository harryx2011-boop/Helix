import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGuardProxy } from './guard-proxy.js';
import { isAlwaysBlocked } from '../core/url-guard.js';

/** The pool's guard proxy on its own: what it answers before any browser is involved. */

let origin: Server;
let port = 0;

beforeAll(async () => {
  origin = createServer((request, response) => response.end(`saw ${request.method} ${request.url}`));
  await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
  port = (origin.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => origin.close(() => resolve()));
});

async function exchange(proxyUrl: string, request: string): Promise<string> {
  const { port: proxyPort } = new URL(proxyUrl);
  const socket = connect(Number(proxyPort), '127.0.0.1');
  socket.write(request);
  let reply = '';
  socket.on('data', (chunk) => (reply += chunk.toString('latin1')));
  await new Promise<void>((resolve) => {
    socket.on('close', () => resolve());
    setTimeout(() => {
      socket.destroy();
      resolve();
    }, 3_000);
  });
  return reply;
}

/** Stands in for a public answer: the proxy connects to what the check passed, mapped here to the fixture. */
const publicLookup = async (host: string) =>
  host === 'public.test' ? [{ address: '93.184.215.14', family: 4 }] : [];
const toFixture = (address: string, p: number) => connect(p, address === '93.184.215.14' ? '127.0.0.1' : address);

describe('the guard proxy', () => {
  it('refuses a CONNECT to a private literal', async () => {
    const proxy = await startGuardProxy();
    try {
      const reply = await exchange(proxy.url, `CONNECT 127.0.0.1:${port} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
      expect(reply).toMatch(/^HTTP\/1\.1 403/);
      expect(proxy.refused.has(`127.0.0.1:${port}`)).toBe(true);
    } finally {
      await proxy.close();
    }
  });

  it('refuses a name with any private answer', async () => {
    const proxy = await startGuardProxy({
      lookup: async () => [
        { address: '93.184.215.14', family: 4 },
        { address: '10.0.0.7', family: 4 },
      ],
      connect: toFixture,
    });
    try {
      const reply = await exchange(proxy.url, `CONNECT mixed.test:${port} HTTP/1.1\r\nHost: mixed.test:${port}\r\n\r\n`);
      expect(reply).toMatch(/^HTTP\/1\.1 403/);
    } finally {
      await proxy.close();
    }
  });

  it('refuses a plain-HTTP request to a private address without forwarding it', async () => {
    const proxy = await startGuardProxy();
    try {
      const reply = await exchange(
        proxy.url,
        `GET http://127.0.0.1:${port}/secret HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
      );
      expect(reply).toMatch(/^HTTP\/1\.1 403/);
      expect(reply).not.toContain('saw GET');
    } finally {
      await proxy.close();
    }
  });

  it('forwards plain HTTP to the checked address in origin form', async () => {
    const proxy = await startGuardProxy({ lookup: publicLookup, connect: toFixture });
    try {
      const reply = await exchange(
        proxy.url,
        `GET http://public.test:${port}/page?q=1 HTTP/1.1\r\nHost: public.test:${port}\r\nConnection: close\r\n\r\n`,
      );
      expect(reply).toMatch(/^HTTP\/1\.1 200/);
      expect(reply).toContain('saw GET /page?q=1');
    } finally {
      await proxy.close();
    }
  });

  it('tunnels a CONNECT to the checked address', async () => {
    const proxy = await startGuardProxy({ lookup: publicLookup, connect: toFixture });
    try {
      const reply = await exchange(
        proxy.url,
        `CONNECT public.test:${port} HTTP/1.1\r\nHost: public.test:${port}\r\n\r\n` +
          `GET /tunnelled HTTP/1.1\r\nHost: public.test\r\nConnection: close\r\n\r\n`,
      );
      expect(reply).toMatch(/^HTTP\/1\.1 200 Connection Established/);
      expect(reply).toContain('saw GET /tunnelled');
    } finally {
      await proxy.close();
    }
  });

  it('with private targets allowed, still refuses link-local', async () => {
    const proxy = await startGuardProxy({ blocked: isAlwaysBlocked });
    try {
      const metadata = await exchange(proxy.url, 'CONNECT 169.254.169.254:80 HTTP/1.1\r\nHost: x\r\n\r\n');
      expect(metadata).toMatch(/^HTTP\/1\.1 403/);
      const loopback = await exchange(
        proxy.url,
        `GET http://127.0.0.1:${port}/ok HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
      );
      expect(loopback).toContain('saw GET /ok');
    } finally {
      await proxy.close();
    }
  });
});
