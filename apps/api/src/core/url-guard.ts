import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';


export type HostResolver = (hostname: string) => Promise<string[]>;

export interface UrlGuardOptions {
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

function expandV6(ip: string): number[] | undefined {
  let text = ip;
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);

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

  if (isZero(0, 6)) return true;
  if (first === 0x2002) return isPrivateV4(v4FromGroups(g[1] ?? 0, g[2] ?? 0));
  if ((first & 0xffc0) === 0xfec0) return true;
  if (isZero(0, 5) && g[5] === 0xffff) return isPrivateV4(v4FromGroups(g[6] ?? 0, g[7] ?? 0));
  if (first === 0x64 && g[1] === 0xff9b && isZero(2, 6)) return isPrivateV4(v4FromGroups(g[6] ?? 0, g[7] ?? 0));
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  if (first === 0x2001 && g[1] === 0x0db8) return true;
  return false;
}

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

  let host: URL;
  try {
    host = new URL(`http://${url.host}`);
  } catch {
    return { ok: false, reason: 'is not a valid URL.' };
  }
  return checkHost(host, options);
}

export type PinnedProxy = { ok: true; url: string } | { ok: false; reason: string };

export async function pinProxyUrl(raw: string, options: UrlGuardOptions = {}): Promise<PinnedProxy> {
  let answers: string[] | undefined;
  const resolve: HostResolver = async (hostname) => {
    answers ??= await (options.resolve ?? defaultResolver)(hostname);
    return answers;
  };
  const verdict = await checkProxyUrl(raw, { ...options, resolve });
  if (!verdict.ok) return verdict;

  const url = new URL(raw);
  if (url.protocol === 'https:') return { ok: true, url: raw };
  const host = bareHostname(new URL(`http://${url.host}`).hostname);

  let address = host;
  if (isIP(host) === 0) {
    let resolved: string[];
    try {
      resolved = await resolve(host);
    } catch {
      resolved = [];
    }
    address = resolved[0] ?? '';
    if (!address) return { ok: false, reason: `"${host}" did not resolve.` };
    const blocked = resolved.find((a) => (options.allowPrivate ? isAlwaysBlocked(a) : isPrivateAddress(a)));
    if (blocked) {
      return { ok: false, reason: `"${host}" resolves to ${blocked}, which this instance does not use as a proxy.` };
    }
  }

  url.hostname = isIP(address) === 6 ? `[${address}]` : address;
  const pinned = url.href;
  const addedSlash = !raw.endsWith('/') && pinned.endsWith('/') && url.pathname === '/';
  return { ok: true, url: addedSlash ? pinned.slice(0, -1) : pinned };
}

async function checkHost(url: URL, options: UrlGuardOptions): Promise<UrlVerdict> {
  if (options.allowPrivate) return checkAlwaysBlocked(url, options);

  const host = bareHostname(url.hostname);
  if (isPrivateHost(url)) {
    return { ok: false, reason: `"${host}" is a private or local address, which this instance does not fetch.` };
  }

  if (isIP(host) !== 0) return { ok: true };

  let addresses: string[];
  try {
    addresses = await (options.resolve ?? defaultResolver)(host);
  } catch {
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


export type Lookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

export const systemLookup: Lookup = (hostname) => lookup(hostname, { all: true, verbatim: true });

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export function isPublicAddress(address: string): boolean {
  return !isPrivateAddress(address);
}

const ALWAYS_BLOCKED: readonly [string, number, string][] = [
  ['169.254.0.0', 16, '169.254.0.0/16'],
  ['100.64.0.0', 10, '100.64.0.0/10'],
];

export function isAlwaysBlocked(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ALWAYS_BLOCKED.some(([base, bits]) => inV4Block(address, base, bits));
  if (family !== 6) return false;
  const g = expandV6(address);
  if (!g) return true;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isAlwaysBlocked(v4FromGroups(g[6] ?? 0, g[7] ?? 0));
  return ((g[0] ?? 0) & 0xffc0) === 0xfe80;
}

async function checkAlwaysBlocked(url: URL, options: UrlGuardOptions): Promise<UrlVerdict> {
  const host = bareHostname(url.hostname);
  const refuse = (address: string): UrlVerdict => ({
    ok: false,
    reason: `"${host}" is or resolves to ${address}, a reserved range this instance never fetches.`,
  });
  if (isIP(host) !== 0) return isAlwaysBlocked(host) ? refuse(host) : { ok: true };

  let addresses: string[];
  try {
    addresses = await (options.resolve ?? defaultResolver)(host);
  } catch {
    return { ok: true };
  }
  const blocked = addresses.find((address) => isAlwaysBlocked(address));
  return blocked ? refuse(blocked) : { ok: true };
}

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
