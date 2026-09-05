'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  deleteRecording,
  listRecordings,
  pruneIncomplete,
  storageEstimate,
  type RecordingMeta,
  type StorageEstimate,
} from './db';

/**
 * The recordings list, as React state.
 *
 * Not `useSyncExternalStore` like `lib/jobs/store`: that one reads
 * localStorage, which is synchronous, so a snapshot can be produced during
 * render. IndexedDB is asynchronous, and a getSnapshot that returns a promise
 * has nothing useful to compare with `Object.is`.
 */
export interface RecordingsState {
  recordings: RecordingMeta[];
  storage: StorageEstimate | undefined;
  loading: boolean;
  /** Set when IndexedDB is unavailable — a private window, or storage denied. */
  error: string | undefined;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useRecordings(): RecordingsState {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [storage, setStorage] = useState<StorageEstimate | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const [rows, estimate] = await Promise.all([listRecordings(), storageEstimate()]);
      setRecordings(rows);
      setStorage(estimate);
      setError(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Recordings are unavailable because this browser is not allowing local storage.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await deleteRecording(id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    // A row left mid-write by a crashed tab is dropped before the list is
    // shown, so a partial capture is never offered as a finished one.
    void pruneIncomplete()
      .catch(() => 0)
      .then(() => refresh());
  }, [refresh]);

  return { recordings, storage, loading, error, refresh, remove };
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
