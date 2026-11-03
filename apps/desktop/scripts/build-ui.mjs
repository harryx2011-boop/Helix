// Exports the dashboard as the static UI the API serves (apps/dashboard/out), built for the browser app:
// not hosted, same-origin API calls. Run once, and again after UI changes unless you start with --ui-dev.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const corepack = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js')
const env = { ...process.env, HELIX_HOSTED: '0', NEXT_PUBLIC_HELIX_API_URL: '' }
for (const k of ['HELIX_TARGET', 'VERCEL']) delete env[k]

const r = spawnSync(process.execPath, [corepack, 'pnpm', '--filter', '@helix/dashboard', 'build'], { cwd: repo, env, stdio: 'inherit', windowsHide: true })
process.exit(r.status ?? 1)
