'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'converter:theme';

const THEME_EVENT = 'converter:theme-change';

/** Runs in <head> before hydration so a stored dark theme never flashes light. */
export const themeInitScript = `(function(){try{if(localStorage.getItem('${THEME_KEY}')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage unavailable (private mode, quota); the class still applies for this page
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) {
      document.documentElement.classList.toggle('dark', e.newValue === 'dark');
      onChange();
    }
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function getServerSnapshot(): Theme {
  return 'light';
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme]);
  return { theme, setTheme, toggle };
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** False on the server and first client render; tracks the media query after mount. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
