// Builds every runtime piece and copies it into apps/desktop/resources for electron-builder's extraResources.
// Usage: node scripts/stage.mjs [--skip api,ui,extract,fetch,browsers] [--skip <step>]...
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(desktop, '..', '..')
const res = join(desktop, 'resources')
const nodeDir = dirname(process.execPath)

class StageError extends Error {}

function assertExists(p, what) {
  if (!existsSync(p)) throw new StageError(`${what} missing: ${p}`)
}

function run(command, args, opts = {}) {
  console.log(`  $ ${command} ${args.join(' ')}`)
  const r = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, ...opts })
  if (r.error) throw new StageError(`${command} failed to start: ${r.error.message}`)
  if (r.status !== 0) throw new StageError(`${command} ${args.join(' ')} exited ${r.status}`)
}

// Calling the JS entry points through this node avoids the .cmd shims, which need a shell.
function corepack(args, opts) {
  const cli = join(nodeDir, 'node_modules', 'corepack', 'dist', 'corepack.js')
  assertExists(cli, 'corepack')
  run(process.execPath, [cli, ...args], { cwd: repo, ...opts })
}

function npm(args, opts) {
  const cli = join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
  assertExists(cli, 'npm')
  run(process.execPath, [cli, ...args], opts)
}

function fresh(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

function dirSize(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    total += entry.isDirectory() ? dirSize(p) : statSync(p).size
  }
  return total
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Exact resolved versions of apps/api's direct dependencies, read from pnpm-lock.yaml. */
export function lockedVersions(lockText, importer = 'apps/api') {
  const lines = lockText.split(/\r?\n/)
  const versions = {}
  let i = lines.findIndex((l) => l === 'importers:')
  if (i < 0) return versions
  i = lines.findIndex((l, n) => n > i && l === `  ${importer}:`)
  if (i < 0) return versions
  let current = null
  for (let n = i + 1; n < lines.length; n++) {
    const l = lines[n]
    if (/^ {0,2}\S/.test(l)) break
    const dep = /^ {6}'?([^':]+)'?:\s*$/.exec(l)
    if (dep) current = dep[1]
    const ver = /^ {8}version: (\S+)/.exec(l)
    if (ver && current) versions[current] = ver[1].replace(/\(.*$/, '')
  }
  return versions
}

/** The single version of a package in the lockfile's packages section, for externals that are not direct deps. */
export function packageVersion(lockText, name) {
  const found = new Set()
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const re = new RegExp(`^  '?${escaped}@([^(':]+)`, 'gm')
  for (const m of lockText.matchAll(re)) found.add(m[1])
  return found.size === 1 ? [...found][0] : null
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

const steps = {
  api() {
    const api = join(repo, 'apps', 'api')
    const dist = join(api, 'dist')
    const out = join(res, 'api')
    corepack(['pnpm', '--filter', '@helix/api', 'bundle'])
    assertExists(join(dist, 'helix-api.js'), 'API bundle')
    assertExists(join(dist, 'externals.json'), 'API externals list')

    fresh(out)
    // dist/ also holds tsc output from `build`; the runtime needs only the single-file bundle.
    mkdirSync(join(out, 'dist'), { recursive: true })
    cpSync(join(dist, 'helix-api.js'), join(out, 'dist', 'helix-api.js'))
    cpSync(join(api, 'migrations'), join(out, 'migrations'), { recursive: true })

    const runtimeFiles = join(dist, 'runtime-files.json')
    assertExists(runtimeFiles, 'API runtime file list')
    for (const { source, stagedAt } of readJson(runtimeFiles)) {
      const from = resolve(repo, source)
      const to = resolve(out, stagedAt)
      if (relative(out, to).startsWith('..') || isAbsolute(relative(out, to))) throw new StageError(`runtime file escapes api/: ${stagedAt}`)
      assertExists(from, 'runtime file')
      mkdirSync(dirname(to), { recursive: true })
      cpSync(from, to, { recursive: true })
    }

    const lock = readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8')
    const direct = lockedVersions(lock)
    const externals = readJson(join(dist, 'externals.json'))
    const names = Array.isArray(externals) ? externals : Object.keys(externals)
    const dependencies = {}
    for (const name of names) {
      const version = direct[name] ?? packageVersion(lock, name)
      if (!version) throw new StageError(`no single locked version for external ${name}`)
      dependencies[name] = version
    }
    const version = readJson(join(api, 'package.json')).version
    writeFileSync(
      join(out, 'package.json'),
      JSON.stringify({ name: 'helix-api-runtime', version, private: true, type: 'module', dependencies }, null, 2),
    )
    npm(['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'], { cwd: out })
    // electron-builder drops every node_modules dir under extraResources, so the externals travel
    // under a different source name and electron-builder.yml maps them back to api/node_modules.
    const modules = join(res, 'api_modules')
    fresh(modules)
    cpSync(join(out, 'node_modules'), modules, { recursive: true })
    rmSync(join(out, 'node_modules'), { recursive: true, force: true })
    for (const name of names) assertExists(join(modules, name, 'package.json'), `external ${name}`)
    return `${names.length} externals, ${mb(dirSize(out))} + modules ${mb(dirSize(modules))}`
  },

  ui() {
    const exportDir = join(repo, 'apps', 'dashboard', 'out')
    const hasApp = (dir) => existsSync(join(dir, 'app', 'index.html')) || existsSync(join(dir, 'app.html'))
    // Always rebuilt: an export left over from a hosted or dev build would ship silently.
    // Both set explicitly: .env.local would otherwise make the build hosted and bake localhost:7400 into the chunks.
    const env = { ...process.env, HELIX_HOSTED: '0', NEXT_PUBLIC_HELIX_API_URL: '' }
    for (const k of ['HELIX_TARGET', 'VERCEL']) delete env[k]
    corepack(['pnpm', '--filter', '@helix/dashboard', 'build'], { env })
    if (!hasApp(exportDir)) throw new StageError(`dashboard export has no /app page: ${exportDir}`)
    const out = join(res, 'ui')
    fresh(out)
    cpSync(exportDir, out, { recursive: true })
    return mb(dirSize(out))
  },

  extract() {
    const app = join(repo, 'apps', 'extract')
    const script = join(app, 'build-exe.ps1')
    assertExists(script, 'extract build script')
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { cwd: app })
    const built = join(app, 'dist', 'helix-extract')
    assertExists(join(built, 'helix-extract.exe'), 'extract exe')
    const out = join(res, 'extract')
    fresh(out)
    cpSync(built, out, { recursive: true })
    assertExists(join(out, 'helix-extract.exe'), 'staged extract exe')
    return mb(dirSize(out))
  },

  fetch() {
    const exe = join(repo, 'apps', 'fetch', 'target', 'release', 'helix-fetch.exe')
    assertExists(exe, 'helix-fetch release build (cargo build --release in apps/fetch)')
    const out = join(res, 'fetch')
    fresh(out)
    cpSync(exe, join(out, 'helix-fetch.exe'))
    const profiles = join(repo, 'packages', 'profiles', 'definitions')
    if (existsSync(profiles)) cpSync(profiles, join(out, 'profiles'), { recursive: true })
    assertExists(join(out, 'helix-fetch.exe'), 'staged fetch exe')
    return mb(dirSize(out))
  },

  browsers() {
    const out = join(res, 'browsers')
    const cli = join(repo, 'node_modules', 'playwright', 'cli.js')
    assertExists(cli, 'playwright CLI')
    mkdirSync(out, { recursive: true })
    // The API launches Playwright headless only, which uses the headless shell; the full Chromium is ~450 MB unused.
    run(process.execPath, [cli, 'install', 'chromium-headless-shell'], {
      cwd: repo,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: out },
    })
    // .links records this dev checkout's playwright path for browser GC; the installed app has no use for it.
    rmSync(join(out, '.links'), { recursive: true, force: true })
    const dirs = readdirSync(out)
    for (const prefix of ['chromium_headless_shell-']) {
      if (!dirs.some((d) => d.startsWith(prefix) && /-\d+$/.test(d))) throw new StageError(`${prefix}<rev> missing in ${out}`)
    }
    return `${dirs.join(', ')}; ${mb(dirSize(out))}`
  },
}

function parseSkips(argv) {
  const skip = new Set()
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--skip' && argv[i + 1]) argv[++i].split(',').forEach((s) => skip.add(s.trim()))
    else if (argv[i].startsWith('--skip=')) argv[i].slice(7).split(',').forEach((s) => skip.add(s.trim()))
  }
  for (const s of skip) if (!(s in steps)) throw new StageError(`unknown step "${s}"; steps: ${Object.keys(steps).join(', ')}`)
  return skip
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const skip = parseSkips(process.argv.slice(2))
    mkdirSync(res, { recursive: true })
    for (const [name, step] of Object.entries(steps)) {
      if (skip.has(name)) {
        console.log(`- ${name}: skipped`)
        continue
      }
      console.log(`> ${name}`)
      console.log(`+ ${name}: ${step()}`)
    }
  } catch (e) {
    console.error(`stage failed: ${e instanceof StageError ? e.message : e?.stack ?? e}`)
    process.exit(1)
  }
}
