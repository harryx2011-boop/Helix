import type { BrowserPool } from '../browser/pool.js';
import type { SessionRegistry } from '../browser/sessions.js';


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
