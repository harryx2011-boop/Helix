import pg from 'pg';
import type { Driver } from './types.js';

export const pgDriver: Driver = ({ connectionString }, logger) => {
  if (!connectionString) throw new Error('The pg driver needs DATABASE_URL.');

  const pool = new pg.Pool({
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
};
