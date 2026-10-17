/**
 * Which Helix API the extension talks to.
 *
 * The desktop app runs its API on 7410, the dev stack on 7400 (Harry's call,
 * 2026-10-17: desktop first, dev as the fallback). A `helix.port` setting
 * pins one port instead.
 */

export const DESKTOP_PORT = 7410;
export const DEV_PORT = 7400;

/** How long one health probe may take before the port counts as down. */
const PROBE_TIMEOUT_MS = 2_000;

export interface ApiTarget {
  port: number;
  /** `http://127.0.0.1:<port>`: what the panel frames and the monitors view calls. */
  origin: string;
  /** As `/v1/health` reported it: `ok`, `degraded` or `unhealthy`. */
  status: string;
  version: string;
}

/** The slice of `fetch` this module uses, so tests can answer without a network. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ status: number; json(): Promise<unknown> }>;

/**
 * The ports to try. A pinned value comes from settings, so anything that is
 * not a whole number in the port range is ignored rather than spliced into
 * a URL, a CSP and an iframe `src`.
 */
export function candidatePorts(pinned: unknown): number[] {
  const valid = typeof pinned === 'number' && Number.isInteger(pinned) && pinned > 0 && pinned < 65_536;
  return valid ? [pinned] : [DESKTOP_PORT, DEV_PORT];
}

export function originFor(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** The first port whose `/v1/health` answers as Helix, or null. */
export async function findApi(ports: number[], fetchLike: FetchLike): Promise<ApiTarget | null> {
  for (const port of ports) {
    const target = await probe(port, fetchLike);
    if (target) return target;
  }
  return null;
}

async function probe(port: number, fetchLike: FetchLike): Promise<ApiTarget | null> {
  const origin = originFor(port);
  try {
    const response = await fetchLike(`${origin}/v1/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    // 503 is Helix answering that a dependency is down: still the API to use.
    if (response.status !== 200 && response.status !== 503) return null;

    const body = (await response.json()) as { status?: unknown; version?: unknown };
    if (typeof body.status !== 'string' || typeof body.version !== 'string') return null;
    return { port, origin, status: body.status, version: body.version };
  } catch {
    return null;
  }
}
