import { execFile, execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import type { ChildSpec } from './children/types'
import { parseProcList, type ProcInfo } from './pidfile'
import type { ChildHandle } from './supervisor'

const LOG_ROTATE_BYTES = 5 * 1024 * 1024

export function openLog(file: string): number {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  try {
    if (fs.statSync(file).size > LOG_ROTATE_BYTES) fs.renameSync(file, `${file}.1`)
  } catch {}
  return fs.openSync(file, 'a')
}

export function spawnChild(spec: ChildSpec, env: Record<string, string>, logFile: string): ChildHandle {
  const fd = openLog(logFile)
  fs.writeSync(fd, `\n--- ${new Date().toISOString()} ${spec.command} ${spec.args.join(' ')}\n`)
  try {
    return spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env,
      windowsHide: true,
      stdio: spec.ipc ? ['ignore', fd, fd, 'ipc'] : ['ignore', fd, fd],
    })
  } finally {
    fs.closeSync(fd)
  }
}

export function killTree(pid: number): void {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } catch {}
}

export function listProcs(pids: number[]): Promise<ProcInfo[]> {
  const filter = pids.map((p) => `ProcessId=${Math.trunc(p)}`).join(' OR ')
  const script = `Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { '{0}|{1}|{2}' -f $_.ProcessId, $_.Name, ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }`
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true, timeout: 15_000 },
      (err, stdout) => (err ? reject(err) : resolve(parseProcList(stdout))),
    )
  })
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}
