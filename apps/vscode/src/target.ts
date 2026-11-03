
export const DESKTOP_PORT = 7410;
export const DEV_PORT = 7400;

const PROBE_TIMEOUT_MS = 2_000;

export interface ApiTarget {
  port: number;
  origin: string;
  status: string;
  version: string;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ status: number; json(): Promise<unknown> }>;

export function candidatePorts(pinned: unknown): number[] {
  const valid = typeof pinned === 'number' && Number.isInteger(pinned) && pinned > 0 && pinned < 65_536;
  return valid ? [pinned] : [DESKTOP_PORT, DEV_PORT];
}

export function originFor(port: number): string {
  return `http://127.0.0.1:${port}`;
}

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
    if (response.status !== 200 && response.status !== 503) return null;

    const body = (await response.json()) as { status?: unknown; version?: unknown };
    if (typeof body.status !== 'string' || typeof body.version !== 'string') return null;
    return { port, origin, status: body.status, version: body.version };
  } catch {
    return null;
  }
}
