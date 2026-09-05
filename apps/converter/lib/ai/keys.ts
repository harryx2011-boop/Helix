'use client';

// The key never leaves this tab except in a request to the provider's own
// API host — no Helix server ever sees it. localStorage over an in-memory
// value trades a real risk (readable by any script that achieves XSS on this
// origin) for one fewer re-entry per session; SettingsView states that
// tradeoff next to the input rather than deciding it silently.
import type { AiProvider } from './models';

function storageKey(provider: AiProvider): string {
  return `converter:ai-key:${provider}`;
}

export function getProviderKey(provider: AiProvider): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(storageKey(provider));
}

export function setProviderKey(provider: AiProvider, key: string): void {
  window.localStorage.setItem(storageKey(provider), key);
}

export function clearProviderKey(provider: AiProvider): void {
  window.localStorage.removeItem(storageKey(provider));
}

export function hasAnyProviderKey(providers: AiProvider[]): boolean {
  if (typeof window === 'undefined') return false;
  return providers.some((p) => !!window.localStorage.getItem(storageKey(p)));
}
