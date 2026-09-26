import { mkdir } from 'node:fs/promises';
import type { PGlite } from '@electric-sql/pglite';
import type { Driver, Pool, PoolClient, QueryResult } from './types.js';

/**
 * Postgres compiled to WASM, running in this process, with its data in a
 * folder. One engine means one connection, so a mutex stands in for the pool:
 * `connect()` holds it until `release()`, and a bare `query()` queues behind
 * any open transaction instead of landing inside it.
 */

// OIDs from pg_type; importing the constants would load the engine eagerly.
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
  // Loaded here, not at the top, so the pg path never pulls in the WASM build.
  const [{ PGlite }, { uuid_ossp }, { vector }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/contrib/uuid_ossp'),
    import('@electric-sql/pglite-pgvector'),
  ]);
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const db = new PGlite({
    ...(dataDir ? { dataDir } : {}),
    extensions: { uuid_ossp, vector },
    // Parity with node-postgres, which the query sites were written against:
    // int8 and numeric stay strings (an int8 past 2^53 would otherwise become
    // a BigInt that JSON.stringify throws on), bytea arrives as a Buffer.
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
  // PGlite's query() is the extended protocol, one statement only; a migration
  // file is many. pg sends a parameterless call as a simple query, so exec() it.
  if (values === undefined) {
    const results = await db.exec(text);
    const last = results.at(-1);
    return { rows: (last?.rows ?? []) as R[], rowCount: last?.rowCount ?? last?.affectedRows ?? null };
  }
  const result = await db.query<R>(text, values);
  return { rows: result.rows, rowCount: result.rowCount ?? result.affectedRows ?? null };
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

    // A single in-process engine has no idle connections to lose.
    on: () => pool,
  };

  return pool;
};
