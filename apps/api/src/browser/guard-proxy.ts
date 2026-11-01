import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect as netConnect, isIP, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { isPrivateAddress, systemLookup, type Lookup } from '../core/url-guard.js';

/**
 * The pool's private-address guard: a loopback proxy every browser connection goes through.
 *
 * A page route cannot enforce the guard. Measured on Chromium, Firefox and WebKit: a 302 to
 * a loopback listener was followed and served while the route saw only the first URL, and a
 * route never sees a WebSocket. A proxy sees every connection (redirect hops, subresources,
 * workers, WebSockets), and a browser does no DNS of its own for a proxied request. So each
 * host is resolved here once, refused when any answer is blocked, and the connection goes to
 * the address that was checked: the rule `core/pinned-fetch.ts` and helix-scrape's
 * `guard_proxy.py` apply.
 *
 * Playwright adds `<-loopback>` to a context's bypass list when a proxy is set, so loopback
 * URLs come through here too instead of going around.
 */

export type Connect = (address: string, port: number) => Socket;

export interface GuardProxyOptions {
  lookup?: Lookup | undefined;
  /** True for an address that must not be reached. Defaults to every non-public address. */
  blocked?: ((address: string) => boolean) | undefined;
  /** Opens the upstream connection to a checked address. Injected by tests. */
  connect?: Connect | undefined;
}

export interface GuardProxy {
  /** `http://127.0.0.1:<port>`, for a browser context's `proxy.server`. */
  url: string;
  /** `host:port` of every refused connection, so a failed render can say why. */
  refused: Set<string>;
  close(): Promise<void>;
}

const CONNECT_TIMEOUT_MS = 10_000;
const REFUSED = 'private or local address, not fetched';

class Refused extends Error {}

/** `host:port` of a URL, with the scheme's default port and IPv6 brackets dropped. */
export function authorityOf(raw: string | undefined): string {
  try {
    const url = new URL(raw ?? '');
    const port = url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? '443' : '80');
    return `${bare(url.hostname)}:${port}`;
  } catch {
    return '';
  }
}

function bare(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

export async function startGuardProxy(options: GuardProxyOptions = {}): Promise<GuardProxy> {
  const lookup = options.lookup ?? systemLookup;
  const blocked = options.blocked ?? isPrivateAddress;
  const dial = options.connect ?? ((address, port) => netConnect(port, address));
  const refused = new Set<string>();
  const sockets = new Set<Duplex>();
  const track = (socket: Duplex): void => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  };

  /** The checked addresses for a host, or a throw: `Refused` for a blocked answer. */
  const check = async (host: string, port: number): Promise<string[]> => {
    if (isIP(host) !== 0) {
      if (blocked(host)) throw new Refused(host);
      return [host];
    }
    const answers = await lookup(host).catch(() => []);
    if (answers.some((answer) => blocked(answer.address))) throw new Refused(host);
    if (answers.length === 0) throw new Error(`${host}:${port} did not resolve`);
    return answers.map((answer) => answer.address);
  };

  const open = async (addresses: string[], port: number): Promise<Socket> => {
    let last: unknown;
    for (const address of addresses) {
      try {
        return await new Promise<Socket>((resolve, reject) => {
          const socket = dial(address, port);
          const timer = setTimeout(() => socket.destroy(new Error('connect timeout')), CONNECT_TIMEOUT_MS);
          socket.once('connect', () => {
            clearTimeout(timer);
            socket.removeListener('error', reject);
            resolve(socket);
          });
          socket.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
          });
        });
      } catch (error) {
        last = error;
      }
    }
    throw last instanceof Error ? last : new Error('connection failed');
  };

  /** Resolves, checks and connects; on failure answers the client itself and returns nothing. */
  const upstreamFor = async (
    host: string,
    port: number,
    refuse: (status: number, reason: string) => void,
  ): Promise<Socket | undefined> => {
    try {
      const socket = await open(await check(host, port), port);
      track(socket);
      return socket;
    } catch (error) {
      if (error instanceof Refused) {
        refused.add(`${host}:${port}`);
        refuse(403, REFUSED);
      } else {
        refuse(502, 'connection failed');
      }
      return undefined;
    }
  };

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      let target: URL;
      try {
        target = new URL(request.url ?? '');
        if (target.protocol !== 'http:') throw new Error('absolute http URL expected');
      } catch {
        response.writeHead(400).end('malformed proxy request');
        return;
      }
      const host = bare(target.hostname);
      const port = Number(target.port || 80);
      const socket = await upstreamFor(host, port, (status, reason) => {
        response.writeHead(status, { 'content-type': 'text/plain', connection: 'close' }).end(reason);
      });
      if (!socket) return;

      const headers: string[] = [];
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const name = request.rawHeaders[i] ?? '';
        if (/^proxy-/i.test(name)) continue;
        headers.push(name, request.rawHeaders[i + 1] ?? '');
      }
      // Never follows redirects: a Location goes back to the browser, which asks again here.
      const upstream = httpRequest({
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers,
        setHost: false,
        createConnection: () => socket,
      });
      upstream.on('response', (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.statusMessage, reply.rawHeaders);
        reply.pipe(response);
      });
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502).end('connection failed');
        else response.destroy();
      });
      request.pipe(upstream);
    })();
  });

  server.on('connection', track);

  // HTTPS, WebSockets and anything else a browser tunnels.
  server.on('connect', (request: IncomingMessage, client: Duplex, head: Buffer) => {
    void (async () => {
      const authority = /^\[?([^\]]+?)\]?:(\d+)$/.exec(request.url ?? '');
      if (!authority?.[1] || !authority[2]) {
        client.end('HTTP/1.1 400 Bad Request\r\nconnection: close\r\n\r\n');
        return;
      }
      const host = authority[1];
      const port = Number(authority[2]);
      const upstream = await upstreamFor(host, port, (status, reason) => {
        client.end(`HTTP/1.1 ${status} ${reason}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n`);
      });
      if (!upstream) return;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.pipe(upstream).pipe(client);
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    refused,
    close: async () => {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      for (const socket of sockets) socket.destroy();
      await closed;
    },
  };
}
