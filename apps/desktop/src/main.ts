// VSCode shells export this; a relaunch after an update must not inherit it.
delete process.env.ELECTRON_RUN_AS_NODE

import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell, systemPreferences } from 'electron'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { children } from './children'
import { baseEnv, DESKTOP_PORTS, loopback, type ChildContext } from './children/types'
import { probeHttp } from './health'
import { loadOrCreateSecrets } from './keys'
import { resolveLayout } from './layout'
import { fileLogger } from './log'
import { fileStore, killStale } from './pidfile'
import { isPortFree, killTree, listProcs, spawnChild } from './procs'
import { openSplash, type Splash } from './splash'
import { Supervisor, type Failure } from './supervisor'
import { startUpdater } from './updater'
import { createVoice, registerVoiceIpc, resolveVoice, type VoiceHost } from './voice'
import { createMainWindow, trustedSender } from './window'

const dev = process.env.HELIX_DESKTOP_DEV === '1'
if (dev) app.setPath('userData', path.join(app.getPath('appData'), 'Helix-dev'))

const primary = app.requestSingleInstanceLock()
if (!primary) app.exit(0)
app.setAppUserModelId('dev.helix.desktop')

const layout = resolveLayout({
  dev,
  packaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appDir: __dirname,
  userData: app.getPath('userData'),
})
const log = fileLogger(path.join(layout.logsDir, 'desktop.log'))
const icon = app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.ico')

let supervisor: Supervisor | null = null
let secretsCache: ReturnType<typeof loadOrCreateSecrets> | null = null
let splash: Splash | null = null
let mainWindow: BrowserWindow | null = null
let voice: VoiceHost | null = null
let quitting = false

function reducedMotion(): boolean {
  try {
    return systemPreferences.getAnimationSettings().prefersReducedMotion
  } catch {
    return false
  }
}

function focusExisting(): void {
  const w = mainWindow ?? splash?.window
  if (!w || w.isDestroyed()) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

async function boot(): Promise<void> {
  if (!supervisor || !splash) return
  const result = await supervisor.startAll()
  if (quitting) return
  if (!result.ok) {
    splash.failed(result.failures)
    return
  }
  splash.starting('Opening Helix')
  const appUrl = `${loopback(DESKTOP_PORTS.api)}/app`
  const status = await probeHttp(appUrl)
  if (status === null || status >= 400) {
    splash.failed([
      {
        name: 'api',
        title: 'The interface',
        reason: 'exited',
        detail: `${appUrl} answered ${status ?? 'nothing'}; the API is running but is not serving the app.`,
        logFile: supervisor.logFile('api'),
      },
    ])
    return
  }
  openMainWindow()
}

function openMainWindow(): void {
  const secrets = secretsCache!
  const win = createMainWindow({
    origin: loopback(DESKTOP_PORTS.api),
    info: { apiKey: secrets.apiKey, adminToken: secrets.adminToken, version: app.getVersion(), platform: 'win32' },
    ...(icon ? { icon } : {}),
  })
  mainWindow = win
  const origin = loopback(DESKTOP_PORTS.api)
  if (voice) win.on('closed', registerVoiceIpc(ipcMain, voice, (e) => !win.isDestroyed() && trustedSender(e, win.webContents, origin)))
  win.once('ready-to-show', () => {
    void (splash?.close() ?? Promise.resolve()).then(() => {
      splash = null
      if (win.isDestroyed()) return
      win.show()
      if (app.isPackaged) startUpdater(log)
    })
  })
  win.on('closed', () => {
    mainWindow = null
  })
  win.webContents.on('did-fail-load', (_e, code, description, url) => log(`window: load failed ${code} ${description} ${url}`))
}

function onChildFailed(f: Failure): void {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
  const options = {
    type: 'error' as const,
    title: 'Helix',
    message: `${f.title} stopped`,
    detail: f.detail,
    buttons: ['Show log', 'Quit', 'Close'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  }
  void (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)).then(({ response }) => {
    if (response === 0) void shell.openPath(f.logFile)
    if (response === 1) app.quit()
  })
}

app.on('second-instance', focusExisting)

app.on('window-all-closed', () => app.quit())

let stopped = false
app.on('before-quit', (e) => {
  quitting = true
  if (stopped || !supervisor) return
  e.preventDefault()
  stopped = true
  const s = supervisor
  void s
    .stopAll()
    .then(() => voice?.stop())
    .catch((err) => log(`stop: ${String(err)}`))
    .finally(() => app.quit())
})

if (primary) {
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    log(`start ${app.getVersion()} ${dev ? 'dev' : app.isPackaged ? 'packaged' : 'staged'} resources=${layout.resources}`)
    for (const dir of [layout.dataDir, layout.runtimeDir, layout.logsDir]) fs.mkdirSync(dir, { recursive: true })

    splash = openSplash({
      version: app.getVersion(),
      reducedMotion: reducedMotion(),
      ...(icon ? { icon } : {}),
      onShowLog: (name) => void shell.openPath(supervisor?.logFile(name) ?? layout.logsDir),
      onRetry: () => {
        splash?.starting(null)
        void boot()
      },
      onQuit: () => app.quit(),
    })

    secretsCache = loadOrCreateSecrets(
      layout.credentials,
      {
        available: () => safeStorage.isEncryptionAvailable(),
        encrypt: (s) => safeStorage.encryptString(s),
        decrypt: (b) => safeStorage.decryptString(b),
      },
      log,
    )

    voice = createVoice(resolveVoice({ resources: layout.resources, repo: layout.repo, env: process.env, exists: fs.existsSync }))

    const pids = fileStore(layout.runDir)
    await killStale({ store: pids, list: listProcs, killTree, log })

    const ctx: ChildContext = {
      dev,
      resources: layout.resources,
      repo: layout.repo,
      dataDir: layout.dataDir,
      runtimeDir: layout.runtimeDir,
      execPath: process.execPath,
      secrets: secretsCache,
      serviceToken: randomBytes(32).toString('hex'),
      ports: DESKTOP_PORTS,
      exists: fs.existsSync,
    }
    supervisor = new Supervisor(
      children.map((make) => make(ctx)),
      {
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
      },
    )
    supervisor.on('status', (label: string | null) => {
      if (label) splash?.starting(label)
    })
    supervisor.on('failed', onChildFailed)
    await boot()
  })
}
