'use client';

import * as React from 'react';
import { useApiKey as useSelfHostApiKey } from '@/components/shell/api-key-provider';
import type { ProfileRow } from '@/lib/supabase/types';

export type AppMode = 'hosted' | 'self-host';

interface AppSessionValue {
  mode: AppMode;
  profile: ProfileRow | null;
  /** `helix-a7K2………sT1` — the profile's default (first-created) key, masked. */
  defaultKeyMasked: string | null;
  /** The full key when the caller has revealed or holds it locally; null otherwise. */
  apiKey: string | null;
}

const AppSessionContext = React.createContext<AppSessionValue | undefined>(undefined);

/**
 * Hosted mode: wraps the server-resolved profile plus the masked default key
 * (never the plaintext — that only ever comes back from the reveal route).
 * Self-host mode consumes the existing localStorage-backed ApiKeyProvider instead;
 * see useApiKey() below, which returns the same `{ apiKey, setApiKey, clearApiKey }`
 * shape in both modes so existing pages (playground, activity, keys) need no changes.
 */
export function AppSessionProvider({
  profile,
  defaultKeyMasked,
  children,
}: {
  profile: ProfileRow;
  defaultKeyMasked: string | null;
  children: React.ReactNode;
}) {
  const value = React.useMemo<AppSessionValue>(
    () => ({ mode: 'hosted', profile, defaultKeyMasked, apiKey: null }),
    [profile, defaultKeyMasked],
  );
  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession(): AppSessionValue {
  const ctx = React.useContext(AppSessionContext);
  if (ctx) return ctx;
  // Self-host has no server-resolved profile or provider; callers in that mode
  // should prefer useApiKey() for the key and skip profile-dependent UI.
  return { mode: 'self-host', profile: null, defaultKeyMasked: null, apiKey: null };
}

/**
 * `useApiKey`-compatible hook for hosted mode, backed by a revealed key held
 * in memory rather than localStorage (hosted keys are fetched from the API,
 * never persisted client-side beyond the tab). Self-host keeps using the
 * original hook straight from api-key-provider; this wrapper exists only for
 * hosted call sites that need the same shape.
 */
export function useHostedApiKey() {
  const [apiKey, setApiKeyState] = React.useState<string | null>(null);
  const setApiKey = React.useCallback((key: string) => setApiKeyState(key), []);
  const clearApiKey = React.useCallback(() => setApiKeyState(null), []);
  return { apiKey, setApiKey, clearApiKey };
}

export { useSelfHostApiKey };
