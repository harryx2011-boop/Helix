import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { StatusSampler } from './sampler.js';
import type { ServiceCheckDeps } from './checks.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';

/**
 * The sampler ticks once a minute. Without a re-entrancy guard, a tick whose
 * dependency check hangs never returns the pool connection, and every
 * subsequent interval stacks another check on top of it until the pool is
 * exhausted.
 */

vi.mock('../db/pool.js', () => ({
  checkHealth: vi.fn(async () => ({ status: 'ok' as const, latencyMs: 1 })),
}));

function fakePool(): Pool {
  return { connect: vi.fn() } as unknown as Pool;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('StatusSampler', () => {
  it('skips a tick while the previous one is still running', async () => {
    vi.useFakeTimers();
    let checksStarted = 0;
    let resolveCheck: (() => void) | undefined;
    const fetchClient = {
      health: vi.fn(() => {
        checksStarted += 1;
        return new Promise<boolean>((resolve) => {
          resolveCheck = () => resolve(true);
        });
      }),
    } as unknown as FetchClient;
    const extractClient = { health: vi.fn(async () => true) } as unknown as ExtractClient;

    const deps: ServiceCheckDeps = { fetchClient, extractClient };
    // A short interval keeps three ticks well inside the checks' own overall
    // time bound, so the first tick is still genuinely in flight when the
    // next two are due -- the guard under test is `#ticking`, not the checks
    // timeout completing the hung check for us.
    const sampler = new StatusSampler({ pool: fakePool(), intervalMs: 500, ...deps });

    sampler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(checksStarted).toBe(1);

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(checksStarted).toBe(1);

    resolveCheck?.();
    sampler.stop();
  });
});
