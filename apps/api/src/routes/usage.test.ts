import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiKey } from '../core/api-keys.js';

/**
 * Usage route contract. Postgres is a fake, so what is asserted is the surface:
 * the window bounds, that the query is scoped to the calling key alone, and the
 * aggregation shape the dashboard reads.
 *
 * The bounds matter more than they look: `hours` reaches a timestamp comparison
 * on a table that grows with traffic, so an unbounded value is a full scan a
 * caller can ask for.
 */

interface Call {
  text: string;
  values: unknown[];
}

interface UsageRow {
  api_key_id: string;
  bucket_start: Date;
  endpoint: string;
  status_class: string;
  requests: number;
}

const db = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    usage: [] as UsageRow[],
    keys: [] as { id: string; name: string; key_prefix: string; rate_limit: number }[],
    fail: null as string | null,
  };

  const inWindow = (row: UsageRow, since: string, until: string) =>
    row.bucket_start.toISOString() >= since && row.bucket_start.toISOString() < until;

  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });

    if (state.fail && text.includes(state.fail)) {
      // Postgres reports a missing relation as 42P01; the shape matters because
      // the route may only degrade on this and not on an arbitrary fault.
      const error = Object.assign(new Error('relation "request_usage" does not exist'), { code: '42P01' });
      throw error;
    }

    if (text.includes('FROM request_usage')) {
      const [ids, since, until] = values as [string[], string, string];
      const rows = state.usage.filter((r) => ids.includes(r.api_key_id) && inWindow(r, since, until));

      if (text.includes('AS total')) {
        return {
          rows: [
            {
              total: String(rows.reduce((n, r) => n + r.requests, 0)),
              rate_limited: String(
                rows.filter((r) => r.status_class === '429').reduce((n, r) => n + r.requests, 0),
              ),
              errors: String(
                rows
                  .filter((r) => r.status_class === '4xx' || r.status_class === '5xx')
                  .reduce((n, r) => n + r.requests, 0),
              ),
            },
          ],
        };
      }

      if (text.includes('GROUP BY bucket_start')) {
        const buckets = new Map<string, number>();
        for (const r of rows) {
          const k = r.bucket_start.toISOString();
          buckets.set(k, (buckets.get(k) ?? 0) + r.requests);
        }
        return {
          rows: [...buckets.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, requests]) => ({ bucket_start: new Date(k), requests: String(requests) })),
        };
      }

      if (text.includes('GROUP BY endpoint')) {
        const byEndpoint = new Map<string, number>();
        for (const r of rows) byEndpoint.set(r.endpoint, (byEndpoint.get(r.endpoint) ?? 0) + r.requests);
        return {
          rows: [...byEndpoint.entries()]
            .sort(([, a], [, b]) => b - a)
            .map(([endpoint, requests]) => ({ endpoint, requests: String(requests) })),
        };
      }
    }

    if (text.includes('FROM api_keys')) {
      return {
        rows: state.keys.map((k) => ({
          ...k,
          created_at: new Date('2026-01-01T00:00:00Z'),
          last_used_at: null,
          revoked_at: null,
        })),
      };
    }

    return { rows: [] };
  });

  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { registerUsage } from './usage.js';

const KEY_A: ApiKey = {
  id: '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  name: 'key a',
  keyPrefix: 'helix-aaaa',
  rateLimit: 1000,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastUsedAt: null,
  revokedAt: null,
};

const KEY_B: ApiKey = { ...KEY_A, id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'key b', keyPrefix: 'helix-bbbb' };

let app: FastifyInstance;

async function build(options: { multiTenant?: boolean } = {}): Promise<FastifyInstance> {
  const built = Fastify();
  // The same redacting handler index.ts installs. Without it a bare Fastify
  // returns the driver's own message, so a leak test on a handler-less app
  // would be measuring the harness rather than the API.
  built.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500;
    if (statusCode >= 500) {
      return reply.code(statusCode).send({
        error: 'internal_error',
        message: 'The request could not be completed.',
        requestId: request.id,
      });
    }
    return reply.code(statusCode).send({ error: 'invalid_request', message: error.message, requestId: request.id });
  });
  built.addHook('onRequest', async (request) => {
    const header = request.headers['x-test-key'];
    if (header === 'a') request.apiKey = KEY_A;
    if (header === 'b') request.apiKey = KEY_B;
  });
  await built.register(
    async (instance) => {
      await registerUsage(instance, { multiTenant: options.multiTenant === true });
    },
    { prefix: '/v1' },
  );
  await built.ready();
  return built;
}

function row(over: Partial<UsageRow> = {}): UsageRow {
  return {
    api_key_id: KEY_A.id,
    bucket_start: new Date('2026-09-01T10:00:00Z'),
    endpoint: '/scrape',
    status_class: '2xx',
    requests: 1,
    ...over,
  };
}

beforeEach(() => {
  db.state.calls = [];
  db.state.usage = [];
  db.state.keys = [];
  db.state.fail = null;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
});

afterEach(async () => {
  vi.useRealTimers();
  await app?.close();
  vi.clearAllMocks();
});

describe('GET /v1/usage auth', () => {
  it('refuses a caller with no key', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('unauthorized');
  });

  it('does not query usage at all for an unauthenticated caller', async () => {
    app = await build();

    await app.inject({ method: 'GET', url: '/v1/usage' });

    expect(db.state.calls.filter((c) => c.text.includes('FROM request_usage'))).toHaveLength(0);
  });
});

describe('GET /v1/usage window bounds', () => {
  it('defaults to a week when hours is absent', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(200);
    expect(response.json().window).toEqual({ hours: 168, unit: 'hour' });
  });

  it('accepts the minimum of one hour', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage?hours=1', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(200);
    expect(response.json().window.hours).toBe(1);
  });

  it('accepts the maximum of ninety days', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage?hours=2160', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(200);
    expect(response.json().window.hours).toBe(2160);
  });

  it('rejects one hour below the minimum', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage?hours=0', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('hours');
  });

  it('rejects one hour past the maximum, so the window cannot become a full scan', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage?hours=2161', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(400);
    expect(db.state.calls.filter((c) => c.text.includes('FROM request_usage'))).toHaveLength(0);
  });

  it('rejects an absurdly large window rather than issuing the query', async () => {
    app = await build();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/usage?hours=999999999',
      headers: { 'x-test-key': 'a' },
    });

    expect(response.statusCode).toBe(400);
    expect(db.state.calls.filter((c) => c.text.includes('FROM request_usage'))).toHaveLength(0);
  });

  it('rejects a negative window', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage?hours=-5', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a non-numeric window instead of coercing it to the default', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage?hours=abc', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a fractional window, which would not truncate to a bucket boundary', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage?hours=1.5', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(400);
  });

  it('rejects an empty hours value rather than reading it as zero', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage?hours=', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(400);
  });

  it('derives the since bound from the window it accepted', async () => {
    app = await build();

    await app.inject({ method: 'GET', url: '/v1/usage?hours=2', headers: { 'x-test-key': 'a' } });

    const call = db.state.calls.find((c) => c.text.includes('FROM request_usage'))!;
    expect(call.values[1]).toBe('2026-09-01T10:00:00.000Z');
    expect(call.values[2]).toBe('2026-09-01T12:00:00.000Z');
  });
});

describe('GET /v1/usage scoping', () => {
  it('queries only the calling key, never a key id from the request', async () => {
    app = await build();

    await app.inject({
      method: 'GET',
      url: `/v1/usage?keyId=${KEY_B.id}`,
      headers: { 'x-test-key': 'a' },
    });

    for (const call of db.state.calls.filter((c) => c.text.includes('FROM request_usage'))) {
      expect(call.values[0]).toEqual([KEY_A.id]);
    }
  });

  it('does not include another key’s traffic in the total', async () => {
    app = await build();
    db.state.usage = [
      row({ api_key_id: KEY_A.id, requests: 3 }),
      row({ api_key_id: KEY_B.id, requests: 100 }),
    ];

    const response = await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } });

    expect(response.json().total).toBe(3);
  });

  it('reports the calling key’s identity but no key material', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } });

    expect(response.json().key).toEqual({
      id: KEY_A.id,
      name: 'key a',
      keyPrefix: 'helix-aaaa',
      rateLimit: 1000,
      lastUsedAt: null,
    });
  });
});

describe('GET /v1/usage aggregation', () => {
  it('splits rate-limited and error counts out of the total', async () => {
    app = await build();
    db.state.usage = [
      row({ status_class: '2xx', requests: 10 }),
      row({ status_class: '429', requests: 4 }),
      row({ status_class: '4xx', requests: 2 }),
      row({ status_class: '5xx', requests: 1 }),
    ];

    const body = (await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } })).json();

    expect(body.total).toBe(17);
    expect(body.rateLimited).toBe(4);
    // 429 is counted as rate-limited only, never folded into errors.
    expect(body.errors).toBe(3);
  });

  it('returns the series in bucket order', async () => {
    app = await build();
    db.state.usage = [
      row({ bucket_start: new Date('2026-09-01T11:00:00Z'), requests: 2 }),
      row({ bucket_start: new Date('2026-09-01T09:00:00Z'), requests: 5 }),
    ];

    const body = (await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } })).json();

    expect(body.series).toEqual([
      { bucketStart: '2026-09-01T09:00:00.000Z', requests: 5 },
      { bucketStart: '2026-09-01T11:00:00.000Z', requests: 2 },
    ]);
  });

  it('ranks endpoints by request count', async () => {
    app = await build();
    db.state.usage = [
      row({ endpoint: '/scrape', requests: 3 }),
      row({ endpoint: '/search', requests: 9 }),
      row({ endpoint: '/scrape', requests: 4 }),
    ];

    const body = (await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } })).json();

    expect(body.byEndpoint).toEqual([
      { endpoint: '/search', requests: 9 },
      { endpoint: '/scrape', requests: 7 },
    ]);
  });

  it('excludes buckets outside the requested window', async () => {
    app = await build();
    db.state.usage = [
      row({ bucket_start: new Date('2026-09-01T11:00:00Z'), requests: 6 }),
      row({ bucket_start: new Date('2026-08-01T11:00:00Z'), requests: 500 }),
    ];

    const body = (await app.inject({ method: 'GET', url: '/v1/usage?hours=2', headers: { 'x-test-key': 'a' } })).json();

    expect(body.total).toBe(6);
  });

  it('returns zeroed totals rather than nulls when the key has no traffic', async () => {
    app = await build();

    const body = (await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } })).json();

    expect(body.total).toBe(0);
    expect(body.rateLimited).toBe(0);
    expect(body.errors).toBe(0);
    expect(body.series).toEqual([]);
    expect(body.byEndpoint).toEqual([]);
  });
});

describe('GET /v1/usage/all', () => {
  it('aggregates across every key on the instance', async () => {
    app = await build();
    db.state.keys = [
      { id: KEY_A.id, name: 'key a', key_prefix: 'helix-aaaa', rate_limit: 1000 },
      { id: KEY_B.id, name: 'key b', key_prefix: 'helix-bbbb', rate_limit: 1000 },
    ];
    db.state.usage = [row({ api_key_id: KEY_A.id, requests: 3 }), row({ api_key_id: KEY_B.id, requests: 4 })];

    const body = (await app.inject({ method: 'GET', url: '/v1/usage/all', headers: { 'x-test-key': 'a' } })).json();

    expect(body.total).toBe(7);
  });

  it('enforces the same window bounds as the per-key route', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/usage/all?hours=2161', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(400);
    expect(db.state.calls.filter((c) => c.text.includes('FROM request_usage'))).toHaveLength(0);
  });

  it('omits the key block, having no single key to attribute', async () => {
    app = await build();

    const body = (await app.inject({ method: 'GET', url: '/v1/usage/all', headers: { 'x-test-key': 'a' } })).json();

    expect(body.key).toBeUndefined();
  });

  it('returns an empty summary without querying usage when the instance has no keys', async () => {
    app = await build();

    const body = (await app.inject({ method: 'GET', url: '/v1/usage/all', headers: { 'x-test-key': 'a' } })).json();

    expect(body.total).toBe(0);
    expect(db.state.calls.filter((c) => c.text.includes('FROM request_usage'))).toHaveLength(0);
  });
});

describe('GET /v1/usage when the usage table is missing', () => {
  /**
   * Characterisation, not approval. `request_usage` arrives in migration 011, so
   * an instance that has not run it answers 500 here rather than degrading to an
   * empty chart. The dashboard's usage panel is the caller; if that is ever
   * changed to degrade, this test is what should fail and say so.
   */
  it('answers 500 rather than degrading, which an un-migrated instance will hit', async () => {
    app = await build();
    db.state.fail = 'FROM request_usage';

    const response = await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(500);
  });

  it('leaks neither the SQL nor the relation name to the caller', async () => {
    app = await build();
    db.state.fail = 'FROM request_usage';

    const response = await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } });

    expect(response.body).not.toContain('request_usage');
    expect(response.body).not.toContain('SELECT');
  });
});

/**
 * `/usage/all` totals every key on the instance. On a shared one that crosses
 * the tenant boundary and has no owner predicate to narrow it by, so it is not
 * registered at all.
 */
describe('multi-tenant registration', () => {
  it('does not register the instance-wide summary', async () => {
    app = await build({ multiTenant: true });
    db.state.usage = [row({ api_key_id: KEY_B.id })];

    const response = await app.inject({ method: 'GET', url: '/v1/usage/all', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(404);
  });

  it('leaves the per-key summary serving, since it already reads only the caller key', async () => {
    app = await build({ multiTenant: true });
    db.state.usage = [row({ api_key_id: KEY_A.id })];

    const response = await app.inject({ method: 'GET', url: '/v1/usage', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(200);
    expect(response.json().key.id).toBe(KEY_A.id);
  });

  it('serves the instance-wide summary under self-host', async () => {
    app = await build();
    db.state.usage = [row({ api_key_id: KEY_A.id })];

    const response = await app.inject({ method: 'GET', url: '/v1/usage/all', headers: { 'x-test-key': 'a' } });

    expect(response.statusCode).toBe(200);
  });
});
