import pg from 'pg';
import type { Log } from '../core/logger.js';

/**
 * Postgres connection pool.
 *
 * One datastore backs jobs, results, keys, monitors and vectors. No Redis, no
 * broker — which is what makes `docker compose up` a single health-gated step
 * rather than a startup race to retry past.
 */

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

let pool: pg.Pool | undefined;

export function createPool(connectionString: string, logger?: Log): pg.Pool {
  if (pool) return pool;

  pool = new pg.Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (error) => {
    // An idle client erroring is not fatal — the pool replaces it. Logging it
    // matters because a silent connection churn looks like random slowness.
    logger?.error({ error }, 'idle postgres client error');
  });

  return pool;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('Postgres pool not initialised. Call createPool() at boot.');
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/** Run work inside a transaction, rolling back on any throw. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
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
