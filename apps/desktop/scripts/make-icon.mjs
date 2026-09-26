import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, '..')
const repo = join(desktop, '..', '..')

// The dashboard's app icon is the mark from public/logo.svg on its square tile; the wordmark in logo.svg is unreadable at 16 px.
const source = join(repo, 'apps', 'dashboard', 'app', 'icon.svg')
const svg = readFileSync(source)
const sizes = [16, 24, 32, 48, 64, 128, 256]

const layers = sizes.map((size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render().asPng(),
)

const outDir = join(desktop, 'build')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'icon.png'), layers[layers.length - 1])
writeFileSync(join(outDir, 'icon.ico'), await pngToIco(layers))
console.log(`icon.ico: ${sizes.join(', ')} px from ${source}`)
