import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Where a webhook may be sent.
 *
 * A caller-supplied URL that the API then POSTs to, with caller-supplied
 * headers and body, is a request forged from inside the deployment. Only
 * public http(s) hosts qualify: loopback, private, link-local, carrier-grade
 * NAT, multicast and the cloud metadata address are refused, both as literals
 * when the monitor is created and again when the name is resolved at send
 * time.
 */

export class BlockedTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedTargetError';
  }
}

function ipv4Octets(ip: string): number[] {
  return ip.split('.').map((part) => Number.parseInt(part, 10));
}

function isPublicIpv4(ip: string): boolean {
  const [a, b] = ipv4Octets(ip) as [number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

/** Eight 16-bit groups, or null when the text is not an IPv6 address. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip;
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);

  // A trailing dotted quad (::ffff:10.0.0.1) becomes two groups.
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const [a, b, c, d] = ipv4Octets(tail) as [number, number, number, number];
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array<string>(missing).fill('0'), ...rest].map((g) => Number.parseInt(g || '0', 16));
  return groups.length === 8 && groups.every((g) => Number.isFinite(g)) ? groups : null;
}

function isPublicIpv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  if (g.every((x) => x === 0)) return false;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) return false;
  if ((g0 & 0xfe00) === 0xfc00) return false;
  if ((g0 & 0xffc0) === 0xfe80) return false;
  if ((g0 & 0xff00) === 0xff00) return false;
  const embedded = `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return isPublicIpv4(embedded);
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPublicIpv4(embedded);
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPublicIpv4(ip);
  if (version === 6) return isPublicIpv6(ip);
  return false;
}

/**
 * The reason a URL cannot be a webhook target on its face, or null when it
 * may be. Needs no network: scheme and literal address only. Names are
 * resolved and checked again at send time.
 */
export function webhookTargetProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'must be an absolute URL';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'must use http or https';
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return 'must not point at this host';
  if (isIP(host) !== 0 && !isPublicAddress(host)) return 'must be a public address';
  return null;
}

export type Resolve = (host: string) => Promise<string[]>;

const resolveAll: Resolve = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);

/** Resolve the host and refuse the send when any answer is a private address. */
export async function assertPublicTarget(raw: string, resolve: Resolve = resolveAll): Promise<void> {
  const problem = webhookTargetProblem(raw);
  if (problem) throw new BlockedTargetError(`webhook url ${problem}`);
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return;
  const addresses = await resolve(host);
  if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
    throw new BlockedTargetError('webhook host resolves to a private address');
  }
}
