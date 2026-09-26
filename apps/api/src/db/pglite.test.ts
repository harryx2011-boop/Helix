import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pgliteDriver } from './drivers/pglite.js';
import type { Pool, PoolClient } from './drivers/types.js';

/**
 * The PGlite driver against the real engine, in memory. PGlite has one
 * connection, so the driver's mutex is the only thing keeping a bare query out
 * of someone else's open transaction. These are the tests that fail if it
 * stops doing that.
 */

let pool: Pool;

beforeAll(async () => {
  pool = pgliteDriver({});
  await pool.query('CREATE TABLE marks (tx text, n int8, amt numeric, b bytea, j jsonb)');
}, 120_000);

afterAll(async () => {
  await pool.end();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
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

describe('pglite driver: one connection behind a mutex', () => {
  it('never lets a statement land inside another transaction', async () => {
    await pool.query('DELETE FROM marks', []);
    const log: string[] = [];

    const tx = (name: string, ms: number) =>
      transaction(async (client) => {
        await client.query('INSERT INTO marks (tx) VALUES ($1)', [name]);
        await sleep(ms);
        const { rows } = await client.query<{ tx: string }>('SELECT tx FROM marks ORDER BY tx', []);
        log.push(`${name}:${rows.map((r) => r.tx).join(',')}`);
        if (name === 'B') throw new Error('B rolls back');
      });
    const stray = async (name: string) => {
      const { rows } = await pool.query<{ tx: string }>('SELECT tx FROM marks ORDER BY tx', []);
      log.push(`${name}:${rows.map((r) => r.tx).join(',')}`);
    };

    const results = await Promise.allSettled([tx('A', 60), stray('q1'), tx('B', 40), stray('q2'), tx('C', 20), stray('q3')]);

    // Each transaction sees only committed rows plus its own; no stray query
    // sees an uncommitted row; B's rollback leaves nothing behind.
    expect(log).toEqual(['A:A', 'q1:A', 'B:A,B', 'q2:A', 'C:A,C', 'q3:A,C']);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled', 'fulfilled']);
  });

  it('queues a bare query issued mid-transaction until the commit, rather than deadlocking', async () => {
    await pool.query('DELETE FROM marks', []);
    const order: string[] = [];

    const open = transaction(async (client) => {
      await client.query("INSERT INTO marks (tx) VALUES ('D')", []);
      await sleep(50);
      order.push('commit');
    });
    await sleep(10);
    const stray = pool
      .query<{ n: string }>("SELECT count(*) AS n FROM marks WHERE tx = 'D'", [])
      .then(({ rows }) => order.push(`stray saw ${rows[0]!.n}`));

    await Promise.all([open, stray]);
    expect(order).toEqual(['commit', 'stray saw 1']);
  });

  it('frees the connection on release, once, however often release is called', async () => {
    const client = await pool.connect();
    client.release();
    client.release();
    await expect(client.query('SELECT 1', [])).rejects.toThrow(/after release/);
    const { rows } = await pool.query<{ one: number }>('SELECT 1 AS one', []);
    expect(rows).toEqual([{ one: 1 }]);
  });
});

describe('pglite driver: parity with node-postgres', () => {
  it('returns int8 and numeric as strings and bytea as a Buffer', async () => {
    await pool.query('INSERT INTO marks (tx, n, amt, b, j) VALUES ($1, $2, $3, $4, $5)', [
      'T',
      '9007199254740993',
      '1.50',
      Buffer.from('hi'),
      JSON.stringify({ a: 1 }),
    ]);
    const { rows } = await pool.query("SELECT n, amt, b, j, count(*) OVER () AS c FROM marks WHERE tx = 'T'", []);
    const row = rows[0];

    expect(row.n).toBe('9007199254740993');
    expect(row.amt).toBe('1.50');
    expect(Buffer.isBuffer(row.b)).toBe(true);
    expect(row.b.toString()).toBe('hi');
    expect(row.j).toEqual({ a: 1 });
    expect(row.c).toBe('1');
  });

  it('reports rowCount for writes', async () => {
    await pool.query('DELETE FROM marks', []);
    await pool.query("INSERT INTO marks (tx) VALUES ('x'), ('y')", []);
    const { rowCount } = await pool.query("UPDATE marks SET n = 1 WHERE tx IN ('x', 'y')", []);
    expect(rowCount).toBe(2);
  });

  it('drops bound parameters from a failed query error, since request logs serialise them', async () => {
    const error = await pool
      .query('INSERT INTO marks (n) VALUES ($1)', ['not-a-number-secret'])
      .then(() => undefined, (e: unknown) => e as Record<string, unknown>);
    expect(error).toBeDefined();
    expect(Object.keys(error!)).not.toContain('params');
    expect(Object.keys(error!)).not.toContain('queryOptions');
    expect(JSON.stringify(error)).not.toContain('not-a-number-secret');

    const client = await pool.connect();
    try {
      const inTx = await client
        .query('INSERT INTO marks (n) VALUES ($1)', ['also-secret'])
        .then(() => undefined, (e: unknown) => e as Record<string, unknown>);
      expect(Object.keys(inTx!)).not.toContain('params');
    } finally {
      client.release();
    }
  });

  it('runs a parameterless multi-statement call and returns the last result, as migrate.ts needs', async () => {
    const { rows } = await pool.query('SELECT 1 AS one; SELECT 2 AS two');
    expect(rows).toEqual([{ two: 2 }]);
  });
});
