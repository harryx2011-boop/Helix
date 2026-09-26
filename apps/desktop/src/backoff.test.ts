import { describe, expect, it } from 'vitest'
import { nextRestartDelay, RESTART_WINDOW_MS } from './backoff'

describe('nextRestartDelay', () => {
  const now = 10_000_000

  it('backs off 1 s, 3 s, 9 s, then gives up', () => {
    const history: number[] = []
    const delays: (number | null)[] = []
    for (let i = 0; i < 4; i++) {
      const d = nextRestartDelay(history, now)
      delays.push(d)
      history.push(now)
    }
    expect(delays).toEqual([1000, 3000, 9000, null])
  })

  it('forgets restarts older than the window', () => {
    const old = now - RESTART_WINDOW_MS - 1
    expect(nextRestartDelay([old, old, old], now)).toBe(1000)
    expect(nextRestartDelay([old, now - 1000, now - 500], now)).toBe(9000)
  })
})
