import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const JOB = '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

interface DocumentRow {
  url: string;
  tier: string | null;
  profile: string | null;
  metadata: Record<string, unknown>;
}

const db = vi.hoisted(() => {
  const state = { jobs: [] as string[], documents: [] as DocumentRow[], calls: [] as { text: string; values: unknown[] }[] };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    if (text.includes('SELECT 1 FROM jobs')) {
      const found = state.jobs.includes(values[0] as string);
      return { rows: found ? [{}] : [], rowCount: found ? 1 : 0 };
    }
    if (text.includes('FROM documents')) {
      const [, limit, offset] = values as [string, number, number];
      const rows = state.documents.slice(offset, offset + limit);
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

const { registerJobLadder } = await import('./job-ladder.js');

let app: FastifyInstance;

async function build(): Promise<FastifyInstance> {
  const built = Fastify();
  await built.register(async (instance) => registerJobLadder(instance), { prefix: '/v1' });
  await built.ready();
  return built;
}

beforeEach(async () => {
  db.state.jobs = [JOB];
  db.state.documents = [];
  db.state.calls = [];
  app = await build();
});

afterEach(async () => {
  await app.close();
});

describe('GET /v1/jobs/{id}/ladder', () => {
  it('reports the tier each page came from and why it climbed', async () => {
    const escalations = [{ from: 'plain', to: 'chromium', reason: 'content absent from the raw HTML' }];
    db.state.documents = [
      { url: 'https://example.com/a', tier: 'plain', profile: null, metadata: { tiersAttempted: ['plain'], escalations: [], timingMs: 120 } },
      { url: 'https://example.com/b', tier: 'chromium', profile: 'chrome-131-win', metadata: { tiersAttempted: ['plain', 'chromium'], escalations, timingMs: 2400 } },
    ];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/ladder` })).json();

    expect(body).toEqual({
      jobId: JOB,
      next: null,
      data: [
        { url: 'https://example.com/a', tier: 'plain', tiersAttempted: ['plain'], escalations: [], profile: null, timingMs: 120 },
        { url: 'https://example.com/b', tier: 'chromium', tiersAttempted: ['plain', 'chromium'], escalations, profile: 'chrome-131-win', timingMs: 2400 },
      ],
    });
  });

  // An empty list would claim the first tier served the page; for a page
  // recorded before climbs were kept, nobody knows.
  it('answers null, not an empty list, for a page recorded before climbs were kept', async () => {
    db.state.documents = [{ url: 'https://example.com/old', tier: 'tls', profile: null, metadata: { tiersAttempted: ['plain', 'tls'] } }];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/ladder` })).json();

    expect(body.data[0].escalations).toBeNull();
    expect(body.data[0].timingMs).toBeNull();
  });

  it('pages through a large job with the same cursor as GET /jobs/{id}', async () => {
    db.state.documents = Array.from({ length: 150 }, (_, i) => ({
      url: `https://example.com/${i}`,
      tier: 'plain',
      profile: null,
      metadata: { tiersAttempted: ['plain'], escalations: [], timingMs: 1 },
    }));

    const first = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/ladder` })).json();
    expect(first.data).toHaveLength(100);
    expect(first.next).toBe(`/v1/jobs/${JOB}/ladder?cursor=100`);

    const second = (await app.inject({ method: 'GET', url: first.next })).json();
    expect(second.data).toHaveLength(50);
    expect(second.next).toBeNull();
  });

  it('answers 404 for an unknown or malformed id without querying documents', async () => {
    const unknown = await app.inject({ method: 'GET', url: '/v1/jobs/00000000-0000-4000-8000-000000000000/ladder' });
    const malformed = await app.inject({ method: 'GET', url: '/v1/jobs/not-a-uuid/ladder' });

    expect(unknown.statusCode).toBe(404);
    expect(malformed.statusCode).toBe(404);
    expect(db.state.calls.some((c) => c.text.includes('FROM documents'))).toBe(false);
  });

  it('rejects a cursor it did not hand out', async () => {
    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/ladder?cursor=-1` });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'cursor' });
  });
});
