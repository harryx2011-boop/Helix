import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(desktop, 'out')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

await build({
  entryPoints: {
    main: join(desktop, 'src', 'main.ts'),
    preload: join(desktop, 'src', 'preload.ts'),
    'splash-preload': join(desktop, 'src', 'splash-preload.ts'),
    launch: join(desktop, 'src', 'web', 'launch.ts'),
  },
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
