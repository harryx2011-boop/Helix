import fs from 'node:fs'
import path from 'node:path'

export interface PidRecord {
  name: string
  pid: number
  image: string
  startedAt: number
}

export interface ProcInfo {
  pid: number
  image: string
  createdAt: number
}

export interface PidStore {
  write(rec: PidRecord): void
  remove(name: string): void
  readAll(): PidRecord[]
}

// Spawn-to-creation skew is milliseconds; the slack covers clock steps without letting a recycled pid match.
export const CREATION_TOLERANCE_MS = 10_000

/** The image name Windows reports for a command; a bare `node` resolved from PATH runs as node.exe. */
export function imageOf(command: string): string {
  const base = path.basename(command).toLowerCase()
  return path.extname(base) ? base : `${base}.exe`
}

export function fileStore(dir: string): PidStore {
  const file = (name: string) => path.join(dir, `${name}.pid`)
  return {
    write(rec) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file(rec.name), JSON.stringify(rec))
    },
    remove(name) {
      fs.rmSync(file(name), { force: true })
    },
    readAll() {
      if (!fs.existsSync(dir)) return []
      const out: PidRecord[] = []
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith('.pid')) continue
        try {
          const rec = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as PidRecord
          if (Number.isInteger(rec.pid) && rec.pid > 0 && typeof rec.image === 'string') out.push(rec)
        } catch {
          fs.rmSync(path.join(dir, entry), { force: true })
        }
      }
      return out
    },
  }
}

/** A record is a live stale child only if its pid still runs the same image, created when we spawned it. */
export function planStaleKills(records: PidRecord[], procs: ProcInfo[], tolerance = CREATION_TOLERANCE_MS): PidRecord[] {
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  return records.filter((r) => {
    const p = byPid.get(r.pid)
    return p !== undefined && p.image.toLowerCase() === r.image.toLowerCase() && Math.abs(p.createdAt - r.startedAt) <= tolerance
  })
}

export function parseProcList(stdout: string): ProcInfo[] {
  const out: ProcInfo[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const [pid, image, created] = line.trim().split('|')
    if (!pid || !image || !created) continue
    const info = { pid: Number(pid), image, createdAt: Number(created) }
    if (Number.isInteger(info.pid) && Number.isFinite(info.createdAt)) out.push(info)
  }
  return out
}

export interface StaleDeps {
  store: PidStore
  list: (pids: number[]) => Promise<ProcInfo[]>
  killTree: (pid: number) => void
  log: (msg: string) => void
}

export async function killStale(deps: StaleDeps): Promise<PidRecord[]> {
  const records = deps.store.readAll()
  if (records.length === 0) return []
  let procs: ProcInfo[] = []
  try {
    procs = await deps.list(records.map((r) => r.pid))
  } catch (e) {
    deps.log(`stale check: could not list processes: ${String(e)}`)
  }
  const doomed = planStaleKills(records, procs)
  for (const r of doomed) {
    deps.log(`stale check: killing ${r.name} left from a previous run (pid ${r.pid})`)
    deps.killTree(r.pid)
  }
  for (const r of records) deps.store.remove(r.name)
  return doomed
}
