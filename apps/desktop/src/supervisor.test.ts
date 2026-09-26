import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { ChildSpec } from './children/types'
import type { PidRecord, PidStore } from './pidfile'
import { Supervisor, type ChildHandle, type Failure, type SupervisorDeps } from './supervisor'

class FakeChild extends EventEmitter implements ChildHandle {
  connected = true
  sent: unknown[] = []
  constructor(public pid: number) {
    super()
  }
  send = (m: { type: string }) => {
    this.sent.push(m)
    return true
  }
  die(code: number | null = 1) {
    this.connected = false
    this.emit('exit', code)
  }
}

const spec = (name: string, port: number, over: Partial<ChildSpec> = {}): ChildSpec => ({
  name,
  title: name.toUpperCase(),
  label: `Starting ${name}`,
  command: `C:/bin/${name}.exe`,
  args: [],
  env: { OWN: name },
  cwd: 'C:/bin',
  port,
  healthUrl: `http://127.0.0.1:${port}/health`,
  isUp: (s) => s === 200,
  ...over,
})

function harness(specs: ChildSpec[], opts: { up?: (url: string, n: number) => boolean; portFree?: boolean; exists?: boolean } = {}) {
  let clock = 1_000_000
  let nextPid = 100
  const spawned: { spec: ChildSpec; env: Record<string, string>; child: FakeChild }[] = []
  const probes = new Map<string, number>()
  const pidData = new Map<string, PidRecord>()
  const pids: PidStore = { write: (r) => void pidData.set(r.name, r), remove: (n) => void pidData.delete(n), readAll: () => [...pidData.values()] }
  const killTree = vi.fn((pid: number) => {
    const s = spawned.find((x) => x.child.pid === pid)
    s?.child.die(null)
  })
  const sleeps: number[] = []
  const deps: SupervisorDeps = {
    spawn: (s, env) => {
      const child = new FakeChild(nextPid++)
      spawned.push({ spec: s, env, child })
      return child
    },
    probe: async (url) => {
      const n = (probes.get(url) ?? 0) + 1
      probes.set(url, n)
      return (opts.up ?? (() => true))(url, n) ? 200 : null
    },
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
    now: () => clock,
    exists: () => opts.exists ?? true,
    isPortFree: async () => opts.portFree ?? true,
    killTree,
    pids,
    log: () => {},
    baseEnv: { PATH: 'C:/Windows', OWN: 'base' },
    logsDir: 'C:/logs',
    healthAttempts: 4,
    healthIntervalMs: 500,
    stopGraceMs: 1000,
  }
  const sup = new Supervisor(specs, deps)
  return { sup, spawned, pidData, killTree, sleeps, probes }
}

const flush = () => new Promise((r) => setImmediate(r))

describe('Supervisor boot', () => {
  it('starts every child with base env under its own, records pids, and reports statuses in order', async () => {
    const h = harness([spec('api', 7410), spec('fetch', 7411)])
    const labels: (string | null)[] = []
    h.sup.on('status', (l) => labels.push(l))
    expect(await h.sup.startAll()).toEqual({ ok: true })
    expect(h.spawned.map((s) => s.env)).toEqual([
      { PATH: 'C:/Windows', OWN: 'api' },
      { PATH: 'C:/Windows', OWN: 'fetch' },
    ])
    expect([...h.pidData.values()].map((r) => [r.name, r.pid, r.image])).toEqual([
      ['api', 100, 'api.exe'],
      ['fetch', 101, 'fetch.exe'],
    ])
    expect(labels[0]).toBe('Starting api')
    expect(labels.at(-1)).toBeNull()
    expect(h.sup.states()).toEqual({ api: 'healthy', fetch: 'healthy' })
  })

  it('fails honestly when the executable is missing, without spawning', async () => {
    const h = harness([spec('extract', 7412)], { exists: false })
    const r = await h.sup.startAll()
    expect(r.ok).toBe(false)
    const f = (r as { failures: Failure[] }).failures[0]!
    expect(f).toMatchObject({ name: 'extract', reason: 'missing', detail: 'Not found: C:/bin/extract.exe', logFile: expect.stringContaining('extract.log') })
    expect(h.spawned).toHaveLength(0)
  })

  it('refuses to start on a port another program holds', async () => {
    const h = harness([spec('api', 7410)], { portFree: false })
    const r = await h.sup.startAll()
    expect((r as { failures: Failure[] }).failures[0]).toMatchObject({ reason: 'port-in-use', detail: 'Port 7410 is already in use by another program.' })
    expect(h.spawned).toHaveLength(0)
  })

  it('reports a child that exits before it is healthy, with its exit code', async () => {
    const h: ReturnType<typeof harness> = harness([spec('api', 7410)], {
      up: (_u, n) => {
        if (n === 2) h.spawned[0]!.child.die(7)
        return false
      },
    })
    const r = await h.sup.startAll()
    expect(h.probes.get('http://127.0.0.1:7410/health')).toBe(2)
    expect((r as { failures: Failure[] }).failures[0]).toMatchObject({ reason: 'exited', detail: 'Stopped with exit code 7 before it was ready.' })
  })

  it('kills a child that never answers and reports the timeout', async () => {
    const h = harness([spec('extract', 7412)], { up: () => false })
    const r = await h.sup.startAll()
    expect((r as { failures: Failure[] }).failures[0]).toMatchObject({ reason: 'timeout', detail: 'No answer from http://127.0.0.1:7412/health after 2 s.' })
    expect(h.killTree).toHaveBeenCalledWith(100)
    expect(h.pidData.size).toBe(0)
  })

  it('retries only the failed children on a second startAll', async () => {
    let extractUp = false
    const h = harness([spec('api', 7410), spec('extract', 7412)], { up: (url) => !url.includes('7412') || extractUp })
    expect((await h.sup.startAll()).ok).toBe(false)
    extractUp = true
    expect(await h.sup.startAll()).toEqual({ ok: true })
    expect(h.spawned.map((s) => s.spec.name)).toEqual(['api', 'extract', 'extract'])
  })
})

describe('Supervisor crash recovery', () => {
  it('restarts a crashed child with 1 s, 3 s, 9 s backoff, then reports it failed', async () => {
    const h = harness([spec('fetch', 7411)])
    await h.sup.startAll()
    const failed: Failure[] = []
    const restarting: number[] = []
    h.sup.on('failed', (f) => failed.push(f))
    h.sup.on('restarting', (_n, d) => restarting.push(d))
    for (let i = 0; i < 4; i++) {
      h.spawned.at(-1)!.child.die(2)
      await flush()
      await flush()
    }
    expect(restarting).toEqual([1000, 3000, 9000])
    expect(h.spawned).toHaveLength(4)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ name: 'fetch', reason: 'crashed', detail: 'Stopped with exit code 2 and could not be restarted.' })
  })

  it('keeps retrying inside the budget when a restart itself fails its health check', async () => {
    const h = harness([spec('fetch', 7411)], { up: (_u, n) => n === 1 || n > 5 })
    await h.sup.startAll()
    const recovered = vi.fn()
    h.sup.on('recovered', recovered)
    h.spawned[0]!.child.die(1)
    for (let i = 0; i < 20 && !recovered.mock.calls.length; i++) await flush()
    expect(recovered).toHaveBeenCalledWith('fetch')
    expect(h.spawned).toHaveLength(3)
  })

  it('does not restart a child that exits during shutdown', async () => {
    const h = harness([spec('api', 7410, { ipc: true })])
    await h.sup.startAll()
    const restarting = vi.fn()
    h.sup.on('restarting', restarting)
    const child = h.spawned[0]!.child
    child.send = (m) => {
      child.sent.push(m)
      queueMicrotask(() => child.die(0))
      return true
    }
    await h.sup.stopAll()
    expect(child.sent).toEqual([{ type: 'shutdown' }])
    expect(restarting).not.toHaveBeenCalled()
    expect(h.killTree).not.toHaveBeenCalled()
  })
})

describe('Supervisor shutdown', () => {
  it('asks ipc children to stop, then kills whatever is left after the grace period and clears pid files', async () => {
    const h = harness([spec('api', 7410, { ipc: true }), spec('fetch', 7411)])
    await h.sup.startAll()
    await h.sup.stopAll()
    expect(h.spawned[0]!.child.sent).toEqual([{ type: 'shutdown' }])
    expect(h.spawned[1]!.child.sent).toEqual([])
    expect(h.killTree.mock.calls.map((c) => c[0]).sort()).toEqual([100, 101])
    expect(h.sleeps.filter((s) => s === 100).length).toBe(10)
    expect(h.pidData.size).toBe(0)
    expect(h.sup.states()).toEqual({ api: 'stopped', fetch: 'stopped' })
  })
})
