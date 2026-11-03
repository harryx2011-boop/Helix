import { describe, expect, it } from 'vitest'
import { COOKIE, decide, loginCookie, type GateRequest } from './gate'

const cfg = { port: 3410, token: 'a'.repeat(64) }

function req(over: Partial<GateRequest> & { headers?: GateRequest['headers'] } = {}): GateRequest {
  return { method: 'GET', url: '/app', ...over, headers: { host: '127.0.0.1:3410', cookie: `${COOKIE}=${cfg.token}`, ...over.headers } }
}

describe('web gate', () => {
  it('S1: a request with the right Host and the launch cookie is allowed', () => {
    expect(decide(cfg, req())).toEqual({ kind: 'allow' })
  })

  it('S2: localhost on the same port is also an allowed Host', () => {
    expect(decide(cfg, req({ headers: { host: 'localhost:3410' } })).kind).toBe('allow')
  })

  it('S3: any other Host is refused, even with a good cookie (DNS rebinding)', () => {
    for (const host of ['evil.example', 'evil.example:3410', '127.0.0.1:9999', '127.0.0.1', undefined]) {
      const d = decide(cfg, req({ headers: { host } }))
      expect(d).toMatchObject({ kind: 'deny', status: 403 })
    }
  })

  it('S4: a foreign Origin is refused, even with a good cookie', () => {
    const d = decide(cfg, req({ method: 'POST', headers: { origin: 'https://evil.example' } }))
    expect(d).toMatchObject({ kind: 'deny', status: 403 })
    expect(decide(cfg, req({ headers: { origin: 'null' } }))).toMatchObject({ kind: 'deny', status: 403 })
  })

  it('S5: our own origin is accepted', () => {
    expect(decide(cfg, req({ method: 'POST', headers: { origin: 'http://127.0.0.1:3410' } })).kind).toBe('allow')
  })

  it('S6: Sec-Fetch-Site cross-site or same-site is refused; same-origin and none pass', () => {
    expect(decide(cfg, req({ headers: { 'sec-fetch-site': 'cross-site' } })).kind).toBe('deny')
    expect(decide(cfg, req({ headers: { 'sec-fetch-site': 'same-site' } })).kind).toBe('deny')
    expect(decide(cfg, req({ headers: { 'sec-fetch-site': 'same-origin' } })).kind).toBe('allow')
    expect(decide(cfg, req({ headers: { 'sec-fetch-site': 'none' } })).kind).toBe('allow')
  })

  it('S7: no cookie and no token is 401', () => {
    expect(decide(cfg, req({ headers: { cookie: undefined } }))).toMatchObject({ kind: 'deny', status: 401 })
  })

  it('S8: a wrong cookie is 401', () => {
    expect(decide(cfg, req({ headers: { cookie: `${COOKIE}=${'b'.repeat(64)}` } }))).toMatchObject({ kind: 'deny', status: 401 })
    expect(decide(cfg, req({ headers: { cookie: `${COOKIE}=short` } }))).toMatchObject({ kind: 'deny', status: 401 })
  })

  it('S9: ?t=<token> on a navigation logs in and redirects without the token', () => {
    const d = decide(cfg, req({ url: `/?t=${cfg.token}`, headers: { cookie: undefined, 'sec-fetch-site': 'none' } }))
    expect(d).toEqual({ kind: 'login', location: '/app' })
    const d2 = decide(cfg, req({ url: `/app/keys?x=1&t=${cfg.token}`, headers: { cookie: undefined } }))
    expect(d2).toEqual({ kind: 'login', location: '/app/keys?x=1' })
  })

  it('S10: a wrong ?t= does not log in', () => {
    const d = decide(cfg, req({ url: `/?t=${'c'.repeat(64)}`, headers: { cookie: undefined } }))
    expect(d).toMatchObject({ kind: 'deny', status: 401 })
  })

  it('S11: ?t= only logs in for GET', () => {
    const d = decide(cfg, req({ method: 'POST', url: `/v1/x?t=${cfg.token}`, headers: { cookie: undefined } }))
    expect(d).toMatchObject({ kind: 'deny', status: 401 })
  })

  it('S12: the login cookie is HttpOnly and SameSite=Strict', () => {
    const c = loginCookie(cfg.token)
    expect(c).toContain(`${COOKIE}=${cfg.token}`)
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Strict')
    expect(c).toContain('Path=/')
  })
})
