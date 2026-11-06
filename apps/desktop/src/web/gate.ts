import { timingSafeEqual } from 'node:crypto'

/**
 * The loopback gate for the browser app. A browser lets any web page the user visits
 * call 127.0.0.1, so every request must prove four things before it reaches the API:
 * the Host is ours (DNS rebinding), the Origin is ours (cross-site calls), the fetch
 * metadata is not cross-site, and the per-launch token came with it (cookie).
 */

export const COOKIE = 'hlx_web'
const MANIFEST = '/manifest.webmanifest'

export interface GateConfig {
  port: number
  token: string
}

export interface GateRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
}

export type Decision =
  | { kind: 'allow' }
  | { kind: 'login'; location: string }
  | { kind: 'deny'; status: number; reason: string }

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

export function allowedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`]
}

export function allowedOrigins(port: number): string[] {
  return allowedHosts(port).map((h) => `http://${h}`)
}

function sameToken(given: string | undefined, token: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

export function loginCookie(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`
}

const deny = (status: number, reason: string): Decision => ({ kind: 'deny', status, reason })

export function decide(cfg: GateConfig, req: GateRequest): Decision {
  const host = one(req.headers.host)
  if (!host || !allowedHosts(cfg.port).includes(host.toLowerCase())) return deny(403, 'Host not allowed')

  const origin = one(req.headers.origin)
  if (origin !== undefined && !allowedOrigins(cfg.port).includes(origin.toLowerCase())) return deny(403, 'Origin not allowed')

  const site = one(req.headers['sec-fetch-site'])
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return deny(403, 'Cross-site request refused')

  // Browsers fetch the PWA manifest without cookies; it is public. The exact raw path only,
  // so a path that merely normalizes to it upstream still needs the cookie.
  if (req.method === 'GET' && req.url.split('?')[0] === MANIFEST) return { kind: 'allow' }

  let url: URL
  try {
    url = new URL(req.url, `http://${host}`)
  } catch {
    // An absolute-form target such as `http://[/x` would otherwise throw out of both handlers.
    return deny(400, 'Bad request target')
  }
  const offered = url.searchParams.get('t')
  if (offered !== null && req.method === 'GET' && sameToken(offered, cfg.token)) {
    url.searchParams.delete('t')
    const rest = url.pathname + url.search
    return { kind: 'login', location: url.pathname === '/' ? `/app${url.search}` : rest }
  }

  // No bearer path: the Authorization header belongs to the API's own key.
  if (sameToken(cookieValue(one(req.headers.cookie), COOKIE), cfg.token)) return { kind: 'allow' }
  return deny(401, 'Open Helix from the link the launcher printed')
}
