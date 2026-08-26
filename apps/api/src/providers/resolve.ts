import type { ProviderKeyMap, ProviderModelMap } from '../extract/client.js';
import { resolveProviderKeys as loadProviderKeys, type ResolvedProviderKeys } from './repository.js';

/**
 * Converts stored provider keys into the shape `ExtractClient` sends on.
 *
 * Route handlers call `resolveProviderKeys` once per request (empty when the
 * caller has stored none) and pass the two maps to `structured`/`schema`
 * unchanged; the extract client omits them entirely when neither carries
 * anything, so a caller with no stored keys sees identical behaviour to today.
 */
export { loadProviderKeys as resolveProviderKeys };

export interface ClientKeys {
  providerKeys: ProviderKeyMap | undefined;
  providerModels: ProviderModelMap | undefined;
}

export function toClientKeys(resolved: ResolvedProviderKeys): ClientKeys {
  if (Object.keys(resolved).length === 0) {
    return { providerKeys: undefined, providerModels: undefined };
  }

  const providerKeys: ProviderKeyMap = {};
  const providerModels: ProviderModelMap = {};

  for (const [provider, entry] of Object.entries(resolved) as [keyof ResolvedProviderKeys, { key: string; model?: string | null }][]) {
    if (!entry) continue;
    providerKeys[provider] = entry.key;
    if (entry.model) providerModels[provider] = entry.model;
  }

  return { providerKeys, providerModels };
}
