import path from 'node:path'
import { loopback, type ChildFactory } from './types'

export const extractSpec: ChildFactory = (ctx) => {
  const port = String(ctx.ports.extract)
  const listen = ['--port', port, '--host', '127.0.0.1']
  const base = {
    name: 'extract',
    title: 'Extract',
    label: 'Starting extract',
    env: { HELIX_RUNTIME_DIR: ctx.runtimeDir, HELIX_SERVICE_TOKEN: ctx.serviceToken },
    port: ctx.ports.extract,
    healthUrl: `${loopback(ctx.ports.extract)}/health`,
    isUp: (status: number) => status === 200,
  }

  if (ctx.dev) {
    const app = path.join(ctx.repo, 'apps', 'extract')
    const hasMain = ctx.exists(path.join(app, 'helix_extract', '__main__.py'))
    return {
      ...base,
      command: path.join(app, '.venv', 'Scripts', 'pythonw.exe'),
      args: hasMain ? ['-m', 'helix_extract', ...listen] : ['-m', 'uvicorn', 'helix_extract.main:app', ...listen],
      cwd: app,
    }
  }
  const dir = path.join(ctx.resources, 'extract')
  return { ...base, command: path.join(dir, 'helix-extract.exe'), args: listen, cwd: dir }
}
