'use client';

import * as React from 'react';

let open = false;
const openListeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

export function setPaletteOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of openListeners) listener();
}

export function openPalette(): void {
  setPaletteOpen(true);
}

export function closePalette(): void {
  setPaletteOpen(false);
}

export function togglePalette(): void {
  setPaletteOpen(!open);
}

export function usePaletteOpen(): boolean {
  return React.useSyncExternalStore(subscribe, () => open, () => false);
}

/**
 * The sidebar owns its collapsed state and its localStorage key; the palette
 * lives outside it. A request rather than shared state, so the sidebar keeps
 * deciding what "toggle" means at the current breakpoint.
 */
const sidebarListeners = new Set<() => void>();

export function requestSidebarToggle(): void {
  for (const listener of sidebarListeners) listener();
}

export function onSidebarToggle(listener: () => void): () => void {
  sidebarListeners.add(listener);
  return () => {
    sidebarListeners.delete(listener);
  };
}
