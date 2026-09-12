import { createRequire } from 'node:module';
import { checkHealth as checkPostgres } from '../db/pool.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';

const require = createRequire(import.meta.url);
/** Read once at import time — the manifest does not change while the process runs. */
export const API_VERSION: string = (require('../../package.json') as { version: string }).version;

export interface ServiceCheckDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool;
  /** Present only when the instance runs Lightpanda as a distinct render tier. */
  lightpandaEnabled?: boolean;
  /** Present only when the instance offers the Camoufox tier. */
  camoufoxEnabled?: boolean;
  /** True when the render tier connects to a remote browser instead of launching one. */
  remoteCdpConfigured?: boolean;
}

export interface ServiceStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  detail?: string;
  latencyMs: number;
}

/** Overall bound on one round of checks, so a hung dependency cannot hang `/health` itself. */
const CHECKS_TIMEOUT_MS = 5_000;

/**
 * The checks `/health` and the uptime sampler both run — timed individually
 * so a slow dependency shows up as a latency spike, not just an eventual
 * timeout. Shared here so the two never drift.
 */
export async function runServiceChecks(deps: ServiceCheckDeps): Promise<Record<string, ServiceStatus>> {
  const services: Record<string, ServiceStatus> = {};

  const withTimeout = (check: Promise<ServiceStatus>): Promise<ServiceStatus> => {
    const started = Date.now();
    return Promise.race([
      check,
      new Promise<ServiceStatus>((resolve) => {
        setTimeout(
          () => resolve({ status: 'unhealthy', detail: 'timeout', latencyMs: Date.now() - started }),
          CHECKS_TIMEOUT_MS,
        ).unref?.();
      }),
    ]);
  };

  const timed = async (fn: () => Promise<{ ok: boolean; detail?: string }>): Promise<ServiceStatus> => {
    const started = Date.now();
    const result = await fn();
    return {
      status: result.ok ? 'ok' : 'unhealthy',
      ...(result.detail ? { detail: result.detail } : {}),
      latencyMs: Date.now() - started,
    };
  };

  const [postgres, fetchStatus, extractStatus] = await Promise.all([
    withTimeout(
      (async () => {
        const result = await checkPostgres();
        return {
          status: result.status,
          ...(result.detail ? { detail: result.detail } : {}),
          latencyMs: result.latencyMs ?? 0,
        } satisfies ServiceStatus;
      })(),
    ),
    withTimeout(timed(async () => ({ ok: await deps.fetchClient.health() }))),
    withTimeout(timed(async () => ({ ok: await deps.extractClient.health() }))),
  ]);

  services['postgres'] = postgres;
  services['fetch'] = fetchStatus.status === 'unhealthy' ? { ...fetchStatus, detail: fetchStatus.detail ?? 'unreachable' } : fetchStatus;
  services['extract'] = extractStatus.status === 'unhealthy' ? { ...extractStatus, detail: extractStatus.detail ?? 'unreachable' } : extractStatus;

  if (deps.browserPool) {
    const started = Date.now();
    const stats = deps.browserPool.stats();
    // Engines are listed as launched rather than as available: a non-default
    // engine is launched on its first request, so an empty list before any
    // traffic is the pool being warm for its default, not a missing browser.
    const engines = stats.engines.length > 0 ? stats.engines.join(', ') : deps.browserPool.defaultEngine;
    services['browser'] = {
      status: 'ok',
      detail: `${stats.browsers} browsers, ${stats.activeContexts} active contexts, ${stats.pagesServed} pages served (engine: ${engines})`,
      latencyMs: Date.now() - started,
    };
  }

  // `stats()` does not distinguish the Lightpanda tier from Chromium — it is a
  // separate CDP endpoint the pool connects to per-render, not a pooled
  // resource with its own counters. The only signal available here is whether
  // the instance has it enabled, so that is what a `lightpanda` entry reports.
  if (deps.lightpandaEnabled) {
    services['lightpanda'] = { status: 'ok', detail: 'enabled', latencyMs: 0 };
  }

  // Same caveat as lightpanda: both are endpoints connected to per-render, so
  // "enabled" is the only fact available without spending a connection here.
  if (deps.camoufoxEnabled) {
    services['camoufox'] = { status: 'ok', detail: 'enabled', latencyMs: 0 };
  }

  if (deps.remoteCdpConfigured) {
    services['remoteBrowser'] = {
      status: 'ok',
      detail: 'the render tier connects to a remote browser',
      latencyMs: 0,
    };
  }

  return services;
}
