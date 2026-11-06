import http from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { COOKIE } from './gate'
import { bridgeScript, createWebServer, portFor } from './server'

const TOKEN = 'f'.repeat(64)
const INFO = { apiKey: 'helix-' + '1'.repeat(32), adminToken: '2'.repeat(64), version: '9.9.9', apiOrigin: 'http://127.0.0.1:7410' }

let upstream: http.Server
let gate: http.Server
let gatePort = 0
let seen: http.IncomingHttpHeaders = {}
const sockets = new Set<Socket>()
const track = (s: http.Server) => s.on('connection', (c: Socket) => sockets.add(c))

const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as AddressInfo).port)))

beforeEach(async () => {
  upstream = http.createServer((req, res) => {
    seen = req.headers
    if (req.url === '/app') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end('<html><head><title>x</title></head><body>hi</body></html>')
    } else {
      res.setHeader('content-type', 'application/json')
      res.end('{"ok":true}')
    }
  })
  upstream.on('upgrade', (_req, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
  })
  track(upstream)
  const upPort = await listen(upstream)
  gate = http.createServer()
  // The gate's port is only known after listen, so build it on a throwaway port first.
  gatePort = await listen(gate)
  await new Promise((r) => gate.close(r))
  gate = createWebServer({
    port: gatePort,
    token: TOKEN,
    upstreamPort: upPort,
    info: INFO,
    voice: async () => ({ baseUrl: 'http://127.0.0.1:9000', token: 'v' }),
    log: () => {},
  })
  track(gate)
  await new Promise<void>((r) => gate.listen(gatePort, '127.0.0.1', r))
})

afterEach(async () => {
  // Upgraded sockets leave the server's own tracking, so destroy every socket seen.
  for (const s of sockets) s.destroy()
  await new Promise((r) => gate.close(r))
  await new Promise((r) => upstream.close(r))
})

interface Reply {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

function call(path: string, headers: Record<string, string> = {}, method = 'GET'): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { host: '127.0.0.1', port: gatePort, path, method, headers: { host: `127.0.0.1:${gatePort}`, ...headers } },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      },
    )
    r.on('error', reject)
    r.end()
  })
}

const authed = { cookie: `${COOKIE}=${TOKEN}` }

describe('web server', () => {
  it('S1: no token is 401 and nothing reaches the API', async () => {
    seen = {}
    const r = await call('/v1/health')
    expect(r.status).toBe(401)
    expect(seen).toEqual({})
  })

  it('S2: a foreign Origin is refused even with the cookie', async () => {
    const r = await call('/v1/health', { ...authed, origin: 'https://evil.example' }, 'POST')
    expect(r.status).toBe(403)
  })

  it('S3: a wrong Host is refused even with the cookie', async () => {
    const r = await call('/v1/health', { ...authed, host: 'evil.example' })
    expect(r.status).toBe(403)
  })

  it('S4: ?t= sets an HttpOnly cookie and redirects to /app', async () => {
    const r = await call(`/?t=${TOKEN}`)
    expect(r.status).toBe(302)
    expect(r.headers.location).toBe('/app')
    expect(String(r.headers['set-cookie'])).toMatch(/HttpOnly.*SameSite=Strict|SameSite=Strict.*HttpOnly/)
  })

  it('S5: an authorised request is proxied, with Host rewritten and the gate cookie withheld', async () => {
    const r = await call('/v1/health', { ...authed, cookie: `${COOKIE}=${TOKEN}; other=1` })
    expect(r.status).toBe(200)
    expect(r.body).toBe('{"ok":true}')
    expect(seen.host).toMatch(/^127\.0\.0\.1:\d+$/)
    expect(seen.host).not.toBe(`127.0.0.1:${gatePort}`)
    expect(seen.cookie ?? '').not.toContain(COOKIE)
  })

  it('S6: the app page gets the desktop bridge and is not cacheable', async () => {
    const r = await call('/app', authed)
    expect(r.status).toBe(200)
    expect(r.body).toContain('window.helixDesktop')
    expect(r.body).toContain(INFO.apiKey)
    expect(r.body.indexOf('<script>')).toBeLessThan(r.body.indexOf('</head>'))
    expect(r.headers['cache-control']).toBe('no-store')
    expect(r.headers['content-length']).toBe(String(Buffer.byteLength(r.body)))
  })

  it('S7: JSON replies carry no bridge', async () => {
    const r = await call('/v1/health', authed)
    expect(r.body).not.toContain(INFO.apiKey)
  })

  it('S8: the voice route needs POST and the gate, then returns the connection', async () => {
    expect((await call('/__helix/voice', authed, 'GET')).status).toBe(405)
    expect((await call('/__helix/voice', {}, 'POST')).status).toBe(401)
    const r = await call('/__helix/voice', authed, 'POST')
    expect(JSON.parse(r.body)).toEqual({ baseUrl: 'http://127.0.0.1:9000', token: 'v' })
  })

  it('S9: a websocket upgrade with a foreign Origin is refused; with the cookie it reaches the API', async () => {
    const upgrade = (headers: Record<string, string>) =>
      new Promise<string>((resolve) => {
        const r = http.request({
          host: '127.0.0.1',
          port: gatePort,
          path: '/v1/live',
          headers: { host: `127.0.0.1:${gatePort}`, connection: 'Upgrade', upgrade: 'websocket', ...headers },
        })
        r.on('upgrade', (res, socket) => {
          socket.destroy()
          resolve(`upgraded ${res.statusCode}`)
        })
        r.on('response', (res) => resolve(`refused ${res.statusCode}`))
        r.on('error', () => resolve('error'))
        r.end()
      })
    expect(await upgrade({ ...authed, origin: 'https://evil.example' })).toBe('refused 403')
    expect(await upgrade({})).toBe('refused 401')
    expect(await upgrade(authed)).toBe('upgraded 101')
  })

  it('S10: the bridge script cannot be closed early by a value', () => {
    const s = bridgeScript({ apiKey: '</script><b>', adminToken: 'x', version: '1', apiOrigin: 'http://127.0.0.1:7410' })
    expect(s).not.toContain('</script><b>')
  })

  it('S12: the bridge names the API origin, so copied snippets target the port that takes the API key', () => {
    const s = bridgeScript({ apiKey: 'k', adminToken: 'x', version: '1', apiOrigin: 'http://127.0.0.1:7410' })
    expect(s).toContain('apiOrigin:"http://127.0.0.1:7410"')
  })
})

describe('portFor', () => {
  it('S11: API prefixes go to the API; with a UI dev server everything else goes there', () => {
    expect(portFor('/v1/health', 1, 2)).toBe(1)
    expect(portFor('/settings/x?a=1', 1, 2)).toBe(1)
    expect(portFor('/app', 1, 2)).toBe(2)
    expect(portFor('/_next/webpack-hmr', 1, 2)).toBe(2)
    expect(portFor('/app', 1, undefined)).toBe(1)
    expect(portFor('/v1abc', 1, 2)).toBe(2)
  })
})
