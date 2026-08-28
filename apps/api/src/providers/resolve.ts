import type { ProviderKeyMap, ProviderModelMap, ProviderBaseUrlMap } from '../extract/client.js';
import { resolveProviderKeys as loadProviderKeys, type ResolvedProviderKeys } from './repository.js';

/**
 * Converts stored provider keys into the shape `ExtractClient` sends on.
 *
 * Route handlers call `resolveProviderKeys` once per request (empty when the
 * caller has stored none) and pass the three maps to `structured`/`schema`
 * unchanged; the extract client omits them entirely when none carries
 * anything, so a caller with no stored keys sees identical behaviour to today.
 */
export { loadProviderKeys as resolveProviderKeys };

export interface ClientKeys {
  providerKeys: ProviderKeyMap | undefined;
  providerModels: ProviderModelMap | undefined;
  providerBaseUrls: ProviderBaseUrlMap | undefined;
}

export function toClientKeys(resolved: ResolvedProviderKeys): ClientKeys {
  if (Object.keys(resolved).length === 0) {
    return { providerKeys: undefined, providerModels: undefined, providerBaseUrls: undefined };
  }

  const providerKeys: ProviderKeyMap = {};
  const providerModels: ProviderModelMap = {};
  const providerBaseUrls: ProviderBaseUrlMap = {};

  for (const [provider, entry] of Object.entries(resolved) as [
    keyof ResolvedProviderKeys,
    { key?: string | null; model?: string | null; baseUrl?: string | null },
  ][]) {
    if (!entry) continue;
    if (entry.key) providerKeys[provider] = entry.key;
    if (entry.model) providerModels[provider] = entry.model;
    if (entry.baseUrl) providerBaseUrls[provider] = entry.baseUrl;
  }

  return { providerKeys, providerModels, providerBaseUrls };
}
