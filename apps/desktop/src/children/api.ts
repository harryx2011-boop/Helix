import path from 'node:path'
import { loopback, type ChildFactory, type Env } from './types'

export const apiSpec: ChildFactory = (ctx) => {
  const origin = loopback(ctx.ports.api)
  const ui = ctx.dev ? path.join(ctx.repo, 'apps', 'dashboard', 'out') : path.join(ctx.resources, 'ui')
  const browsers = path.join(ctx.resources, 'browsers')

  const env: Env = {
    HELIX_DB: 'pglite',
    HELIX_DATA_DIR: ctx.dataDir,
    HELIX_PORT: String(ctx.ports.api),
    HELIX_HOST: '127.0.0.1',
    HELIX_FETCH_URL: loopback(ctx.ports.fetch),
    HELIX_EXTRACT_URL: loopback(ctx.ports.extract),
    HELIX_PUBLIC_URL: origin,
    HELIX_CORS_ORIGINS: origin,
    HELIX_BOOTSTRAP_KEY: ctx.secrets.apiKey,
    HELIX_INTERNAL_ADMIN_TOKEN: ctx.secrets.adminToken,
    HELIX_SERVICE_TOKEN: ctx.serviceToken,
    HELIX_LOG_LEVEL: 'info',
  }
  if (!ctx.dev || ctx.exists(ui)) env.HELIX_STATIC_DIR = ui
  if (!ctx.dev || ctx.exists(browsers)) env.PLAYWRIGHT_BROWSERS_PATH = browsers

  const base = {
    name: 'api',
    title: 'The database and API',
    label: 'Starting database',
    port: ctx.ports.api,
    healthUrl: `${origin}/v1/health`,
    // 503 is the API reporting a degraded dependency, which still means it is serving.
    isUp: (status: number) => status === 200 || status === 503,
    ipc: true,
  }

  if (ctx.dev) {
    return { ...base, command: 'node', args: ['--import', 'tsx', 'src/index.ts'], env, cwd: path.join(ctx.repo, 'apps', 'api') }
  }
  const apiDir = path.join(ctx.resources, 'api')
  return {
    ...base,
    command: ctx.execPath,
    args: [path.join(apiDir, 'dist', 'helix-api.js')],
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    cwd: apiDir,
  }
}
