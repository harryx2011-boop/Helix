// The browser app: starts the same three services the Electron shell supervised, then serves
// the UI and API on one gated loopback port. Run with `pnpm --filter @helix/desktop web`.
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { children } from '../children'
import { uiDevSpec, UI_DEV_PORT } from '../children/ui-dev'
import { baseEnv, DESKTOP_PORTS, loopback, type ChildContext, type Secrets } from '../children/types'
import { probeHttp } from '../health'
import { resolveWebLayout } from '../layout'
import { fileLogger } from '../log'
import { fileStore, killStale } from '../pidfile'
import { isPortFree, killTree, listProcs, spawnChild } from '../procs'
import { Supervisor } from '../supervisor'
import { createVoice, resolveVoice } from '../voice'
import { loadWebSecrets, windowsDpapi } from './secrets'
import { createWebServer } from './server'

export const WEB_PORT = 3410

const args = new Set(process.argv.slice(2))
const port = Number(process.env.HELIX_WEB_PORT) || WEB_PORT
const uiDev = args.has('--ui-dev')

function fail(message: string): never {
  console.error(`helix web: ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  if (!process.env.APPDATA && !process.env.HELIX_WEB_USERDATA) fail('APPDATA is not set; set HELIX_WEB_USERDATA to the Helix data folder.')
  const userData = process.env.HELIX_WEB_USERDATA || path.join(process.env.APPDATA!, 'Helix')
  const layout = resolveWebLayout(userData, __dirname)
  for (const dir of [layout.dataDir, layout.runtimeDir, layout.logsDir, layout.runDir]) fs.mkdirSync(dir, { recursive: true })
  const log = fileLogger(path.join(layout.logsDir, 'web.log'))

  if (!(await isPortFree(port))) fail(`port ${port} is in use. Is another Helix browser app (or HELIX_WEB_PORT) running?`)
  const resources = path.join(layout.repo, 'apps', 'desktop', 'resources')
  const ui = path.join(layout.repo, 'apps', 'dashboard', 'out')
  if (!uiDev && !fs.existsSync(ui)) fail(`the UI is not built (${ui}). Run "pnpm --filter @helix/desktop web:ui" once, or start with "--ui-dev".`)

  let secrets: Secrets
  try {
    secrets = loadWebSecrets({ userData, webDir: layout.webDir, dpapi: windowsDpapi, log })
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e))
  }

  const pids = fileStore(layout.runDir)
  await killStale({ store: pids, list: listProcs, killTree, log })

  const ctx: ChildContext = {
    dev: true,
    resources,
    repo: layout.repo,
    dataDir: layout.dataDir,
    runtimeDir: layout.runtimeDir,
    execPath: process.execPath,
    secrets,
    serviceToken: randomBytes(32).toString('hex'),
    ports: DESKTOP_PORTS,
    publicOrigin: loopback(port),
    exists: fs.existsSync,
  }
  const specs = children.map((make) => make(ctx))
  if (uiDev) specs.push(uiDevSpec(ctx))
  const supervisor = new Supervisor(specs, {
    spawn: spawnChild,
    probe: probeHttp,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: Date.now,
    exists: fs.existsSync,
    isPortFree,
    killTree,
    pids,
    log,
    baseEnv: baseEnv(process.env),
    logsDir: layout.logsDir,
  })
  supervisor.on('status', (label: string | null) => label && console.log(label))
  supervisor.on('failed', (f) => console.error(`helix web: ${f.title} stopped. ${f.detail} Log: ${f.logFile}`))

  const voice = createVoice(resolveVoice({ resources, repo: layout.repo, env: process.env, exists: fs.existsSync }))
  const version = (JSON.parse(fs.readFileSync(path.join(layout.repo, 'apps', 'desktop', 'package.json'), 'utf8')) as { version: string }).version
  const token = randomBytes(32).toString('hex')

  const result = await supervisor.startAll()
  if (!result.ok) {
    for (const f of result.failures) console.error(`helix web: ${f.title}: ${f.detail} Log: ${f.logFile}`)
    await supervisor.stopAll()
    process.exit(1)
  }

  const server = createWebServer({
    port,
    token,
    upstreamPort: DESKTOP_PORTS.api,
    ...(uiDev ? { uiPort: UI_DEV_PORT } : {}),
    info: { apiKey: secrets.apiKey, adminToken: secrets.adminToken, version, apiOrigin: loopback(DESKTOP_PORTS.api) },
    voice: () => voice.ensureStarted(),
    log,
  })
  // 127.0.0.1 only: never 0.0.0.0, never ::.
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve))

  let stopping = false
  const stop = (): void => {
    if (stopping) return
    stopping = true
    console.log('Stopping Helix')
    server.close()
    void supervisor.stopAll().then(() => voice.stop()).finally(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  const url = `${loopback(port)}/?t=${token}`
  console.log(`Helix is running. Open this link (valid until you stop it):\n${url}`)
  if (!args.has('--no-open') && !process.env.HELIX_WEB_NO_OPEN) spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' }).unref()
}

main().catch((e) => fail(e instanceof Error ? e.stack ?? e.message : String(e)))
