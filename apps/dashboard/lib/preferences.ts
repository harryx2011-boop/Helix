'use client';

import * as React from 'react';
import type { Endpoint } from './endpoints';
import type { Format } from './api';

export interface Preferences {
  appearance: 'dark' | 'light' | 'system';
  defaultEndpoint: Endpoint;
  defaultFormat: Format;
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

export const SIDEBAR_STORAGE_KEY = 'helix.app.sidebarCollapsed';

function read(): Preferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function write(prefs: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
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
          window.localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? '1' : '0');
        } catch {
        }
      }
      broadcast(next);
    },
    [],
  );

  return { preferences, setPreference, hydrated };
}

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
