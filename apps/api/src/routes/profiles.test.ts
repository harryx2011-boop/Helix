import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Profile success/block rate, read straight off `documents` and
 * `fetch_failures`. The fake models the two counting subqueries and the
 * `GREATEST` over their two max-timestamp subqueries, rather than
 * precomputing a rate, so the route's own arithmetic is what is under test.
 */

interface DocRow {
  profile: string | null;
  fetched_at: Date;
}

interface FailureRow {
  profile: string | null;
  occurred_at: Date;
}

interface Call {
  text: string;
  values: unknown[];
}

const db = vi.hoisted(() => {
  const state = { calls: [] as Call[], documents: [] as DocRow[], failures: [] as FailureRow[] };

  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    const [profile] = values as [string];

    if (text.includes('FROM documents')) {
      const successes = state.documents.filter((d) => d.profile === profile);
      const failureRows = state.failures.filter((f) => f.profile === profile);
      const timestamps = [...successes.map((d) => d.fetched_at), ...failureRows.map((f) => f.occurred_at)];
      const lastUsedAt = timestamps.length > 0 ? new Date(Math.max(...timestamps.map((t) => t.getTime()))) : null;
      return {
        rows: [{ successes: String(successes.length), failures: String(failureRows.length), last_used_at: lastUsedAt }],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { registerProfiles } from './profiles.js';

let app: FastifyInstance;

beforeEach(() => {
  db.state.calls = [];
  db.state.documents = [];
  db.state.failures = [];
});

async function build(): Promise<FastifyInstance> {
  const built = Fastify();
  await built.register(registerProfiles, {});
  await built.ready();
  return built;
}

afterEach(async () => {
  await app?.close();
  vi.clearAllMocks();
});

describe('GET /profiles/:id/health', () => {
  it('returns 404 for a profile with no recorded attempts', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/profiles/chrome-149-macos/health' });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });

  it('reports a 100% success rate for a profile with only successes', async () => {
    app = await build();
    db.state.documents = [
      { profile: 'chrome-149-macos', fetched_at: new Date('2026-09-01T10:00:00Z') },
      { profile: 'chrome-149-macos', fetched_at: new Date('2026-09-01T11:00:00Z') },
    ];

    const body = (await app.inject({ method: 'GET', url: '/profiles/chrome-149-macos/health' })).json();

    expect(body).toEqual({
      profile: 'chrome-149-macos',
      attempts: 2,
      successes: 2,
      failures: 0,
      successRate: 1,
      lastUsedAt: '2026-09-01T11:00:00.000Z',
    });
  });

  it('computes the rate as successes over the total of both', async () => {
    app = await build();
    db.state.documents = [{ profile: 'stealth-1', fetched_at: new Date('2026-09-01T10:00:00Z') }];
    db.state.failures = [
      { profile: 'stealth-1', occurred_at: new Date('2026-09-01T09:00:00Z') },
      { profile: 'stealth-1', occurred_at: new Date('2026-09-01T09:30:00Z') },
      { profile: 'stealth-1', occurred_at: new Date('2026-09-01T09:45:00Z') },
    ];

    const body = (await app.inject({ method: 'GET', url: '/profiles/stealth-1/health' })).json();

    expect(body.attempts).toBe(4);
    expect(body.successes).toBe(1);
    expect(body.failures).toBe(3);
    expect(body.successRate).toBe(0.25);
  });

  it('reports lastUsedAt as the most recent event across successes and failures', async () => {
    app = await build();
    db.state.documents = [{ profile: 'p1', fetched_at: new Date('2026-09-01T08:00:00Z') }];
    db.state.failures = [{ profile: 'p1', occurred_at: new Date('2026-09-01T12:00:00Z') }];

    const body = (await app.inject({ method: 'GET', url: '/profiles/p1/health' })).json();

    expect(body.lastUsedAt).toBe('2026-09-01T12:00:00.000Z');
  });

  it('scopes strictly by profile id: another profile own attempts do not count', async () => {
    app = await build();
    db.state.documents = [{ profile: 'other-profile', fetched_at: new Date('2026-09-01T10:00:00Z') }];

    const response = await app.inject({ method: 'GET', url: '/profiles/chrome-149-macos/health' });

    expect(response.statusCode).toBe(404);
  });
});
