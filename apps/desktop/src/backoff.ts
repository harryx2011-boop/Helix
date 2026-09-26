export const RESTART_DELAYS_MS = [1000, 3000, 9000]
export const RESTART_WINDOW_MS = 5 * 60_000

/** The delay before the next restart, or null once every try in the window is spent. */
export function nextRestartDelay(history: number[], now: number, delays = RESTART_DELAYS_MS, windowMs = RESTART_WINDOW_MS): number | null {
  const recent = history.filter((t) => now - t < windowMs).length
  return recent < delays.length ? delays[recent]! : null
}
