import { BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import type { Failure } from './supervisor'

export const SPLASH_MIN_MS = 600

export type SplashState =
  | { phase: 'starting'; label: string; version: string }
  | { phase: 'failed'; failures: Pick<Failure, 'name' | 'title' | 'detail'>[]; version: string }

export interface SplashOptions {
  version: string
  reducedMotion: boolean
  icon?: string
  onShowLog: (name: string) => void
  onRetry: () => void
  onQuit: () => void
}

export interface Splash {
  window: BrowserWindow
  starting(label: string | null): void
  failed(failures: Failure[]): void
  close(): Promise<void>
}

/** Remaining wait so a splash shown at `shownAt` stays up at least `min` ms. */
export function remainingShow(shownAt: number | null, now: number, min = SPLASH_MIN_MS): number {
  return shownAt === null ? min : Math.max(0, min - (now - shownAt))
}

export function openSplash(o: SplashOptions): Splash {
  const window = new BrowserWindow({
    width: 440,
    height: 280,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    center: true,
    title: 'Helix',
    backgroundColor: '#0b1220',
    ...(o.icon ? { icon: o.icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  let state: SplashState = { phase: 'starting', label: 'Starting', version: o.version }
  let shownAt: number | null = null
  const push = () => {
    if (!window.isDestroyed()) window.webContents.send('splash:state', state)
  }
  const fromSplash = (e: Electron.IpcMainEvent) => !window.isDestroyed() && e.sender === window.webContents
  const onReady = (e: Electron.IpcMainEvent) => fromSplash(e) && push()
  const onLog = (e: Electron.IpcMainEvent, name: unknown) => fromSplash(e) && typeof name === 'string' && o.onShowLog(name)
  const onRetry = (e: Electron.IpcMainEvent) => fromSplash(e) && o.onRetry()
  const onQuit = (e: Electron.IpcMainEvent) => fromSplash(e) && o.onQuit()
  ipcMain.on('splash:ready', onReady)
  ipcMain.on('splash:show-log', onLog)
  ipcMain.on('splash:retry', onRetry)
  ipcMain.on('splash:quit', onQuit)
  window.on('closed', () => {
    ipcMain.off('splash:ready', onReady)
    ipcMain.off('splash:show-log', onLog)
    ipcMain.off('splash:retry', onRetry)
    ipcMain.off('splash:quit', onQuit)
  })

  window.once('ready-to-show', () => {
    shownAt = Date.now()
    window.show()
  })
  window.webContents.on('will-navigate', (e) => e.preventDefault())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  void window.loadFile(path.join(__dirname, 'splash.html'), { query: o.reducedMotion ? { rm: '1' } : {} })

  return {
    window,
    starting(label) {
      state = { phase: 'starting', label: label ?? 'Opening Helix', version: o.version }
      push()
    },
    failed(failures) {
      state = { phase: 'failed', failures: failures.map(({ name, title, detail }) => ({ name, title, detail })), version: o.version }
      push()
      if (!window.isDestroyed()) {
        window.setSkipTaskbar(false)
        window.focus()
      }
    },
    async close() {
      const wait = remainingShow(shownAt, Date.now())
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      if (!window.isDestroyed()) window.destroy()
    },
  }
}
