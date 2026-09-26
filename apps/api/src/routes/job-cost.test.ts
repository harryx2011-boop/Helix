import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const JOB = '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

interface JobRow {
  id: string;
  type: string;
  status: string;
  usage: Record<string, unknown>;
  estimate: Record<string, unknown> | null;
}

const db = vi.hoisted(() => {
  const state = { job: undefined as JobRow | undefined };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (text.includes('FROM jobs') && state.job && values[0] === state.job.id) {
      return { rows: [state.job], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

const { registerJobCost } = await import('./job-cost.js');

let app: FastifyInstance;

function job(over: Partial<JobRow> = {}): JobRow {
  return { id: JOB, type: 'crawl', status: 'completed', usage: {}, estimate: null, ...over };
}

async function cost() {
  return (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/cost` })).json();
}

beforeEach(async () => {
  db.state.job = undefined;
  app = Fastify();
  await app.register(async (instance) => registerJobCost(instance), { prefix: '/v1' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /v1/jobs/{id}/cost', () => {
  it('reports measured spend beside the projection saved before the crawl', async () => {
    const estimate = { pages: 12, estimatedSeconds: 3, tierBreakdown: { tls: 12 } };
    db.state.job = job({
      usage: { pagesFetched: 10, pagesUnchanged: 0, tierBreakdown: { plain: 8, chromium: 2 }, browserSeconds: 6.4 },
      estimate,
    });

    const body = await cost();

    expect(body).toMatchObject({
      jobId: JOB,
      type: 'crawl',
      status: 'completed',
      actual: { pagesFetched: 10, pagesUnchanged: 0, tierBreakdown: { plain: 8, chromium: 2 }, browserSeconds: 6.4 },
      estimate,
    });
  });

  // A zero would say the job used no tokens; nobody measured them.
  it('answers null with a reason for every figure it did not measure', async () => {
    db.state.job = job({ usage: { pagesFetched: 3, pagesUnchanged: 0, tierBreakdown: { plain: 3 }, browserSeconds: 0 } });

    const body = await cost();

    expect(body.actual.tokens).toBeNull();
    expect(body.actual.providerCost).toBeNull();
    expect(body.estimate).toBeNull();
    expect(body.reasons).toEqual([
      'Tokens and provider spend are not tracked per job; your provider reports them.',
      'No projection was saved: the crawl was resumed, its discovery failed, or it predates saved projections.',
    ]);
  });

  it('does not invent tier counts for a job that finished before they were kept', async () => {
    db.state.job = job({ usage: { pagesFetched: 5, pagesUnchanged: 1 } });

    const body = await cost();

    expect(body.actual).toMatchObject({ pagesFetched: 5, tierBreakdown: null, browserSeconds: null });
    expect(body.reasons[0]).toMatch(/finished before they were/);
  });

  it('says a running job has no figures yet rather than reporting zeros', async () => {
    db.state.job = job({ status: 'running', usage: {} });

    const body = await cost();

    expect(body.actual.pagesFetched).toBeNull();
    expect(body.reasons[0]).toBe('The job is running; its figures are written when it finishes.');
  });

  it('explains why a batch has no projection', async () => {
    db.state.job = job({ type: 'batch_scrape', usage: { pagesFetched: 2, pagesUnchanged: 0, tierBreakdown: { plain: 2 }, browserSeconds: 0 } });

    expect((await cost()).reasons).toContain('A batch discovers nothing, so it has no projection.');
  });

  it('answers 404 for an unknown or malformed id', async () => {
    expect((await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/cost` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/jobs/nope/cost' })).statusCode).toBe(404);
  });
});
