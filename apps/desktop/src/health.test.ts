import { describe, expect, it, vi } from 'vitest'
import { waitHealthy, type ExitInfo } from './health'

function poll(statuses: (number | null)[], opts: { exitAfter?: number; exit?: ExitInfo; attempts?: number } = {}) {
  let probes = 0
  const sleep = vi.fn(async () => {})
  const probe = vi.fn(async () => statuses[Math.min(probes++, statuses.length - 1)] ?? null)
  const exited = () => (opts.exitAfter !== undefined && probes >= opts.exitAfter ? (opts.exit ?? { code: 1 }) : null)
  return {
    sleep,
    probe,
    run: () =>
      waitHealthy({ url: 'http://127.0.0.1:1/health', isUp: (s) => s === 200, attempts: opts.attempts ?? 60, intervalMs: 500, probe, sleep, exited }),
  }
}

describe('waitHealthy', () => {
  it('is healthy on the first up answer', async () => {
    const p = poll([null, null, 503, 200])
    expect(await p.run()).toEqual({ kind: 'healthy', attempts: 4 })
    expect(p.sleep).toHaveBeenCalledTimes(3)
    expect(p.sleep).toHaveBeenCalledWith(500)
  })

  it('times out after the attempt budget without a trailing sleep', async () => {
    const p = poll([null], { attempts: 5 })
    expect(await p.run()).toEqual({ kind: 'timeout', attempts: 5 })
    expect(p.probe).toHaveBeenCalledTimes(5)
    expect(p.sleep).toHaveBeenCalledTimes(4)
  })

  it('stops at once when the child exits, instead of polling a dead port', async () => {
    const p = poll([null], { exitAfter: 2, exit: { code: 3 } })
    expect(await p.run()).toEqual({ kind: 'exited', attempts: 2, exit: { code: 3 } })
    expect(p.probe).toHaveBeenCalledTimes(2)
  })

  it('reports a spawn error before the first probe', async () => {
    const p = poll([200], { exitAfter: 0, exit: { code: null, error: 'spawn ENOENT' } })
    expect(await p.run()).toEqual({ kind: 'exited', attempts: 0, exit: { code: null, error: 'spawn ENOENT' } })
    expect(p.probe).not.toHaveBeenCalled()
  })
})
