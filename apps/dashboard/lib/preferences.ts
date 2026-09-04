'use client';

import * as React from 'react';
import type { Endpoint } from './endpoints';
import type { Format } from './api';

/**
 * Per-browser preferences. Deliberately not on `profiles`: these describe the
 * machine someone is sitting at, not the account — a phone and a desktop want
 * different answers, and a self-host install has no account to hang them on.
 */
export interface Preferences {
  /** `system` follows the OS; the app surface is dark-first regardless (FRONTEND.md §3). */
  appearance: 'dark' | 'light' | 'system';
  defaultEndpoint: Endpoint;
  defaultFormat: Format;
  /** Overrides the OS setting in one direction only: it can force motion off, never on. */
  reduceMotion: boolean;
  sidebarStartsCollapsed: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: 'dark',
  defaultEndpoint: 'scrape',
  defaultFormat: 'markdown',
  reduceMotion: false,
  sidebarStartsCollapsed: false,
};

const STORAGE_KEY = 'helix.app.preferences';

/** The sidebar reads its own key on mount, so the preference seeds that rather than replacing it. */
export const SIDEBAR_STORAGE_KEY = 'helix.app.sidebarCollapsed';

function read(): Preferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    // Spread over the defaults rather than trusting the shape: a preference
    // added after someone's last visit is absent from their stored object.
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function write(prefs: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // A browser with storage disabled still gets a working session; the
    // preference simply does not survive the tab.
  }
}

const listeners = new Set<(prefs: Preferences) => void>();

function broadcast(prefs: Preferences): void {
  for (const listener of listeners) listener(prefs);
}

export function usePreferences(): {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  hydrated: boolean;
} {
  const [preferences, setPreferences] = React.useState<Preferences>(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setPreferences(read());
    setHydrated(true);
    const listener = (next: Preferences): void => setPreferences(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setPreference = React.useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]): void => {
      const next = { ...read(), [key]: value };
      write(next);
      if (key === 'sidebarStartsCollapsed') {
        try {
          // The sidebar stores '1'/'0', not 'true'/'false'; writing the wrong
          // shape here reads back as collapsed either way.
          window.localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? '1' : '0');
        } catch {
          // Same as above: the session still works without persistence.
        }
      }
      broadcast(next);
    },
    [],
  );

  return { preferences, setPreference, hydrated };
}

/**
 * True when motion should be suppressed: the OS asks for it, or the user set
 * the override here. Components already honour `prefers-reduced-motion` in CSS;
 * this covers the JS-driven fields, which CSS cannot reach.
 */
export function usePrefersReducedMotion(): boolean {
  const { preferences } = usePreferences();
  const [system, setSystem] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setSystem(query.matches);
    const onChange = (e: MediaQueryListEvent): void => setSystem(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return system || preferences.reduceMotion;
}
