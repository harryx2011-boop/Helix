import type { BrowserPool } from '../browser/pool.js';
import type { SessionRegistry } from '../browser/sessions.js';

/**
 * Routes a live setting to the object that owns it.
 *
 * Only the settings marked `live` in the registry appear here. Anything else is
 * persisted and waits for a restart; pretending otherwise is the failure this
 * whole module exists to avoid.
 */

export interface LiveTargets {
  browserPool: BrowserPool;
  sessions: SessionRegistry;
}

export function applyLive(key: string, value: unknown, targets: LiveTargets): boolean {
  switch (key) {
    case 'browserMaxContexts':
      targets.browserPool.setLimits({ maxContexts: value as number });
      return true;
    case 'browserRecycleAfter':
      targets.browserPool.setLimits({ recycleAfter: value as number });
      return true;
    case 'interactMaxSessions':
      targets.sessions.setLimits({ maxSessions: value as number });
      return true;
    case 'interactIdleTimeoutSeconds':
      targets.sessions.setLimits({ idleTimeoutMs: (value as number) * 1_000 });
      return true;
    case 'interactHardTimeoutSeconds':
      targets.sessions.setLimits({ hardTimeoutMs: (value as number) * 1_000 });
      return true;
    default:
      return false;
  }
}
