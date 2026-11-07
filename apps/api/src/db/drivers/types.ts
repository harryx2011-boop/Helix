import type { Log } from '../../core/logger.js';


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
  dataDir?: string | undefined;
}

export type Driver = (options: DriverOptions, logger?: Log) => Pool;
