import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Keeps a caller from pointing the browser at the instance itself or at the
 * network it sits on. The browser runs where Helix runs, so a `navigate` to
 * `http://localhost:7402` or a cloud metadata address would read back whatever
 * an unauthenticated request from this host can see. Only http(s) to a
 * publicly routable address passes. Hostnames are resolved here, ahead of the
 * navigation, so a name that points inward is caught the same as a raw address.
 */

export type Lookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

export const systemLookup: Lookup = (hostname) => dnsLookup(hostname, { all: true });

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export async function assertPublicUrl(raw: string, lookup: Lookup = systemLookup): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('not a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`${url.protocol.replace(/:$/, '')} URLs cannot be opened; only http and https`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new UnsafeUrlError('this instance cannot be told to open its own host');
  }

  if (isIP(host) !== 0) {
    if (!isPublicAddress(host)) throw new UnsafeUrlError(`${host} is not a public address`);
    return;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new UnsafeUrlError(`${host} did not resolve`);
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`${host} did not resolve`);

  for (const { address } of addresses) {
    if (!isPublicAddress(address)) {
      throw new UnsafeUrlError(`${host} resolves to ${address}, which is not a public address`);
    }
  }
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicV4(parseV4(address));
  if (family === 6) return isPublicV6(address);
  return false;
}

function parseV4(address: string): number[] {
  return address.split('.').map((part) => Number(part));
}

function isPublicV4([a, b]: number[]): boolean {
  if (a === undefined || b === undefined) return false;
  if (a === 0) return false; // this network
  if (a === 10) return false; // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC 1918
  if (a === 192 && b === 0) return false; // IETF protocol assignments
  if (a === 192 && b === 168) return false; // RFC 1918
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

function isPublicV6(address: string): boolean {
  const zoneless = address.split('%')[0] ?? address;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(zoneless);
  if (mapped?.[1]) return isPublicV4(parseV4(mapped[1]));

  const groups = expandV6(zoneless);
  if (!groups) return false;
  const first = groups[0] ?? 0;

  // ::ffff:a.b.c.d in hex form, which is how the URL parser writes it back.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const hi = groups[6] ?? 0;
    const lo = groups[7] ?? 0;
    return isPublicV4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }

  if (groups.every((g) => g === 0)) return false; // unspecified
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return false; // loopback
  if ((first & 0xfe00) === 0xfc00) return false; // unique local
  if ((first & 0xffc0) === 0xfe80) return false; // link-local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x0064 && groups[1] === 0xff9b) return false; // NAT64 well-known prefix
  if (first === 0x2001 && groups[1] === 0x0db8) return false; // documentation
  return true;
}

function expandV6(address: string): number[] | undefined {
  const halves = address.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return undefined;
  const filler = halves.length === 2 ? Array<string>(missing).fill('0') : [];
  const groups = [...head, ...filler, ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isFinite(g)) ? groups : undefined;
}
