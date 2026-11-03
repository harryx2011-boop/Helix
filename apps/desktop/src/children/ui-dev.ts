import path from 'node:path'
import { loopback, type ChildContext, type ChildSpec } from './types'

export const UI_DEV_PORT = 3400

/** `next dev` for the dashboard, so a UI edit shows on refresh with no export step. Browser app only (`--ui-dev`). */
export function uiDevSpec(ctx: ChildContext): ChildSpec {
  const app = path.join(ctx.repo, 'apps', 'dashboard')
  return {
    name: 'ui',
    title: 'The interface (dev server)',
    label: 'Starting interface',
    command: ctx.execPath,
    args: [path.join(app, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', String(UI_DEV_PORT), '-H', '127.0.0.1'],
    // Same-origin API calls, desktop-style build: the gate forwards /v1 to the API.
    env: { HELIX_HOSTED: '0', NEXT_PUBLIC_HELIX_API_URL: '' },
    cwd: app,
    port: UI_DEV_PORT,
    healthUrl: `${loopback(UI_DEV_PORT)}/app`,
    isUp: (status) => status < 500,
  }
}
