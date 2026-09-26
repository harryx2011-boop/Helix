import type { Log } from '../../core/logger.js';

/**
 * The slice of `pg.Pool` the API uses. `pg.Pool` satisfies it as-is, so the
 * pg driver hands back the real pool; PGlite is adapted to it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface QueryResult<R = any> {
  rows: R[];
  rowCount: number | null;
}

export interface Queryable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export interface PoolClient extends Queryable {
  release(): void;
}

export interface Pool extends Queryable {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export type DriverName = 'pg' | 'pglite';

export interface DriverOptions {
  connectionString?: string | undefined;
  /** Unset keeps PGlite in memory, which is what the real-engine tests use. */
  dataDir?: string | undefined;
}

export type Driver = (options: DriverOptions, logger?: Log) => Pool;
