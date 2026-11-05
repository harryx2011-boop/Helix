import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(desktop, 'out')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

await build({
  entryPoints: {
    launch: join(desktop, 'src', 'web', 'launch.ts'),
  },
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: 'linked',
  logLevel: 'warning',
})
console.log(`built ${out}`)
