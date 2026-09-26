import { listLocalProviderModels } from './models.js';
import type { LocalProvider } from './repository.js';

/**
 * Finds a local model runtime answering on its install-default address, so the
 * operator can be offered it instead of typing a base URL they may not know.
 *
 * Detection only offers. Nothing is stored and no request is routed to a
 * detected runtime until the operator saves it through `PUT /providers`: a
 * model call the operator never chose is a surprise, even on their own machine.
 *
 * The probe targets a fixed loopback address the instance picks itself, never
 * a caller's URL, so it sits with the service health checks rather than behind
 * the URL guard that protects fetches made on a caller's behalf.
 */

export interface LocalRuntime {
  provider: LocalProvider;
  /** The base URL to offer for storing, in the form `PUT /providers` takes. */
  baseUrl: string;
}

export interface DetectedRuntime extends LocalRuntime {
  models: string[];
}

export type DetectLocal = () => Promise<DetectedRuntime[]>;

export const DEFAULT_RUNTIMES: LocalRuntime[] = [{ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }];

export interface DetectorOptions {
  runtimes?: LocalRuntime[];
  /** Health and the providers panel both ask; one probe answers both for this long. */
  ttlMs?: number;
  /** An absent runtime is the common case and must not slow `/health` down. */
  timeoutMs?: number;
  now?: () => number;
}

export function createLocalDetector(options: DetectorOptions = {}): DetectLocal {
  const runtimes = options.runtimes ?? DEFAULT_RUNTIMES;
  const ttlMs = options.ttlMs ?? 10_000;
  const timeoutMs = options.timeoutMs ?? 1_000;
  const now = options.now ?? Date.now;
  let cached: { at: number; value: Promise<DetectedRuntime[]> } | undefined;

  return () => {
    if (cached && now() - cached.at < ttlMs) return cached.value;
    const value = Promise.all(
      runtimes.map(async (runtime): Promise<DetectedRuntime | undefined> => {
        const result = await listLocalProviderModels(runtime.provider, runtime.baseUrl, timeoutMs);
        return result.ok ? { ...runtime, models: result.models.map((m) => m.name) } : undefined;
      }),
    ).then((found) => found.filter((r): r is DetectedRuntime => r !== undefined));
    cached = { at: now(), value };
    return value;
  };
}
