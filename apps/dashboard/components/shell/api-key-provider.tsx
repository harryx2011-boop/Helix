'use client';

import * as React from 'react';
import { getApiKey, setApiKey as persistApiKey, clearApiKey as removeApiKey } from '@/lib/auth';

interface ApiKeyContextValue {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

const ApiKeyContext = React.createContext<ApiKeyContextValue | undefined>(undefined);

/**
 * Loads the key from localStorage after mount (SSR/export has no localStorage),
 * so every consumer sees `null` until hydration resolves it — the key gate
 * below reacts to that instead of racing it.
 */
export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setApiKeyState(getApiKey());
    setHydrated(true);
  }, []);

  const setApiKey = React.useCallback((key: string) => {
    persistApiKey(key);
    setApiKeyState(key);
  }, []);

  const clearApiKey = React.useCallback(() => {
    removeApiKey();
    setApiKeyState(null);
  }, []);

  const value = React.useMemo(() => ({ apiKey, setApiKey, clearApiKey }), [apiKey, setApiKey, clearApiKey]);

  if (!hydrated) return null;

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>;
}

/** Hosted mode mounts no provider (the proxy holds the key); callers that run in both modes read null there. */
export function useOptionalApiKey(): ApiKeyContextValue | null {
  return React.useContext(ApiKeyContext) ?? null;
}

export function useApiKey(): ApiKeyContextValue {
  const ctx = React.useContext(ApiKeyContext);
  if (!ctx) throw new Error('useApiKey must be used within ApiKeyProvider');
  return ctx;
}
