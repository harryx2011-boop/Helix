// Phase B gate (voice-core plan): dictation lands in the agent composer of the packaged app.
// Launches the app with a fake microphone that plays a recorded WAV, drives the composer's mic
// button through the app's own debug port, and prints what happened. No OS input, no real mic.
//
//   node scripts/verify-dictation.mjs [exe] [--wav <file>] [--seconds 14] [--port 9334]
//
// It refuses to run while an installed Helix holds the desktop ports, and it keeps its own
// user-data folder, so the installed app's data is never touched.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(desktop, '..', '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))
const exe = path.resolve(positional[0] ?? path.join(desktop, 'release', 'win-unpacked', 'Helix.exe'))
const wav = path.resolve(arg('wav', path.join(repo, '..', 'voice-core', 'tests', 'fixtures', 'accuracy_sample.wav')))
const seconds = Number(arg('seconds', '14'))
const debugPort = Number(arg('port', '9334'))
const APP = 'http://127.0.0.1:7410'
const EXPECT = ['austin', 'robotics']

const require = createRequire(path.join(repo, 'package.json'))
const { chromium } = require('playwright')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function portTaken(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => (s.destroy(), resolve(true)))
    s.once('error', () => resolve(false))
  })
}

async function until(fn, ms, what) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn().catch(() => null)
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out after ${ms / 1000}s waiting for ${what}`)
    await sleep(150)
  }
}

for (const p of [7410, 7411, 7412, 9000, debugPort]) {
  if (await portTaken(p)) throw new Error(`port ${p} is in use; close the running Helix or voice-core first`)
}
if (!fs.existsSync(exe)) throw new Error(`${exe} is missing: pnpm --filter @helix/desktop package (or electron-builder --dir)`)
if (!fs.existsSync(wav)) throw new Error(`${wav} is missing`)

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-verify-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const t0 = Date.now()
const proc = spawn(
  exe,
  [
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${debugPort}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
  ],
  { env, stdio: 'ignore', windowsHide: false },
)

let browser
let page
const consoleLines = []
try {
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`), 90_000, 'the app debug port')
  page = await until(
    async () => browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(`${APP}/app`)),
    180_000,
    'the Helix window',
  )
  const appReadyMs = Date.now() - t0
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`.slice(0, 300)))
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`.slice(0, 300)))
  await page.goto(`${APP}/app/agent`, { waitUntil: 'domcontentloaded' })

  const mic = page.getByRole('button', { name: 'Dictate', exact: true })
  await mic.waitFor({ timeout: 30_000 })
  const textarea = page.locator('textarea').first()
  const bridge = await page.evaluate(() => typeof window.helixDesktop?.voice?.connect)

  const clicked = Date.now()
  await mic.click()
  await page.getByRole('button', { name: 'Stop dictating', exact: true }).waitFor({ timeout: Number(arg('start-timeout', '240')) * 1000 })
  const listeningMs = Date.now() - clicked
  const heard = []
  const spoke = Date.now()
  while (Date.now() - spoke < seconds * 1000) {
    const caption = await page.locator('p.text-muted-foreground.truncate').first().textContent({ timeout: 500 }).catch(() => null)
    if (caption && heard.at(-1) !== caption) heard.push(caption)
    await sleep(400)
  }
  const released = Date.now()
  await page.getByRole('button', { name: 'Stop dictating', exact: true }).click()
  await page.getByRole('button', { name: 'Dictate', exact: true }).waitFor({ timeout: 120_000 })
  const stopToTextMs = Date.now() - released
  const text = await textarea.inputValue()

  const lower = text.toLowerCase()
  const missing = EXPECT.filter((w) => !lower.includes(w))
  const result = { ok: missing.length === 0, bridge, appReadyMs, listeningMs, listenedSeconds: seconds, stopToTextMs, partialsSeen: heard.length, text }
  console.log(JSON.stringify(result, null, 2))
  if (missing.length) throw new Error(`transcript is missing: ${missing.join(', ')}`)
} catch (err) {
  const labels = await page?.locator('button[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))).catch(() => null)
  const caption = await page?.locator('p.truncate').allTextContents().catch(() => null)
  const health = await fetch('http://127.0.0.1:9000/health').then((r) => r.text()).catch((e) => `no answer: ${e.message}`)
  console.error(JSON.stringify({ failure: String(err.message).split(/\r?\n/)[0], labels, caption, voiceCoreHealth: health, console: consoleLines.slice(-15) }, null, 2))
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  try {
    execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  } catch {
    // already gone
  }
  await sleep(2000)
  fs.rmSync(userData, { recursive: true, force: true })
}
