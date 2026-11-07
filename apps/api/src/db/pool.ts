import type { Log } from '../core/logger.js';
import { pgDriver } from './drivers/pg.js';
import { pgliteDriver } from './drivers/pglite.js';
import type { Driver, DriverName, DriverOptions, Pool, PoolClient } from './drivers/types.js';


export type { Pool, PoolClient };

const drivers: Record<DriverName, Driver> = {
  pg: pgDriver,
  pglite: pgliteDriver,
};

export interface CreatePoolOptions extends DriverOptions {
  driver: DriverName;
}

let pool: Pool | undefined;

export function createPool(options: CreatePoolOptions, logger?: Log): Pool {
  if (pool) return pool;
  pool = drivers[options.driver](options, logger);
  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('Database pool not initialised. Call createPool() at boot.');
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface PostgresHealth {
  status: 'ok' | 'unhealthy';
  detail?: string;
  latencyMs?: number;
}

export async function checkHealth(): Promise<PostgresHealth> {
  const started = Date.now();
  try {
    await getPool().query('SELECT 1');
    return { status: 'ok', latencyMs: Date.now() - started };
  } catch (error) {
    return {
      status: 'unhealthy',
      detail: error instanceof Error ? error.message : 'query failed',
    };
  }
}
