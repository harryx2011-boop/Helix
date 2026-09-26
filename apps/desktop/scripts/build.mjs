import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(desktop, 'out')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

await build({
  entryPoints: ['main', 'preload', 'splash-preload'].map((n) => join(desktop, 'src', `${n}.ts`)),
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: 'linked',
  logLevel: 'warning',
})
copyFileSync(join(desktop, 'src', 'splash.html'), join(out, 'splash.html'))
console.log(`built ${out}`)
