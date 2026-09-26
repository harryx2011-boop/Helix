export type ExitInfo = { code: number | null; error?: string }

export type HealthResult =
  | { kind: 'healthy'; attempts: number }
  | { kind: 'timeout'; attempts: number }
  | { kind: 'exited'; attempts: number; exit: ExitInfo }

export interface HealthPoll {
  url: string
  isUp: (status: number) => boolean
  attempts: number
  intervalMs: number
  probe: (url: string) => Promise<number | null>
  sleep: (ms: number) => Promise<void>
  exited: () => ExitInfo | null
}

export const HEALTH_ATTEMPTS = 60
export const HEALTH_INTERVAL_MS = 500

export async function waitHealthy(p: HealthPoll): Promise<HealthResult> {
  for (let attempt = 1; attempt <= p.attempts; attempt++) {
    const before = p.exited()
    if (before) return { kind: 'exited', attempts: attempt - 1, exit: before }
    const status = await p.probe(p.url)
    if (status !== null && p.isUp(status)) return { kind: 'healthy', attempts: attempt }
    const after = p.exited()
    if (after) return { kind: 'exited', attempts: attempt, exit: after }
    if (attempt < p.attempts) await p.sleep(p.intervalMs)
  }
  return { kind: 'timeout', attempts: p.attempts }
}

export async function probeHttp(url: string, timeoutMs = 2000): Promise<number | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    await res.body?.cancel()
    return res.status
  } catch {
    return null
  }
}
