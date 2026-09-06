'use client';

/**
 * Recording storage.
 *
 * Recordings live in **IndexedDB**, not localStorage. localStorage holds
 * strings in roughly 5 MB per origin; a 30-minute screen capture is 300 MB to
 * 2 GB of binary, so writing one there throws `QuotaExceededError` within
 * seconds. IndexedDB stores Blobs natively and is bounded by disk rather than
 * a fixed cap.
 *
 * It is equally local: same origin, same machine, never uploaded, and unlike a
 * blob URL it survives a reload — which matters, because a recording someone
 * spent half an hour making should not be lost by pressing F5.
 *
 * Chunks are stored as they arrive rather than one blob at the end, so a crash
 * mid-recording costs at most the last timeslice instead of everything.
 */

const DB_NAME = 'converter-recordings';
const DB_VERSION = 1;

/** One row per recording: the metadata, and the assembled blob once finished. */
const STORE = 'recordings';
/** One row per timeslice, keyed [recordingId, sequence]. Deleted once assembled. */
const CHUNKS = 'chunks';

export interface RecordingMeta {
  id: string;
  title: string;
  /** Milliseconds. Measured from the first chunk, not from the user pressing record. */
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  createdAt: number;
  /** True while chunks are still arriving; a row left this way is a crashed recording. */
  incomplete?: boolean;
}

interface RecordingRow extends RecordingMeta {
  blob?: Blob;
}

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the recordings database.'));
  });

  // A failed open must not be cached as the permanent answer: a private window
  // that denies storage once may allow it after the user changes the setting.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The recordings database rejected a request.'));
  });
}

/** Chunk keys sort in insertion order, so a range scan replays them correctly. */
function chunkKey(id: string, sequence: number): string {
  return `${id}:${sequence.toString().padStart(8, '0')}`;
}

export async function createRecording(meta: RecordingMeta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await promisify(tx.objectStore(STORE).put({ ...meta, incomplete: true } satisfies RecordingRow));
}

export async function appendChunk(id: string, sequence: number, chunk: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CHUNKS, 'readwrite');
  await promisify(tx.objectStore(CHUNKS).put(chunk, chunkKey(id, sequence)));
}

/**
 * Assemble the stored chunks into one blob and mark the recording complete.
 *
 * The chunks are deleted afterwards rather than kept alongside the blob: two
 * copies of a 2 GB recording is how a browser's storage quota is reached by a
 * user who only ever made one.
 */
export async function finalizeRecording(
  id: string,
  patch: Pick<RecordingMeta, 'durationMs'> & Partial<RecordingMeta>,
): Promise<RecordingMeta> {
  const db = await openDb();

  const chunks: Blob[] = [];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CHUNKS, 'readonly');
    const range = IDBKeyRange.bound(`${id}:`, `${id}:￿`);
    const cursor = tx.objectStore(CHUNKS).openCursor(range);
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return resolve();
      chunks.push(c.value as Blob);
      c.continue();
    };
    cursor.onerror = () => reject(cursor.error ?? new Error('Could not read the recording chunks.'));
  });

  const existing = await getRecording(id);
  const mimeType = patch.mimeType ?? existing?.mimeType ?? 'video/webm';
  const blob = new Blob(chunks, { type: mimeType });

  const meta: RecordingMeta = {
    id,
    title: patch.title ?? existing?.title ?? 'Recording',
    durationMs: patch.durationMs,
    sizeBytes: blob.size,
    mimeType,
    createdAt: existing?.createdAt ?? Date.now(),
  };

  const tx = db.transaction([STORE, CHUNKS], 'readwrite');
  tx.objectStore(STORE).put({ ...meta, blob } satisfies RecordingRow);
  tx.objectStore(CHUNKS).delete(IDBKeyRange.bound(`${id}:`, `${id}:￿`));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save the recording.'));
  });

  return meta;
}

export async function getRecording(id: string): Promise<RecordingMeta | undefined> {
  const db = await openDb();
  const row = await promisify(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
  if (!row) return undefined;
  const { blob: _blob, ...meta } = row as RecordingRow;
  return meta;
}

export async function getRecordingBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  const row = await promisify(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
  return (row as RecordingRow | undefined)?.blob;
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  const db = await openDb();
  const rows = await promisify(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  return (rows as RecordingRow[])
    .map(({ blob: _blob, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE, CHUNKS], 'readwrite');
  tx.objectStore(STORE).delete(id);
  tx.objectStore(CHUNKS).delete(IDBKeyRange.bound(`${id}:`, `${id}:￿`));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not delete the recording.'));
  });
}

export async function renameRecording(id: string, title: string): Promise<void> {
  const db = await openDb();
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  const row = (await promisify(store.get(id))) as RecordingRow | undefined;
  if (!row) return;
  await promisify(store.put({ ...row, title }));
}

/**
 * Drop rows left `incomplete` by a crash or a closed tab.
 *
 * Their chunks are real but the recording was never assembled, and presenting
 * a partial capture as a finished one is worse than not offering it: the user
 * cannot tell which minutes are missing.
 */
export async function pruneIncomplete(): Promise<number> {
  const db = await openDb();
  const rows = (await promisify(
    db.transaction(STORE, 'readonly').objectStore(STORE).getAll(),
  )) as RecordingRow[];
  const stale = rows.filter((r) => r.incomplete);
  for (const row of stale) await deleteRecording(row.id);
  return stale.length;
}

export interface StorageEstimate {
  usageBytes: number;
  quotaBytes: number;
}

/** What the browser says is used and available. Absent where the API is not implemented. */
export async function storageEstimate(): Promise<StorageEstimate | undefined> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return undefined;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (usage === undefined || quota === undefined) return undefined;
    return { usageBytes: usage, quotaBytes: quota };
  } catch {
    return undefined;
  }
}
