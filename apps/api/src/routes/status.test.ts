import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/status/history` contract. Postgres is a fake: what matters here is that
 * the route shapes the query's rows into ascending per-day buckets, clamps
 * `days`, and serves a cached response inside the 60s window.
 */

interface Call {
  text: string;
  values: unknown[];
}

const db = vi.hoisted(() => {
  const state = { calls: [] as Call[], rows: [] as unknown[] };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    return { rows: state.rows, rowCount: state.rows.length };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { registerStatus } from './status.js';

async function buildApp() {
  const app = Fastify();
  await app.register(async (instance) => registerStatus(instance), { prefix: '/v1' });
  await app.ready();
  return app;
}

describe('GET /v1/status/history', () => {
  beforeEach(() => {
    db.state.calls = [];
    db.state.rows = [];
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  it('returns one service with one bucket per requested day, ascending', async () => {
    const today = new Date().toISOString().slice(0, 10);
    db.state.rows = [
      { service: 'postgres', day: today, ok_count: '9', total_count: '10', p50_ms: '4.5' },
    ];

    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/v1/status/history?days=3' });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.services).toHaveLength(1);
    expect(body.services[0].service).toBe('postgres');
    expect(body.services[0].days).toHaveLength(3);
    expect(body.services[0].days[2]).toEqual({ day: today, okPct: 90, p50Ms: 5, samples: 10 });
    expect(body.services[0].days[0]).toEqual({ day: expect.any(String), okPct: null, p50Ms: null, samples: 0 });

    await app.close();
  });

  it('clamps days above 90 down to 90', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/v1/status/history?days=9000' });
    expect(db.state.calls[0]?.values).toEqual([90]);
    await app.close();
  });

  it('clamps days below 1 up to 1', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/v1/status/history?days=0' });
    expect(db.state.calls[0]?.values).toEqual([1]);
    await app.close();
  });

  it('serves a cached response within 60s without re-querying', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/v1/status/history?days=7' });
    const callsAfterFirst = db.state.calls.length;

    await app.inject({ method: 'GET', url: '/v1/status/history?days=7' });
    expect(db.state.calls.length).toBe(callsAfterFirst);

    await app.close();
  });
});
