import path from 'node:path'

export interface Layout {
  dev: boolean
  resources: string
  repo: string
  userData: string
  dataDir: string
  runtimeDir: string
  logsDir: string
  runDir: string
  credentials: string
}

export interface LayoutInput {
  dev: boolean
  packaged: boolean
  resourcesPath: string
  appDir: string
  userData: string
}

export function resolveLayout(i: LayoutInput): Layout {
  const desktop = path.resolve(i.appDir, '..')
  const repo = path.resolve(desktop, '..', '..')
  return {
    dev: i.dev,
    resources: i.packaged ? i.resourcesPath : path.join(desktop, 'resources'),
    repo,
    userData: i.userData,
    dataDir: path.join(i.userData, 'data'),
    runtimeDir: path.join(i.userData, 'runtime'),
    logsDir: path.join(i.userData, 'logs'),
    runDir: path.join(i.userData, 'run'),
    credentials: path.join(i.userData, 'credentials.json'),
  }
}

export interface WebLayout {
  repo: string
  userData: string
  dataDir: string
  runtimeDir: string
  /** The browser app's own writes (logs, pid files, its credentials) live here, apart from Electron's folders. */
  webDir: string
  logsDir: string
  runDir: string
}

/**
 * The browser app shares the Electron app's data and runtime folders so existing
 * projects, keys and history stay readable, and keeps everything else under `web/`.
 */
export function resolveWebLayout(userData: string, appDir: string): WebLayout {
  const repo = path.resolve(appDir, '..', '..', '..')
  const webDir = path.join(userData, 'web')
  return {
    repo,
    userData,
    dataDir: path.join(userData, 'data'),
    runtimeDir: path.join(userData, 'runtime'),
    webDir,
    logsDir: path.join(webDir, 'logs'),
    runDir: path.join(webDir, 'run'),
  }
}
