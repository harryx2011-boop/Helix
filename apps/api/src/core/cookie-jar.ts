import type { Tier } from './escalation.js';

/**
 * Cookies a host set, replayed only to the identity that earned them.
 *
 * A clearance cookie (`cf_clearance`, `__cf_bm`, `datadome`) is bound to the
 * IP, User-Agent and TLS fingerprint it was issued to; sent from another, it is
 * itself a bot signal. So the key is host + proxy (the IP) + tier + profile
 * (the UA and TLS identity), never the host alone.
 */
export interface CookieIdentity {
  url: string;
  proxy: string | undefined;
  tier: Tier;
  profile: string | undefined;
}

/** `name -> value`, with `null` for a cookie the host deleted. */
export function parseSetCookies(lines: readonly string[], now = Date.now()): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const line of lines) {
    const [pair = '', ...attributes] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    let value: string | null = pair.slice(eq + 1).trim();
    for (const attribute of attributes) {
      const [key = '', raw = ''] = attribute.split('=', 2).map((s) => s.trim());
      const k = key.toLowerCase();
      if (k === 'max-age' && Number(raw) <= 0) value = null;
      if (k === 'expires' && Date.parse(raw) <= now) value = null;
    }
    out[name] = value;
  }
  return out;
}

/** The cookies still set after these lines, as a crawl session's jar takes them. */
export function liveCookies(lines: readonly string[] | undefined): Record<string, string> | undefined {
  if (!lines || lines.length === 0) return undefined;
  const live = Object.entries(parseSetCookies(lines)).filter((e): e is [string, string] => e[1] !== null);
  return live.length > 0 ? Object.fromEntries(live) : undefined;
}

export class CookieJar {
  readonly #ttlMs: number;
  readonly #maxIdentities: number;
  readonly #now: () => number;
  readonly #jars = new Map<string, { cookies: Record<string, string>; at: number }>();

  constructor(options: { ttlMs?: number; maxIdentities?: number; now?: () => number } = {}) {
    this.#ttlMs = options.ttlMs ?? 30 * 60_000;
    this.#maxIdentities = options.maxIdentities ?? 2_000;
    this.#now = options.now ?? Date.now;
  }

  header(identity: CookieIdentity): string | undefined {
    const key = keyOf(identity);
    const jar = key ? this.#jars.get(key) : undefined;
    if (!jar) return undefined;
    if (this.#now() - jar.at > this.#ttlMs) {
      this.#jars.delete(key!);
      return undefined;
    }
    const pairs = Object.entries(jar.cookies);
    return pairs.length > 0 ? pairs.map(([n, v]) => `${n}=${v}`).join('; ') : undefined;
  }

  store(identity: CookieIdentity, setCookies: readonly string[] | undefined): void {
    const key = keyOf(identity);
    if (!key || !setCookies || setCookies.length === 0) return;
    const cookies = { ...this.#jars.get(key)?.cookies };
    for (const [name, value] of Object.entries(parseSetCookies(setCookies, this.#now()))) {
      if (value === null) delete cookies[name];
      else cookies[name] = value;
    }
    this.#jars.delete(key);
    this.#jars.set(key, { cookies, at: this.#now() });
    if (this.#jars.size > this.#maxIdentities) this.#jars.delete(this.#jars.keys().next().value!);
  }
}

function keyOf({ url, proxy, tier, profile }: CookieIdentity): string | undefined {
  try {
    return [new URL(url).hostname.toLowerCase(), proxy ?? 'direct', tier, profile ?? 'default'].join('|');
  } catch {
    return undefined;
  }
}

// ponytail: process-local, so a restart re-earns each clearance once; persist if that shows up.
export const cookieJar = new CookieJar();
