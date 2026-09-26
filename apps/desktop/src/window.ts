import { BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'

export const APP_BACKGROUND = '#0b1220'

export interface DesktopInfo {
  apiKey: string
  adminToken: string
  version: string
  platform: 'win32'
}

export interface MainWindowOptions {
  origin: string
  info: DesktopInfo
  icon?: string
}

export function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

export function isExternalLink(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url)
}

interface FrameLike {
  url: string
}

/** Our window's top document on our own origin; an iframe inside it never qualifies. */
export function trustedSender(
  e: { sender: unknown; senderFrame: FrameLike | null | undefined },
  contents: { mainFrame: FrameLike },
  origin: string,
): boolean {
  const frame = e.senderFrame
  if (!frame || e.sender !== contents || frame !== contents.mainFrame) return false
  return sameOrigin(frame.url, origin)
}

export function createMainWindow(o: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Helix',
    backgroundColor: APP_BACKGROUND,
    autoHideMenuBar: true,
    ...(o.icon ? { icon: o.icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  // Keys go only to a document served by our own API, never to a page a link wandered to.
  const onInfo = (e: Electron.IpcMainEvent) => {
    e.returnValue = !win.isDestroyed() && trustedSender(e, win.webContents, o.origin) ? o.info : null
  }
  ipcMain.on('helix:desktop-info', onInfo)
  win.on('closed', () => ipcMain.off('helix:desktop-info', onInfo))

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalLink(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (sameOrigin(url, o.origin)) return
    e.preventDefault()
    if (isExternalLink(url)) void shell.openExternal(url)
  })

  void win.loadURL(`${o.origin}/app`)
  return win
}
