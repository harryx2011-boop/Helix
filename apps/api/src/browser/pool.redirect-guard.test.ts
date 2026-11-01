import { createServer, type Server } from 'node:http';
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { connect, type AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserPool } from './pool.js';
import { RENDER_ENGINES } from './engines.js';
import { isPrivateAddress } from '../core/url-guard.js';

/**
 * The pool's private-address guard against everything a page route cannot see.
 *
 * Measured on Chromium: a 302 to localhost is followed and served while the
 * route sees only the first URL, and a route never sees a WebSocket or WebRTC
 * at all. So each test starts a page on a name the guard believes is public,
 * makes the page reach for a private listener some other way, and asserts the
 * listener was never touched.
 *
 * `localtest.me` resolves to 127.0.0.1 in public DNS, so the old code (where the
 * browser did its own lookup) reached the fixture; the injected lookup calls it
 * public, and the injected `connect` takes that public answer to the fixture.
 */

const PUBLIC_ANSWER = '93.184.215.14';
const NAME = 'localtest.me';

let site: Server;
let sitePort = 0;
let listener: Server;
let listenerPort = 0;
let listenerHits = 0;
let udp: UdpSocket;
let udpPort = 0;
let udpPackets = 0;
const siteSaw: string[] = [];
const dialed: string[] = [];

/** This machine's own private LAN address, reachable by a listener on 0.0.0.0. */
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal && isPrivateAddress(i.address) && !i.address.startsWith('169.254.'))
  ?.address;

beforeAll(async () => {
  listener = createServer((_, response) => response.end('secret'));
  // Counted per connection, so a WebSocket handshake counts as much as a GET.
  listener.on('connection', () => listenerHits++);
  await new Promise<void>((resolve) => listener.listen(0, '0.0.0.0', resolve));
  listenerPort = (listener.address() as AddressInfo).port;

  udp = createSocket('udp4');
  udp.on('message', () => udpPackets++);
  await new Promise<void>((resolve) => udp.bind(0, '127.0.0.1', resolve));
  udpPort = udp.address().port;

  site = createServer((request, response) => {
    const path = request.url ?? '/';
    siteSaw.push(path);
    const redirect = (to: string) => {
      response.writeHead(302, { location: to });
      response.end();
    };
    const html = (body: string) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<html><body>${body}</body></html>`);
    };
    if (path === '/to-loopback') return redirect(`http://127.0.0.1:${listenerPort}/secret`);
    if (path === '/to-loopback-https') return redirect(`https://127.0.0.1:${listenerPort}/secret`);
    if (path === '/to-metadata') return redirect('http://169.254.169.254/latest/meta-data/');
    if (path === '/img-to-lan') return redirect(`http://${lanAddress}:${listenerPort}/x.png`);
    if (path === '/lan-sub') return html('<p>page</p><img src="/img-to-lan">');
    if (path === '/ws') {
      return html(`<p>page</p><script>try { new WebSocket('ws://127.0.0.1:${listenerPort}/'); } catch {}</script>`);
    }
    if (path === '/stun') {
      return html(`<p>page</p><script>
        try {
          const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${udpPort}' }] });
          pc.createDataChannel('x');
          pc.createOffer().then((o) => pc.setLocalDescription(o));
        } catch {}
      </script>`);
    }
    return html('<p>public page</p>');
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  sitePort = (site.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => site.close(() => resolve()));
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  udp.close();
});

function pool(overrides: Partial<ConstructorParameters<typeof BrowserPool>[0]> = {}) {
  return new BrowserPool({
    size: 1,
    maxContexts: 4,
    recycleAfter: 100,
    lookup: async (host) => (host === NAME ? [{ address: PUBLIC_ANSWER, family: 4 }] : []),
    connect: (address: string, port: number) => {
      dialed.push(address);
      return connect(port, address === PUBLIC_ANSWER ? '127.0.0.1' : address);
    },
    ...overrides,
  });
}

const url = (path: string) => `http://${NAME}:${sitePort}${path}`;

function reset(): void {
  listenerHits = 0;
  udpPackets = 0;
  siteSaw.length = 0;
  dialed.length = 0;
}

describe('a redirect cannot take the pool to a private address', () => {
  for (const engine of RENDER_ENGINES) {
    it(`refuses a redirect to a loopback listener on ${engine}`, async () => {
      const browsers = pool({ defaultEngine: engine });
      try {
        reset();
        const result = await browsers.render({ url: url('/to-loopback'), timeout: 20_000 });
        expect(siteSaw).toContain('/to-loopback');
        expect(listenerHits).toBe(0);
        expect(result.error ?? '').toMatch(/private or local address/);
        expect(result.html ?? '').not.toContain('secret');
      } finally {
        await browsers.close();
      }
    }, 90_000);
  }

  it('refuses an https redirect to a loopback listener', async () => {
    const browsers = pool();
    try {
      reset();
      const result = await browsers.render({ url: url('/to-loopback-https'), timeout: 20_000 });
      expect(siteSaw).toContain('/to-loopback-https');
      expect(listenerHits).toBe(0);
      expect(result.error ?? '').toMatch(/private or local address/);
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('refuses a redirect to the cloud metadata address', async () => {
    const browsers = pool();
    try {
      reset();
      const result = await browsers.render({ url: url('/to-metadata'), timeout: 10_000 });
      expect(siteSaw).toContain('/to-metadata');
      expect(result.error ?? '').toMatch(/private or local address/);
      expect(dialed).not.toContain('169.254.169.254');
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('keeps link-local refused even when the operator allows private addresses', async () => {
    const browsers = pool();
    try {
      reset();
      const result = await browsers.render({ url: url('/to-metadata'), timeout: 10_000, allowPrivate: true });
      expect(result.error ?? '').toMatch(/private or local address/);
      expect(dialed).not.toContain('169.254.169.254');
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it.skipIf(!lanAddress)('refuses a subresource redirected to a LAN address', async () => {
    const browsers = pool();
    try {
      reset();
      const result = await browsers.render({ url: url('/lan-sub'), timeout: 20_000 });
      expect(result.error).toBeUndefined();
      expect(siteSaw).toContain('/img-to-lan');
      expect(listenerHits).toBe(0);
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('refuses a WebSocket to loopback', async () => {
    const browsers = pool();
    try {
      reset();
      await browsers.render({ url: url('/ws'), waitFor: 1_500, timeout: 20_000 });
      expect(siteSaw).toContain('/ws');
      expect(listenerHits).toBe(0);
    } finally {
      await browsers.close();
    }
  }, 90_000);

  it('sends no WebRTC packet around the guard on the full chromium build', async () => {
    const browsers = pool({ browserChannel: 'chromium' });
    try {
      reset();
      await browsers.render({ url: url('/stun'), waitFor: 2_000, timeout: 20_000 });
      expect(siteSaw).toContain('/stun');
      expect(udpPackets).toBe(0);
    } finally {
      await browsers.close();
    }
  }, 90_000);

  for (const engine of RENDER_ENGINES) {
    it(`sends no WebRTC packet around the guard on ${engine}`, async () => {
      const browsers = pool({ defaultEngine: engine });
      try {
        reset();
        await browsers.render({ url: url('/stun'), waitFor: 2_000, timeout: 20_000 });
        expect(siteSaw).toContain('/stun');
        expect(udpPackets).toBe(0);
      } finally {
        await browsers.close();
      }
    }, 90_000);
  }

  it('guards a leased page (interact) the same way', async () => {
    const browsers = pool();
    const lease = await browsers.lease();
    try {
      reset();
      await lease.page.goto(url('/to-loopback'), { timeout: 20_000 }).catch(() => undefined);
      expect(siteSaw).toContain('/to-loopback');
      expect(listenerHits).toBe(0);
    } finally {
      await lease.close();
      await browsers.close();
    }
  }, 90_000);

  it('still renders a public page through the guard', async () => {
    const browsers = pool();
    try {
      reset();
      const result = await browsers.render({ url: url('/'), timeout: 20_000 });
      expect(result.error).toBeUndefined();
      expect(result.html).toContain('public page');
      expect(dialed).toContain(PUBLIC_ANSWER);
    } finally {
      await browsers.close();
    }
  }, 90_000);
});
