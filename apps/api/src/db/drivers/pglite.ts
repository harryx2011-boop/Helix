import { mkdir } from 'node:fs/promises';
import type { PGlite } from '@electric-sql/pglite';
import type { Driver, Pool, PoolClient, QueryResult } from './types.js';


const INT8 = 20;
const NUMERIC = 1700;
const BYTEA = 17;

class Mutex {
  #tail: Promise<void> = Promise.resolve();

  lock(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    const prev = this.#tail;
    this.#tail = prev.then(() => next);
    return prev.then(() => release);
  }
}

async function open(dataDir: string | undefined): Promise<PGlite> {
  const [{ PGlite }, { uuid_ossp }, { vector }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/contrib/uuid_ossp'),
    import('@electric-sql/pglite-pgvector'),
  ]);
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const db = new PGlite({
    ...(dataDir ? { dataDir } : {}),
    extensions: { uuid_ossp, vector },
    parsers: {
      [INT8]: (value: string) => value,
      [NUMERIC]: (value: string) => value,
      [BYTEA]: (value: string) => Buffer.from(value.slice(2), 'hex'),
    },
  });
  await db.waitReady;
  return db;
}

async function run<R>(db: PGlite, text: string, values?: unknown[]): Promise<QueryResult<R>> {
  try {
    if (values === undefined) {
      const results = await db.exec(text);
      const last = results.at(-1);
      return { rows: (last?.rows ?? []) as R[], rowCount: last?.rowCount ?? last?.affectedRows ?? null };
    }
    const result = await db.query<R>(text, values);
    return { rows: result.rows, rowCount: result.rowCount ?? result.affectedRows ?? null };
  } catch (error) {
    if (typeof error === 'object' && error !== null) {
      delete (error as { params?: unknown }).params;
      delete (error as { queryOptions?: unknown }).queryOptions;
    }
    throw error;
  }
}

export const pgliteDriver: Driver = ({ dataDir }, logger) => {
  const mutex = new Mutex();
  let engine: Promise<PGlite> | undefined;
  let closed = false;

  const ready = (): Promise<PGlite> => {
    if (closed) return Promise.reject(new Error('The database is closed.'));
    engine ??= open(dataDir).then(
      (db) => {
        logger?.info({ dataDir: dataDir ?? 'memory' }, 'pglite ready');
        return db;
      },
      (error: unknown) => {
        engine = undefined;
        throw error;
      },
    );
    return engine;
  };

  const pool: Pool = {
    async query<R>(text: string, values?: unknown[]) {
      const release = await mutex.lock();
      try {
        return await run<R>(await ready(), text, values);
      } finally {
        release();
      }
    },

    async connect(): Promise<PoolClient> {
      const release = await mutex.lock();
      let db: PGlite;
      try {
        db = await ready();
      } catch (error) {
        release();
        throw error;
      }
      let released = false;
      return {
        query: <R>(text: string, values?: unknown[]) => {
          if (released) return Promise.reject(new Error('Client used after release().'));
          return run<R>(db, text, values);
        },
        release: () => {
          if (released) return;
          released = true;
          release();
        },
      };
    },

    async end() {
      const release = await mutex.lock();
      try {
        const db = engine;
        closed = true;
        engine = undefined;
        if (db) await (await db).close();
      } finally {
        release();
      }
    },

    on: () => pool,
  };

  return pool;
};
