import path from 'node:path'
import { loopback, type ChildFactory } from './types'

export const scrapeSpec: ChildFactory = (ctx) => {
  const listen = ['--port', String(ctx.ports.scrape), '--host', '127.0.0.1']
  const base = {
    name: 'scrape',
    title: 'The browser engine',
    label: 'Starting browser engine',
    env: { HELIX_SERVICE_TOKEN: ctx.serviceToken },
    port: ctx.ports.scrape,
    healthUrl: `${loopback(ctx.ports.scrape)}/health`,
    isUp: (status: number) => status === 200,
  }

  if (ctx.dev) {
    const app = path.join(ctx.repo, 'apps', 'scrape')
    return { ...base, command: path.join(app, '.venv', 'Scripts', 'pythonw.exe'), args: ['-m', 'helix_scrape', ...listen], cwd: app }
  }
  const dir = path.join(ctx.resources, 'scrape')
  return { ...base, command: path.join(dir, 'helix-scrape.exe'), args: listen, cwd: dir }
}
