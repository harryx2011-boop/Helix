import { EventEmitter } from 'node:events'
import path from 'node:path'
import { nextRestartDelay } from './backoff'
import type { ChildSpec, Env } from './children/types'
import { HEALTH_ATTEMPTS, HEALTH_INTERVAL_MS, waitHealthy, type ExitInfo, type HealthResult } from './health'
import { imageOf, type PidStore } from './pidfile'

export interface ChildHandle {
  pid?: number | undefined
  once(event: 'exit', cb: (code: number | null) => void): unknown
  once(event: 'error', cb: (err: Error) => void): unknown
  send?: ((msg: { type: string }) => boolean) | undefined
  connected?: boolean | undefined
}

export interface SupervisorDeps {
  spawn: (spec: ChildSpec, env: Env, logFile: string) => ChildHandle
  probe: (url: string) => Promise<number | null>
  sleep: (ms: number) => Promise<void>
  now: () => number
  exists: (p: string) => boolean
  isPortFree: (port: number) => Promise<boolean>
  killTree: (pid: number) => void
  pids: PidStore
  log: (msg: string) => void
  baseEnv: Env
  logsDir: string
  healthAttempts?: number
  healthIntervalMs?: number
  stopGraceMs?: number
}

export type FailureReason = 'missing' | 'port-in-use' | 'exited' | 'timeout' | 'crashed'

export interface Failure {
  name: string
  title: string
  reason: FailureReason
  detail: string
  logFile: string
}

export type ChildState = 'idle' | 'starting' | 'healthy' | 'restarting' | 'failed' | 'stopped'

interface Running {
  spec: ChildSpec
  state: ChildState
  handle?: ChildHandle | undefined
  exit?: ExitInfo | null
  restarts: number[]
}

export function describeFailure(spec: ChildSpec, reason: FailureReason, extra: { exit?: ExitInfo; seconds?: number }): string {
  switch (reason) {
    case 'missing':
      return `Not found: ${spec.command}`
    case 'port-in-use':
      return `Port ${spec.port} is already in use by another program.`
    case 'timeout':
      return `No answer from ${spec.healthUrl} after ${extra.seconds ?? 0} s.`
    case 'exited':
      return extra.exit?.error
        ? `Could not start: ${extra.exit.error}`
        : `Stopped with exit code ${extra.exit?.code ?? 'unknown'} before it was ready.`
    case 'crashed':
      return `Stopped with exit code ${extra.exit?.code ?? 'unknown'} and could not be restarted.`
  }
}

export class Supervisor extends EventEmitter {
  private readonly children: Running[]
  private stopping = false

  constructor(specs: ChildSpec[], private readonly deps: SupervisorDeps) {
    super()
    this.children = specs.map((spec) => ({ spec, state: 'idle', restarts: [] }))
  }

  logFile(name: string): string {
    return path.join(this.deps.logsDir, `${name}.log`)
  }

  states(): Record<string, ChildState> {
    return Object.fromEntries(this.children.map((c) => [c.spec.name, c.state]))
  }

  /** The label of the first child, in registry order, that is not yet healthy. */
  currentLabel(): string | null {
    return this.children.find((c) => c.state === 'starting' || c.state === 'restarting')?.spec.label ?? null
  }

  /** Brings up every child that is not already healthy, so a second call retries only the failures. */
  async startAll(): Promise<{ ok: true } | { ok: false; failures: Failure[] }> {
    this.stopping = false
    const pending = this.children.filter((c) => c.state !== 'healthy')
    const results = await Promise.all(
      pending.map(async (c) => {
        const failure = await this.bringUp(c)
        this.emit('status', this.currentLabel())
        return failure
      }),
    )
    const failures = results.filter((f): f is Failure => f !== null)
    return failures.length ? { ok: false, failures } : { ok: true }
  }

  private async bringUp(c: Running): Promise<Failure | null> {
    const { spec } = c
    c.state = 'starting'
    c.exit = null
    this.emit('status', this.currentLabel())

    if (path.isAbsolute(spec.command) && !this.deps.exists(spec.command)) return this.fail(c, 'missing', {})
    if (!(await this.deps.isPortFree(spec.port))) return this.fail(c, 'port-in-use', {})

    const handle = this.launch(c)
    const attempts = this.deps.healthAttempts ?? HEALTH_ATTEMPTS
    const intervalMs = this.deps.healthIntervalMs ?? HEALTH_INTERVAL_MS
    const result: HealthResult = await waitHealthy({
      url: spec.healthUrl,
      isUp: spec.isUp,
      attempts,
      intervalMs,
      probe: this.deps.probe,
      sleep: this.deps.sleep,
      exited: () => (c.handle === handle ? (c.exit ?? null) : { code: null }),
    })

    if (result.kind === 'healthy') {
      c.state = 'healthy'
      this.deps.log(`${spec.name}: healthy after ${result.attempts} probe(s)`)
      return null
    }
    if (result.kind === 'timeout') {
      this.terminate(c)
      return this.fail(c, 'timeout', { seconds: Math.round((attempts * intervalMs) / 1000) })
    }
    return this.fail(c, 'exited', { exit: result.exit })
  }

  private launch(c: Running): ChildHandle {
    const { spec } = c
    const env = { ...this.deps.baseEnv, ...spec.env }
    this.deps.log(`${spec.name}: spawn ${spec.command} ${spec.args.join(' ')}`)
    const handle = this.deps.spawn(spec, env, this.logFile(spec.name))
    c.handle = handle
    if (handle.pid) {
      this.deps.pids.write({ name: spec.name, pid: handle.pid, image: imageOf(spec.command), startedAt: this.deps.now() })
    }
    let ended = false
    const end = (exit: ExitInfo) => {
      if (ended || c.handle !== handle) return
      ended = true
      c.exit = exit
      this.onExit(c, handle)
    }
    handle.once('error', (err) => end({ code: null, error: err.message }))
    handle.once('exit', (code) => end({ code }))
    return handle
  }

  private onExit(c: Running, handle: ChildHandle): void {
    this.deps.pids.remove(c.spec.name)
    this.deps.log(`${c.spec.name}: exited (${c.exit?.error ?? `code ${c.exit?.code}`})`)
    if (this.stopping || c.state !== 'healthy' || c.handle !== handle) return
    void this.restart(c)
  }

  private async restart(c: Running): Promise<void> {
    const exit = c.exit ?? { code: null }
    for (;;) {
      const now = this.deps.now()
      const delay = nextRestartDelay(c.restarts, now)
      if (delay === null) {
        this.emit('failed', this.fail(c, 'crashed', { exit }))
        return
      }
      c.restarts.push(now)
      c.state = 'restarting'
      this.emit('restarting', c.spec.name, delay)
      this.deps.log(`${c.spec.name}: restart ${c.restarts.length} in ${delay} ms`)
      await this.deps.sleep(delay)
      if (this.stopping) return
      if (!(await this.bringUp(c))) {
        this.emit('recovered', c.spec.name)
        return
      }
    }
  }

  private fail(c: Running, reason: FailureReason, extra: { exit?: ExitInfo; seconds?: number }): Failure {
    c.state = 'failed'
    const failure: Failure = {
      name: c.spec.name,
      title: c.spec.title,
      reason,
      detail: describeFailure(c.spec, reason, extra),
      logFile: this.logFile(c.spec.name),
    }
    this.deps.log(`${c.spec.name}: failed (${reason}) ${failure.detail}`)
    return failure
  }

  private terminate(c: Running): void {
    const pid = c.handle?.pid
    c.handle = undefined
    if (pid) this.deps.killTree(pid)
    this.deps.pids.remove(c.spec.name)
  }

  async stopAll(): Promise<void> {
    this.stopping = true
    const live = this.children.filter((c) => c.handle && !c.exit)
    for (const c of live) {
      if (c.spec.ipc && c.handle?.connected && c.handle.send) {
        try {
          c.handle.send({ type: 'shutdown' })
        } catch {}
      }
    }
    // Above the API's own 8 s shutdown ceiling, so PGlite closes before anything is killed.
    const grace = this.deps.stopGraceMs ?? 10000
    const graceful = live.filter((c) => c.spec.ipc)
    const deadline = this.deps.now() + grace
    while (graceful.some((c) => !c.exit) && this.deps.now() < deadline) await this.deps.sleep(100)
    for (const c of this.children) {
      if (c.handle && !c.exit) this.terminate(c)
      else this.deps.pids.remove(c.spec.name)
      c.state = 'stopped'
    }
  }
}
