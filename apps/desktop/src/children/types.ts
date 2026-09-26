export type Env = Record<string, string>

export interface Ports {
  api: number
  fetch: number
  extract: number
}

export interface Secrets {
  apiKey: string
  adminToken: string
}

export interface ChildContext {
  dev: boolean
  resources: string
  repo: string
  dataDir: string
  runtimeDir: string
  execPath: string
  secrets: Secrets
  ports: Ports
  exists: (p: string) => boolean
}

export interface ChildSpec {
  name: string
  title: string
  label: string
  command: string
  args: string[]
  env: Env
  cwd: string
  port: number
  healthUrl: string
  isUp: (status: number) => boolean
  ipc?: boolean
}

export type ChildFactory = (ctx: ChildContext) => ChildSpec

export const DESKTOP_PORTS: Ports = { api: 7410, fetch: 7411, extract: 7412 }

export const loopback = (port: number): string => `http://127.0.0.1:${port}`

const INHERITED_DROP = /^(HELIX_|DATABASE_URL$|ELECTRON_RUN_AS_NODE$|NODE_OPTIONS$|PLAYWRIGHT_BROWSERS_PATH$)/i

export function baseEnv(source: NodeJS.ProcessEnv): Env {
  const out: Env = {}
  for (const [k, v] of Object.entries(source)) {
    if (v !== undefined && !INHERITED_DROP.test(k)) out[k] = v
  }
  return out
}
