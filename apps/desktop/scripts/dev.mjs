import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..')
const electron = createRequire(import.meta.url)('electron')
const env = { ...process.env, HELIX_DESKTOP_DEV: '1' }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, ['.'], { cwd: desktop, env, stdio: 'inherit', windowsHide: true })
child.on('exit', (code) => process.exit(code ?? 0))
