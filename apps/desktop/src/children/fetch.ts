import path from 'node:path'
import { loopback, type ChildFactory } from './types'

export const fetchSpec: ChildFactory = (ctx) => {
  // In dev, cwd apps/fetch lets the binary find ../../packages/profiles/definitions; installed, it reads profiles/ beside itself.
  const cwd = ctx.dev ? path.join(ctx.repo, 'apps', 'fetch') : path.join(ctx.resources, 'fetch')
  const command = ctx.dev
    ? path.join(ctx.repo, 'apps', 'fetch', 'target', 'release', 'helix-fetch.exe')
    : path.join(cwd, 'helix-fetch.exe')
  return {
    name: 'fetch',
    title: 'The browser engine',
    label: 'Starting browser engine',
    command,
    args: [],
    env: { HELIX_FETCH_PORT: String(ctx.ports.fetch), HELIX_FETCH_HOST: '127.0.0.1' },
    cwd,
    port: ctx.ports.fetch,
    healthUrl: `${loopback(ctx.ports.fetch)}/health`,
    isUp: (status) => status === 200,
  }
}
