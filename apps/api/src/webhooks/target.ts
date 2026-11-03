import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';


export const RESERVED_HEADERS = new Set([
  'content-type',
  'content-length',
  'host',
  'user-agent',
  'transfer-encoding',
  'connection',
  'helix-event',
  'helix-delivery-id',
  'helix-signature',
]);

export const MAX_WEBHOOK_HEADERS = 16;
export const MAX_WEBHOOK_BYTES = 4_096;

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]*$/;

function parseV4(address: string): number[] | undefined {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return undefined;
  }
  return octets;
}

function isPublicV4(octets: number[]): boolean {
  const [a = 0, b = 0] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

function hextets(address: string): number[] | undefined {
  let text = address;
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);

  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseV4(tail);
    if (!v4) return undefined;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return undefined;

  const groups = [...head, ...Array<string>(fill).fill('0'), ...rest].map((g) => Number.parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    return undefined;
  }
  return groups;
}

function isPublicV6(groups: number[]): boolean {
  const [h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0] = groups;
  const embedded = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

  if (groups.every((g) => g === 0)) return false;
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && h7 === 1) {
    return false;
  }
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) {
    return isPublicV4(embedded(h6, h7));
  }
  if (h0 === 0x64 && h1 === 0xff9b) return isPublicV4(embedded(h6, h7));
  if (h0 === 0x2002) return isPublicV4(embedded(h1, h2));
  if ((h0 & 0xfe00) === 0xfc00) return false;
  if ((h0 & 0xffc0) === 0xfe80) return false;
  if ((h0 & 0xff00) === 0xff00) return false;
  return true;
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = parseV4(address);
    return octets !== undefined && isPublicV4(octets);
  }
  if (version === 6) {
    const groups = hextets(address);
    return groups !== undefined && isPublicV6(groups);
  }
  return false;
}

export function webhookTargetProblem(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'must be an absolute URL';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'must use http or https';
  }
  if (parsed.username || parsed.password) return 'must not carry credentials';

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) {
    return isPublicAddress(host) ? undefined : 'must not point at a private or loopback address';
  }
  if (host === 'localhost' || host.endsWith('.localhost')) return 'must not point at localhost';
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'must be a public hostname';
  }
  return undefined;
}

export function webhookHeadersProblem(headers: Record<string, string>): string | undefined {
  const entries = Object.entries(headers);
  if (entries.length > MAX_WEBHOOK_HEADERS) return `at most ${MAX_WEBHOOK_HEADERS} headers`;

  for (const [name, value] of entries) {
    if (!HEADER_NAME.test(name)) return `${JSON.stringify(name)} is not a valid header name`;
    if (RESERVED_HEADERS.has(name.toLowerCase())) return `${name} is set by Helix and cannot be overridden`;
    if (!HEADER_VALUE.test(value)) return `${name} has an invalid header value`;
  }

  if (Buffer.byteLength(JSON.stringify(headers)) > MAX_WEBHOOK_BYTES) {
    return `must serialise to at most ${MAX_WEBHOOK_BYTES} bytes`;
  }
  return undefined;
}

export type Resolver = (hostname: string) => Promise<string[]>;

export const defaultResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((entry) => entry.address);

export async function resolvedTargetProblem(
  url: string,
  resolve: Resolver = defaultResolver,
): Promise<string | undefined> {
  const literal = webhookTargetProblem(url);
  if (literal) return literal;

  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return undefined;

  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    return undefined;
  }
  return addresses.every(isPublicAddress) ? undefined : 'resolves to a private or loopback address';
}
