import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';
import { isPrivateAddress, systemLookup, UnsafeUrlError, type Lookup } from './url-guard.js';

/**
 * A fetch whose address check and connection use the same DNS answer.
 *
 * Checking a name and then calling `fetch` resolves it twice, and a name with
 * a zero TTL can answer a public address to the check and a private one to the
 * connection. Here the check runs inside the socket's own lookup, so the
 * address that passed is the address connected to.
 *
 * It never follows redirects: callers that follow them do so by hand and send
 * each hop back through this function. It does not decompress bodies, so it
 * sends no Accept-Encoding of its own.
 */

export interface PinnedFetchOptions {
  /** True for an address that must not be reached. Defaults to every non-public address. */
  blocked?: ((address: string) => boolean) | undefined;
  lookup?: Lookup | undefined;
}

export type PinnedFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

function bareHost(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function guardedLookup(lookupFn: Lookup, blocked: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    lookupFn(hostname).then(
      (answers) => {
        const bad = answers.find((answer) => blocked(answer.address));
        const first = answers[0];
        if (bad || !first) {
          const reason = bad ? `${hostname} resolves to ${bad.address}, which is not a public address` : `${hostname} did not resolve`;
          callback(new UnsafeUrlError(reason), '', 0);
          return;
        }
        if (options.all) callback(null, answers);
        else callback(null, first.address, first.family);
      },
      (error: NodeJS.ErrnoException) => callback(error, '', 0),
    );
  };
}

function toResponse(message: IncomingMessage, method: string): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else if (value !== undefined) headers.set(name, value);
  }
  const status = message.statusCode ?? 0;
  const hasBody = !NULL_BODY_STATUS.has(status) && method !== 'HEAD';
  if (!hasBody) message.resume();
  const body = hasBody ? (Readable.toWeb(message) as ReadableStream<Uint8Array>) : null;
  return new Response(body, { status, statusText: message.statusMessage ?? '', headers });
}

export function createPinnedFetch(options: PinnedFetchOptions = {}): PinnedFetch {
  const blocked = options.blocked ?? isPrivateAddress;
  const lookup = guardedLookup(options.lookup ?? systemLookup, blocked);

  return (input, init = {}) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(String(input));
      const send = url.protocol === 'https:' ? httpsRequest : url.protocol === 'http:' ? httpRequest : undefined;
      if (!send) {
        reject(new UnsafeUrlError('only http and https URLs are fetched'));
        return;
      }
      const host = bareHost(url.hostname);
      if (isIP(host) !== 0 && blocked(host)) {
        reject(new UnsafeUrlError(`${host} is not a public address`));
        return;
      }

      const method = (init.method ?? 'GET').toUpperCase();
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((value, name) => {
        headers[name] = value;
      });
      const request = send(url, {
        method,
        headers,
        lookup,
        ...(init.signal ? { signal: init.signal } : {}),
      });
      request.on('response', (message) => resolve(toResponse(message, method)));
      request.on('error', reject);
      const body = init.body;
      if (typeof body === 'string' || body instanceof Uint8Array) request.end(body);
      else request.end();
    });
}

/** The default pinned fetch: every non-public address refused. */
export const pinnedFetch: PinnedFetch = createPinnedFetch();
