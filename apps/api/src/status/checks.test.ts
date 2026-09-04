import { describe, expect, it, vi } from 'vitest';
import { runServiceChecks } from './checks.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';

/**
 * The optional render backends are endpoints connected to per-render rather
 * than pooled resources, so "configured" is the only fact available without
 * spending a connection inside a health check. These tests hold that an entry
 * appears only when the operator turned the thing on — a health page listing a
 * tier nobody enabled is worse than one line shorter.
 */

vi.mock('../db/pool.js', () => ({
  checkHealth: vi.fn(async () => ({ status: 'ok' as const, latencyMs: 1 })),
}));

const fetchClient = { health: vi.fn(async () => true) } as unknown as FetchClient;
const extractClient = { health: vi.fn(async () => true) } as unknown as ExtractClient;

function browserPool(engines: ('chromium' | 'firefox' | 'webkit')[]): BrowserPool {
  return {
    stats: () => ({ browsers: engines.length, activeContexts: 0, pagesServed: 3, engines }),
    defaultEngine: 'chromium',
  } as unknown as BrowserPool;
}

describe('service checks', () => {
  it('always reports the core dependencies', async () => {
    const services = await runServiceChecks({ fetchClient, extractClient });
    expect(Object.keys(services)).toEqual(expect.arrayContaining(['postgres', 'fetch', 'extract']));
  });

  it('names the engines the pool has actually launched', async () => {
    const services = await runServiceChecks({
      fetchClient,
      extractClient,
      browserPool: browserPool(['chromium', 'firefox']),
    });
    expect(services['browser']?.detail).toContain('chromium, firefox');
  });

  it('falls back to the default engine before any browser is launched', async () => {
    const services = await runServiceChecks({
      fetchClient,
      extractClient,
      browserPool: browserPool([]),
    });
    // Empty is the pool being cold, not a missing browser.
    expect(services['browser']?.detail).toContain('engine: chromium');
  });

  it('omits the optional backends when they are off', async () => {
    const services = await runServiceChecks({ fetchClient, extractClient });
    expect(services['camoufox']).toBeUndefined();
    expect(services['remoteBrowser']).toBeUndefined();
    expect(services['lightpanda']).toBeUndefined();
  });

  it('reports camoufox and the remote browser once enabled', async () => {
    const services = await runServiceChecks({
      fetchClient,
      extractClient,
      camoufoxEnabled: true,
      remoteCdpConfigured: true,
    });
    expect(services['camoufox']).toMatchObject({ status: 'ok', detail: 'enabled' });
    expect(services['remoteBrowser']?.status).toBe('ok');
  });

  it('never puts the remote endpoint itself in the response', async () => {
    // The URL routinely carries a token, and a health endpoint is often the
    // least-guarded route in a deployment.
    const services = await runServiceChecks({
      fetchClient,
      extractClient,
      remoteCdpConfigured: true,
    });
    expect(JSON.stringify(services)).not.toMatch(/token|:\/\//);
  });

  it('keeps every entry in the shape the status page reads', async () => {
    const services = await runServiceChecks({
      fetchClient,
      extractClient,
      browserPool: browserPool(['chromium']),
      lightpandaEnabled: true,
      camoufoxEnabled: true,
      remoteCdpConfigured: true,
    });
    for (const [name, status] of Object.entries(services)) {
      expect(['ok', 'degraded', 'unhealthy'], name).toContain(status.status);
      expect(typeof status.latencyMs, name).toBe('number');
    }
  });
});
