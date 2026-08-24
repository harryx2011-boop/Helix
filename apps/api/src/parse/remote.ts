import { promises as dns } from 'node:dns';
import { BlockList, isIP } from 'node:net';

/**
 * Where `/parse` is allowed to fetch from.
 *
 * The url path fetches from inside the gateway, next to helix-fetch,
 * helix-extract, Postgres and the browser tier. A key holder must not be able
 * to point it at any of those, so the host is resolved and every address it
 * yields is checked against the non-public ranges before a connection opens,
 * and again on every redirect.
 */

export type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export const defaultLookup: Lookup = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

const blocked = new BlockList();
for (const [subnet, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(subnet, prefix, 'ipv4');
}
for (const [subnet, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(subnet, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

export class HostNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostNotAllowedError';
  }
}

/**
 * Throws when the URL may not be fetched. Resolution failures are left to the
 * fetch itself so they keep their `dns` classification.
 */
export async function assertPublicUrl(url: URL, lookup: Lookup): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HostNotAllowedError('`url` must use http or https.');
  }
  if (url.username || url.password) {
    throw new HostNotAllowedError('`url` must not carry credentials.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const refuse = (): never => {
    throw new HostNotAllowedError(
      '`url` must point at a public host; localhost, private, link-local and internal addresses are refused.',
    );
  };

  if (host === 'localhost' || host.endsWith('.localhost')) refuse();

  if (isIP(host)) {
    if (!isPublicAddress(host)) refuse();
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host);
  } catch {
    return;
  }
  if (addresses.length === 0) return;
  if (addresses.some((a) => !isPublicAddress(a.address))) refuse();
}
