'use client';

import { useSyncExternalStore } from 'react';
import type { StoredJob, StoredPreset } from './types';

export const KEYS = {
  jobs: 'converter:jobs',
  presets: 'converter:presets',
  theme: 'converter:theme',
  sound: 'converter:sound',
} as const;

type Key = (typeof KEYS)[keyof typeof KEYS];

const CHANGE_EVENT = 'converter:store';
const cache = new Map<Key, { raw: string | null; value: unknown }>();

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function read<T>(key: Key, fallback: T): T {
  if (!hasWindow()) return fallback;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return fallback;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: Key, value: unknown): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
  invalidateSnapshots();
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

function subscribe(cb: () => void): () => void {
  if (!hasWindow()) return () => {};
  const onChange = () => {
    invalidateSnapshots();
    cb();
  };
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const NO_JOBS: StoredJob[] = [];
const NO_PRESETS: StoredPreset[] = [];

export function loadJobs(): StoredJob[] {
  const all = read<StoredJob[]>(KEYS.jobs, NO_JOBS);
  const now = Date.now();
  const live = all.filter((j) => j.expiresAt > now);
  // Persisting the prune here would re-enter write() from inside a snapshot
  // read; the expired rows are dropped on the next real write instead.
  return live.length === all.length ? all : live;
}

export function upsertJob(job: StoredJob): void {
  const all = read<StoredJob[]>(KEYS.jobs, NO_JOBS);
  const i = all.findIndex((j) => j.id === job.id);
  const next = i === -1 ? [job, ...all] : all.map((j) => (j.id === job.id ? job : j));
  write(KEYS.jobs, next.slice(0, 200));
}

export function removeStoredJob(id: string): void {
  const all = read<StoredJob[]>(KEYS.jobs, NO_JOBS);
  write(
    KEYS.jobs,
    all.filter((j) => j.id !== id),
  );
}

export function loadPresets(): StoredPreset[] {
  return read<StoredPreset[]>(KEYS.presets, NO_PRESETS);
}

export function savePreset(p: Omit<StoredPreset, 'id'>): StoredPreset {
  const preset: StoredPreset = { ...p, id: `up_${Math.random().toString(36).slice(2, 9)}` };
  write(KEYS.presets, [...loadPresets(), preset]);
  return preset;
}

export function deletePreset(id: string): void {
  write(
    KEYS.presets,
    loadPresets().filter((p) => p.id !== id),
  );
}

export function isSoundOn(): boolean {
  return read<boolean>(KEYS.sound, false) === true;
}

export function setSoundOn(on: boolean): void {
  write(KEYS.sound, on);
}

/**
 * useSyncExternalStore compares snapshots with Object.is, so a getSnapshot that
 * parses JSON on every call hands back a new array identity each render and
 * spins forever. The snapshot is cached and invalidated only when a write or a
 * storage event actually changes something.
 */
let jobsSnapshot: StoredJob[] | null = null;
let presetsSnapshot: StoredPreset[] | null = null;

function invalidateSnapshots(): void {
  jobsSnapshot = null;
  presetsSnapshot = null;
}

function jobsGetSnapshot(): StoredJob[] {
  if (jobsSnapshot === null) jobsSnapshot = loadJobs();
  return jobsSnapshot;
}

function presetsGetSnapshot(): StoredPreset[] {
  if (presetsSnapshot === null) presetsSnapshot = loadPresets();
  return presetsSnapshot;
}

export function useStoredJobs(): StoredJob[] {
  return useSyncExternalStore(subscribe, jobsGetSnapshot, () => NO_JOBS);
}

export function usePresets(): StoredPreset[] {
  return useSyncExternalStore(subscribe, presetsGetSnapshot, () => NO_PRESETS);
}

export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribe, isSoundOn, () => false);
}
