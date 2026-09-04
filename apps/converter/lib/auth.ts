'use client';

import { useSyncExternalStore } from 'react';

/**
 * Helix authenticates with bearer keys and has no session layer, so the browser
 * holds a key the same way an API client does. It stays in localStorage on this
 * device and is never sent anywhere but the converter API.
 */
export const KEY_STORAGE = 'converter:key';
const CHANGE_EVENT = 'converter:key-change';

/** `helix-` + 16 of [A-Za-z0-9], the shape the rest of Helix issues. */
const KEY_SHAPE = /^helix-[A-Za-z0-9]{16}$/;

export function isKeyShape(value: string): boolean {
  return KEY_SHAPE.test(value.trim());
}

/** `helix-a7K2………sT1` — safe to render. */
export function maskKey(key: string): string {
  return `${key.slice(0, 10)}………${key.slice(-3)}`;
}

let snapshot: string | null = null;
let loaded = false;

function read(): string | null {
  if (typeof window === 'undefined') return null;
  if (!loaded) {
    try {
      const raw = window.localStorage.getItem(KEY_STORAGE);
      snapshot = raw && isKeyShape(raw) ? raw : null;
    } catch {
      snapshot = null;
    }
    loaded = true;
  }
  return snapshot;
}

export function getKey(): string | null {
  return read();
}

export function setKey(key: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (key === null) window.localStorage.removeItem(KEY_STORAGE);
    else window.localStorage.setItem(KEY_STORAGE, key.trim());
  } catch {
    return;
  }
  loaded = false;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onChange = () => {
    loaded = false;
    cb();
  };
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useApiKey(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function authHeaders(): Record<string, string> {
  const key = read();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/**
 * EventSource cannot set headers, so the SSE stream alone carries the key in
 * the query string. That URL is same-origin and names a job the key owns.
 */
export function withKey(url: string): string {
  const key = read();
  if (!key) return url;
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
}
