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
