import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * Egress guard for caller-supplied URLs.
 *
 * An API key is a low-trust boundary for a scraper: keys are handed to many
 * users, and every one of them chooses what this instance fetches. Without a
 * check, `http://169.254.169.254/` returns the host's cloud credentials in
 * `rawHtml`, and internal services become reachable through the fetch tiers.
 *
 * Two layers: `checkUrl` runs once per request in the route (scheme, literal
 * address, DNS resolution), and `isPrivateHost` is the literal-only check the
 * fetch tiers apply to every redirect hop.
 */

export type HostResolver = (hostname: string) => Promise<string[]>;

export interface UrlGuardOptions {
  /** Operator opt-in for instances that scrape their own intranet. */
  allowPrivate?: boolean | undefined;
  resolve?: HostResolver | undefined;
}

export type UrlVerdict = { ok: true } | { ok: false; reason: string };

const V4_BLOCKED: readonly [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0);
}

function inV4Block(ip: string, base: string, bits: number): boolean {
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((v4ToInt(ip) & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
}

function isPrivateV4(ip: string): boolean {
  return V4_BLOCKED.some(([base, bits]) => inV4Block(ip, base, bits));
}

function v4FromGroups(hi: number, lo: number): string {
  return `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
}

/** Eight 16-bit groups, or undefined when the literal does not parse. */
function expandV6(ip: string): number[] | undefined {
  let text = ip;
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);

  // An embedded dotted-quad tail (::ffff:10.0.0.1) becomes two groups.
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (isIP(tail) !== 4) return undefined;
    const n = v4ToInt(tail);
    text = `${text.slice(0, lastColon)}:${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return undefined;

  const groups = [...head, ...Array.from({ length: fill }, () => '0'), ...rest].map((g) =>
    Number.parseInt(g, 16),
  );
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return undefined;
  return groups;
}

function isPrivateV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return true;

  const isZero = (from: number, to: number): boolean => g.slice(from, to).every((x) => x === 0);
  const first = g[0] ?? 0;

  // :: and ::1
  if (isZero(0, 7) && ((g[7] ?? 0) === 0 || g[7] === 1)) return true;
  // ::ffff:a.b.c.d (IPv4-mapped) and 64:ff9b::/96 (NAT64) carry a v4 address.
  if (isZero(0, 5) && g[5] === 0xffff) return isPrivateV4(v4FromGroups(g[6] ?? 0, g[7] ?? 0));
  if (first === 0x64 && g[1] === 0xff9b && isZero(2, 6)) return isPrivateV4(v4FromGroups(g[6] ?? 0, g[7] ?? 0));
  // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast.
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  // 2001:db8::/32 is reserved for documentation and routes nowhere.
  if (first === 0x2001 && g[1] === 0x0db8) return true;
  return false;
}

/** Loopback, link-local, private-range, multicast or reserved. Unparseable input counts as private. */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true;
}

function bareHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isLocalName(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.$/, '');
  return name === 'localhost' || name.endsWith('.localhost');
}

/**
 * The literal-only check: an address, or a name that is local by definition.
 * No DNS, so it is cheap enough to run on every redirect hop.
 */
export function isPrivateHost(url: URL): boolean {
  const host = bareHostname(url.hostname);
  if (isLocalName(host)) return true;
  if (isIP(host) !== 0) return isPrivateAddress(host);
  return false;
}

const defaultResolver: HostResolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

/** Scheme, literal host, then what the name resolves to. */
export async function checkUrl(raw: string, options: UrlGuardOptions = {}): Promise<UrlVerdict> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'is not a valid URL.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'only http and https URLs are fetched.' };
  }

  return checkHost(url, options);
}

const PROXY_SCHEMES = new Set(['http:', 'https:', 'socks5:', 'socks5h:']);

/**
 * A caller-supplied proxy is a host this instance connects to and hands the
 * request to, so it meets the same address rules as the target URL.
 */
export async function checkProxyUrl(raw: string, options: UrlGuardOptions = {}): Promise<UrlVerdict> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'is not a valid URL.' };
  }

  if (!PROXY_SCHEMES.has(url.protocol)) {
    return { ok: false, reason: 'only http, https and socks5 proxies are used.' };
  }

  // A socks5 URL has an opaque host that the URL parser leaves as written;
  // re-reading it as http normalises numeric spellings such as 0x7f000001.
  let host: URL;
  try {
    host = new URL(`http://${url.host}`);
  } catch {
    return { ok: false, reason: 'is not a valid URL.' };
  }
  return checkHost(host, options);
}

/** The address rules shared by target and proxy URLs: literal host, then DNS. */
async function checkHost(url: URL, options: UrlGuardOptions): Promise<UrlVerdict> {
  if (options.allowPrivate) return { ok: true };

  const host = bareHostname(url.hostname);
  if (isPrivateHost(url)) {
    return { ok: false, reason: `"${host}" is a private or local address, which this instance does not fetch.` };
  }

  if (isIP(host) !== 0) return { ok: true };

  let addresses: string[];
  try {
    addresses = await (options.resolve ?? defaultResolver)(host);
  } catch {
    // A name that does not resolve fails in the fetch tier with a typed `dns`
    // reason, which says more than a 400 would.
    return { ok: true };
  }

  const blocked = addresses.find((address) => isPrivateAddress(address));
  if (blocked) {
    return {
      ok: false,
      reason: `"${host}" resolves to a private or local address (${blocked}), which this instance does not fetch.`,
    };
  }

  return { ok: true };
}

/**
 * The interact surface, over the same address rules.
 *
 * `checkUrl` answers a verdict a route turns into a 400; the browser actions
 * want a throw they can catch per navigation, and a resolver shaped like
 * `dns.lookup`'s `all` form. Both are the one blocklist above; a change to the
 * ranges reaches every caller.
 */

export type Lookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

export const systemLookup: Lookup = (hostname) => lookup(hostname, { all: true, verbatim: true });

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/** True when the literal address is routable on the public internet. */
export function isPublicAddress(address: string): boolean {
  return !isPrivateAddress(address);
}

/**
 * The ranges no caller reaches, even where private addresses are allowed.
 *
 * An operator who allows private addresses means loopback and their own LAN —
 * where a local model runtime lives. Link-local carries the cloud metadata
 * endpoint, and CGNAT is the provider's shared space, not the operator's
 * network. Neither is ever the intended target of that opt-in.
 */
const ALWAYS_BLOCKED: readonly [string, number, string][] = [
  ['169.254.0.0', 16, '169.254.0.0/16'],
  ['100.64.0.0', 10, '100.64.0.0/10'],
];

/** Names the reserved range when the URL's host sits in one, for a message that says which. */
export function blockedRange(raw: string): string | undefined {
  let host: string;
  try {
    host = bareHostname(new URL(raw).hostname);
  } catch {
    return undefined;
  }
  if (isIP(host) !== 4) return undefined;
  return ALWAYS_BLOCKED.find(([base, bits]) => inV4Block(host, base, bits))?.[2];
}

/** Throws unless the URL is http(s) to a publicly routable address, name resolution included. */
export async function assertPublicUrl(raw: string, lookupFn: Lookup = systemLookup): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('not a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`${url.protocol.replace(/:$/, '')} URLs cannot be opened; only http and https`);
  }

  const host = bareHostname(url.hostname);
  if (isLocalName(host)) {
    throw new UnsafeUrlError('this instance cannot be told to open its own host');
  }

  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError(`${host} is not a public address`);
    return;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookupFn(host);
  } catch {
    throw new UnsafeUrlError(`${host} did not resolve`);
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`${host} did not resolve`);

  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new UnsafeUrlError(`${host} resolves to ${address}, which is not a public address`);
    }
  }
}
