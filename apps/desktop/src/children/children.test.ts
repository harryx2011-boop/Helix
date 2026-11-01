import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { children } from './index'
import { baseEnv, DESKTOP_PORTS, type ChildContext } from './types'

const R = 'C:/Program Files/Helix/resources'
const REPO = 'D:/Helix'

function ctx(over: Partial<ChildContext> = {}): ChildContext {
  return {
    dev: false,
    resources: R,
    repo: REPO,
    dataDir: 'C:/Users/u/AppData/Roaming/Helix/data',
    runtimeDir: 'C:/Users/u/AppData/Roaming/Helix/runtime',
    execPath: 'C:/Program Files/Helix/Helix.exe',
    secrets: { apiKey: `helix-${'a'.repeat(32)}`, adminToken: 'b'.repeat(64) },
    serviceToken: 'c'.repeat(64),
    ports: DESKTOP_PORTS,
    exists: () => true,
    ...over,
  }
}

const spec = (name: string, c: ChildContext) => children.map((f) => f(c)).find((s) => s.name === name)!

describe('child registry', () => {
  it('lists api, extract and scrape in boot-status order with distinct ports', () => {
    const specs = children.map((f) => f(ctx()))
    expect(specs.map((s) => s.name)).toEqual(['api', 'extract', 'scrape'])
    expect(specs.map((s) => s.port)).toEqual([7410, 7412, 7413])
    expect(specs.map((s) => s.label)).toEqual(['Starting database', 'Starting extract', 'Starting browser engine'])
  })
})

describe('api spec', () => {
  it('runs the bundle under Electron-as-Node when installed', () => {
    const s = spec('api', ctx())
    expect(s.command).toBe('C:/Program Files/Helix/Helix.exe')
    expect(s.args).toEqual([path.join(R, 'api', 'dist', 'helix-api.js')])
    expect(s.cwd).toBe(path.join(R, 'api'))
    expect(s.healthUrl).toBe('http://127.0.0.1:7410/v1/health')
    expect(s.ipc).toBe(true)
    expect(s.env).toEqual({
      ELECTRON_RUN_AS_NODE: '1',
      HELIX_DB: 'pglite',
      HELIX_DATA_DIR: 'C:/Users/u/AppData/Roaming/Helix/data',
      HELIX_PORT: '7410',
      HELIX_HOST: '127.0.0.1',
      HELIX_STATIC_DIR: path.join(R, 'ui'),
      HELIX_FETCH_URL: 'http://127.0.0.1:7413',
      HELIX_EXTRACT_URL: 'http://127.0.0.1:7412',
      HELIX_PUBLIC_URL: 'http://127.0.0.1:7410',
      HELIX_CORS_ORIGINS: 'http://127.0.0.1:7410',
      HELIX_BOOTSTRAP_KEY: `helix-${'a'.repeat(32)}`,
      HELIX_INTERNAL_ADMIN_TOKEN: 'b'.repeat(64),
      HELIX_SERVICE_TOKEN: 'c'.repeat(64),
      PLAYWRIGHT_BROWSERS_PATH: path.join(R, 'browsers'),
      HELIX_LOG_LEVEL: 'info',
    })
  })

  it('treats 200 and 503 as up, anything else as not yet', () => {
    const s = spec('api', ctx())
    expect([200, 503, 404, 500].map(s.isUp)).toEqual([true, true, false, false])
  })

  it('runs tsx from apps/api in dev, without ELECTRON_RUN_AS_NODE', () => {
    const s = spec('api', ctx({ dev: true, resources: 'D:/Helix/apps/desktop/resources' }))
    expect(s.command).toBe('node')
    expect(s.args).toEqual(['--import', 'tsx', 'src/index.ts'])
    expect(s.cwd).toBe(path.join(REPO, 'apps', 'api'))
    expect(s.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(s.env.HELIX_STATIC_DIR).toBe(path.join(REPO, 'apps', 'dashboard', 'out'))
  })

  it('leaves the static dir and browsers path unset in dev when they are not built', () => {
    const s = spec('api', ctx({ dev: true, exists: () => false }))
    expect(s.env.HELIX_STATIC_DIR).toBeUndefined()
    expect(s.env.PLAYWRIGHT_BROWSERS_PATH).toBeUndefined()
  })
})

describe('extract spec', () => {
  it('runs the one-folder exe on loopback when installed', () => {
    const s = spec('extract', ctx())
    expect(s.command).toBe(path.join(R, 'extract', 'helix-extract.exe'))
    expect(s.args).toEqual(['--port', '7412', '--host', '127.0.0.1'])
    expect(s.env).toEqual({ HELIX_RUNTIME_DIR: 'C:/Users/u/AppData/Roaming/Helix/runtime', HELIX_SERVICE_TOKEN: 'c'.repeat(64) })
    expect(s.healthUrl).toBe('http://127.0.0.1:7412/health')
  })

  it('uses pythonw -m helix_extract in dev when the module entry exists', () => {
    const s = spec('extract', ctx({ dev: true }))
    expect(s.command).toBe(path.join(REPO, 'apps', 'extract', '.venv', 'Scripts', 'pythonw.exe'))
    expect(s.args).toEqual(['-m', 'helix_extract', '--port', '7412', '--host', '127.0.0.1'])
  })

  it('falls back to uvicorn in dev when there is no __main__', () => {
    const s = spec('extract', ctx({ dev: true, exists: (p) => !p.endsWith('__main__.py') }))
    expect(s.args).toEqual(['-m', 'uvicorn', 'helix_extract.main:app', '--port', '7412', '--host', '127.0.0.1'])
  })
})

describe('scrape spec', () => {
  it('runs the one-folder exe on loopback when installed', () => {
    const s = spec('scrape', ctx())
    expect(s.command).toBe(path.join(R, 'scrape', 'helix-scrape.exe'))
    expect(s.args).toEqual(['--port', '7413', '--host', '127.0.0.1'])
    expect(s.cwd).toBe(path.join(R, 'scrape'))
    // The browser tier runs on the Chromium the installer stages for the API's Playwright.
    expect(s.env).toEqual({ HELIX_SERVICE_TOKEN: 'c'.repeat(64), PLAYWRIGHT_BROWSERS_PATH: path.join(R, 'browsers') })
    expect(s.healthUrl).toBe('http://127.0.0.1:7413/health')
  })

  it('leaves the browsers path unset in dev when none is staged', () => {
    const s = spec('scrape', ctx({ dev: true, exists: () => false }))
    expect(s.env.PLAYWRIGHT_BROWSERS_PATH).toBeUndefined()
  })

  it('uses pythonw -m helix_scrape from apps/scrape in dev', () => {
    const s = spec('scrape', ctx({ dev: true }))
    expect(s.command).toBe(path.join(REPO, 'apps', 'scrape', '.venv', 'Scripts', 'pythonw.exe'))
    expect(s.args).toEqual(['-m', 'helix_scrape', '--port', '7413', '--host', '127.0.0.1'])
    expect(s.cwd).toBe(path.join(REPO, 'apps', 'scrape'))
  })
})

describe('baseEnv', () => {
  it('drops the dev stack and Electron variables but keeps the system ones', () => {
    const env = baseEnv({
      PATH: 'C:/Windows',
      SystemRoot: 'C:/Windows',
      OPENAI_API_KEY: 'k',
      HELIX_PORT: '7400',
      helix_db: 'pg',
      DATABASE_URL: 'postgres://x',
      ELECTRON_RUN_AS_NODE: '1',
      NODE_OPTIONS: '--inspect',
      PLAYWRIGHT_BROWSERS_PATH: 'C:/x',
      EMPTY: undefined,
    })
    expect(env).toEqual({ PATH: 'C:/Windows', SystemRoot: 'C:/Windows', OPENAI_API_KEY: 'k' })
  })
})
