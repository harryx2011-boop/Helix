import http from 'node:http'
import net from 'node:net'
import { COOKIE, decide, loginCookie, type GateConfig } from './gate'

export interface BridgeInfo {
  apiKey: string
  adminToken: string
  version: string
  /** The API's own origin (7410): it takes the API key, so copied snippets and MCP configs point there. */
  apiOrigin: string
}

export interface WebServerOptions extends GateConfig {
  /** The API child's loopback port; allowed requests are forwarded there. */
  upstreamPort: number
  /** A `next dev` server for the UI. Unset, the API serves the static export itself. */
  uiPort?: number
  info: BridgeInfo
  /** Starts the dictation service on first use; null when this checkout has none. */
  voice: () => Promise<unknown>
  log: (msg: string) => void
}

export const VOICE_PATH = '/__helix/voice'

const json = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c')

/**
 * What the Electron preload used to expose, as an inline script: the dashboard reads
 * `window.helixDesktop` for its key, admin token and dictation. Only a request that
 * passed the gate ever receives it.
 */
export function bridgeScript(info: BridgeInfo): string {
  const body = `{apiKey:${json(info.apiKey)},adminToken:${json(info.adminToken)},version:${json(info.version)},apiOrigin:${json(info.apiOrigin)},platform:'win32',voice:{connect:function(){return fetch(${json(VOICE_PATH)},{method:'POST',credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}}}`
  return `<script>window.helixDesktop=Object.freeze(${body});</script>`
}

const API_PREFIXES = ['/v1', '/settings', '/internal', '/mcp']

/** The port that answers a path: the API owns its prefixes, the UI dev server (when set) owns the rest. */
export function portFor(url: string | undefined, api: number, ui: number | undefined): number {
  const p = (url ?? '/').split('?')[0] ?? '/'
  return ui !== undefined && !API_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`)) ? ui : api
}

function withoutGateCookie(cookie: string | undefined): string | undefined {
  const kept = (cookie ?? '').split(';').filter((p) => p.trim() && p.trim().split('=')[0] !== COOKIE)
  return kept.length ? kept.join(';').trim() : undefined
}

function upstreamHeaders(req: http.IncomingMessage, port: number): http.OutgoingHttpHeaders {
  const h: http.OutgoingHttpHeaders = { ...req.headers, host: `127.0.0.1:${port}`, 'accept-encoding': 'identity' }
  const cookie = withoutGateCookie(req.headers.cookie)
  if (cookie) h.cookie = cookie
  else delete h.cookie
  return h
}

function refuse(res: http.ServerResponse, status: number, reason: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end(`${reason}\n`)
}

export function createWebServer(o: WebServerOptions): http.Server {
  const gate: GateConfig = { port: o.port, token: o.token }

  const server = http.createServer((req, res) => {
    const d = decide(gate, { method: req.method ?? 'GET', url: req.url ?? '/', headers: req.headers })
    if (d.kind === 'deny') {
      o.log(`refused ${req.method} ${req.url?.split('?')[0]}: ${d.reason}`)
      return refuse(res, d.status, d.reason)
    }
    if (d.kind === 'login') {
      res.writeHead(302, { location: d.location, 'set-cookie': loginCookie(o.token), 'cache-control': 'no-store' })
      return void res.end()
    }
    if (req.url?.split('?')[0] === VOICE_PATH) {
      if (req.method !== 'POST') return refuse(res, 405, 'POST only')
      return void o
        .voice()
        .then((c) => {
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          res.end(JSON.stringify(c ?? null))
        })
        .catch((e) => {
          o.log(`voice: ${String(e)}`)
          refuse(res, 502, 'Dictation service failed to start')
        })
    }

    const port = portFor(req.url, o.upstreamPort, o.uiPort)
    const up = http.request(
      { host: '127.0.0.1', port, method: req.method, path: req.url, headers: upstreamHeaders(req, port) },
      (ur) => {
        const type = String(ur.headers['content-type'] ?? '')
        if (!type.startsWith('text/html')) {
          res.writeHead(ur.statusCode ?? 502, ur.headers)
          return void ur.pipe(res)
        }
        const chunks: Buffer[] = []
        ur.on('data', (c: Buffer) => chunks.push(c))
        ur.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf8')
          const out = html.includes('</head>') ? html.replace('</head>', () => `${bridgeScript(o.info)}</head>`) : html
          const headers = { ...ur.headers, 'content-length': String(Buffer.byteLength(out)), 'cache-control': 'no-store' }
          delete headers['content-encoding']
          delete headers.etag
          delete headers['transfer-encoding']
          res.writeHead(ur.statusCode ?? 502, headers)
          res.end(out)
        })
      },
    )
    up.on('error', (e) => {
      o.log(`upstream: ${String(e)}`)
      if (!res.headersSent) refuse(res, 502, 'The Helix API is not answering')
      else res.destroy()
    })
    req.pipe(up)
  })

  // Websocket upgrades (live browser interaction) pass the same gate, then a raw tunnel.
  server.on('upgrade', (req, socket: net.Socket, head) => {
    const d = decide(gate, { method: req.method ?? 'GET', url: req.url ?? '/', headers: req.headers })
    if (d.kind !== 'allow') {
      const status = d.kind === 'deny' ? d.status : 401
      socket.end(`HTTP/1.1 ${status} Refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`)
      return
    }
    const port = portFor(req.url, o.upstreamPort, o.uiPort)
    const up = net.connect(port, '127.0.0.1', () => {
      const lines = Object.entries(upstreamHeaders(req, port)).flatMap(([k, v]) =>
        (Array.isArray(v) ? v : [String(v)]).map((x) => `${k}: ${x}`),
      )
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`)
      if (head.length) up.write(head)
      up.pipe(socket)
      socket.pipe(up)
    })
    up.on('error', () => socket.destroy())
    socket.on('error', () => up.destroy())
    socket.on('close', () => up.destroy())
  })

  return server
}
