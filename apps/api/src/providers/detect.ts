import { listLocalProviderModels } from './models.js';
import type { LocalProvider } from './repository.js';


export interface LocalRuntime {
  provider: LocalProvider;
  baseUrl: string;
}

export interface DetectedRuntime extends LocalRuntime {
  models: string[];
}

export type DetectLocal = () => Promise<DetectedRuntime[]>;

export const DEFAULT_RUNTIMES: LocalRuntime[] = [{ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }];

export interface DetectorOptions {
  runtimes?: LocalRuntime[];
  ttlMs?: number;
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
