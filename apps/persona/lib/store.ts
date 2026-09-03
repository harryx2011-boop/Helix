'use client';

import * as React from 'react';

/**
 * Local-first state (PERSONA.md §3): forks, favourites, template values and
 * settings live in localStorage indefinitely. Signing in (Phase 4) merges
 * this up to Supabase; the shapes here match the tables so the merge is a
 * copy, not a translation.
 */

export interface Fork {
  id: string;
  roleSlug: string;
  personaSlug: string;
  sourceVersion: number;
  title: string;
  bodyMd: string;
  values: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  theme: 'light' | 'dark';
  apiKey: string;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}

const KEYS = {
  forks: 'persona.forks',
  favorites: 'persona.favorites',
  values: 'persona.values',
  settings: 'persona.settings',
} as const;

const DEFAULT_SETTINGS: Settings = { theme: 'light', apiKey: '', sidebarWidth: 288, sidebarCollapsed: false };

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('persona:store', { detail: key }));
  } catch {
    /* quota or private mode: state stays in memory for this page */
  }
}

/** Subscribe to one key; re-renders on writes from any component or tab. */
function useStored<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = React.useState<T>(fallback);
  React.useEffect(() => {
    setValue(read(key, fallback));
    const onChange = (e: Event) => {
      if (e instanceof StorageEvent && e.key !== key) return;
      if (e instanceof CustomEvent && e.detail !== key) return;
      setValue(read(key, fallback));
    };
    window.addEventListener('storage', onChange);
    window.addEventListener('persona:store', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('persona:store', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(read(key, fallback)) : next;
      write(key, resolved);
      setValue(resolved);
    },
    [key, fallback],
  );
  return [value, set];
}

const EMPTY_FORKS: Fork[] = [];
const EMPTY_FAVS: string[] = [];
const EMPTY_VALUES: Record<string, string> = {};

export function useForks() {
  const [forks, setForks] = useStored<Fork[]>(KEYS.forks, EMPTY_FORKS);
  const upsert = React.useCallback(
    (fork: Fork) => setForks((prev) => [fork, ...prev.filter((f) => f.id !== fork.id)]),
    [setForks],
  );
  const remove = React.useCallback((id: string) => setForks((prev) => prev.filter((f) => f.id !== id)), [setForks]);
  return { forks, upsert, remove };
}

export function newForkId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Favourites are `${roleSlug}/${personaSlug}`. */
export function useFavorites() {
  const [favorites, setFavorites] = useStored<string[]>(KEYS.favorites, EMPTY_FAVS);
  const toggle = React.useCallback(
    (id: string) => setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id])),
    [setFavorites],
  );
  return { favorites, toggle, has: (id: string) => favorites.includes(id) };
}

/** Saved answers keyed by normalised placeholder key; one fill serves every persona. */
export function useTemplateValues() {
  const [values, setValues] = useStored<Record<string, string>>(KEYS.values, EMPTY_VALUES);
  const setValue = React.useCallback((key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value })), [setValues]);
  const clear = React.useCallback(() => setValues({}), [setValues]);
  return { values, setValue, setValues, clear };
}

export function useSettings() {
  const [settings, setSettings] = useStored<Settings>(KEYS.settings, DEFAULT_SETTINGS);
  const update = React.useCallback((patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })), [setSettings]);
  return { settings, update };
}

export const STORE_KEYS = KEYS;
