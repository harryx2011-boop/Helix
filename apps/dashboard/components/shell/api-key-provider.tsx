'use client';

import * as React from 'react';
import { getApiKey, setApiKey as persistApiKey, clearApiKey as removeApiKey } from '@/lib/auth';
import { listenForEmbedKey } from '@/lib/embed';

interface ApiKeyContextValue {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

const ApiKeyContext = React.createContext<ApiKeyContextValue | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setApiKeyState(getApiKey());
    setHydrated(true);
    return listenForEmbedKey((key) => {
      persistApiKey(key);
      setApiKeyState(key);
    });
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

export function useOptionalApiKey(): ApiKeyContextValue | null {
  return React.useContext(ApiKeyContext) ?? null;
}

export function useApiKey(): ApiKeyContextValue {
  const ctx = React.useContext(ApiKeyContext);
  if (!ctx) throw new Error('useApiKey must be used within ApiKeyProvider');
  return ctx;
}
