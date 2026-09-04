'use client';

import type { DocIndexEntry } from '@/lib/palette-search';

let pending: Promise<DocIndexEntry[]> | null = null;

/** Fetched once per page load, on the first open; a failure clears the cache so the next open retries. */
export function loadDocIndex(): Promise<DocIndexEntry[]> {
  pending ??= fetch('/search-index.json')
    .then((response) => {
      if (!response.ok) throw new Error(`The docs index answered ${response.status}.`);
      return response.json() as Promise<DocIndexEntry[]>;
    })
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}
