import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Job retrieval, pagination and cancellation.
 *
 * Postgres is a fake that understands enough of each statement to model the
 * things the route depends on: that cancellation is a conditional UPDATE which
 * matches nothing once a job has finished, and that a malformed id must never
 * reach a uuid column at all.
 */

interface JobRow {
  id: string;
  api_key_id: string | null;
  type: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  usage: Record<string, unknown>;
  warnings?: string[];
  error: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  expires_at: Date;
  request: Record<string, unknown>;
}

interface DocRow {
  job_id: string;
  url: string;
  final_url: string | null;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

interface TaskRow {
  job_id: string;
  status: string;
}

interface FailureRow {
  job_id: string;
  url: string;
  reason: string;
  detail: string | null;
  status_code: number | null;
  detected_by: string[] | null;
  tier: string | null;
  tiers_tried: string[] | null;
  profile: string | null;
  escalation_available: boolean;
  occurred_at: Date;
}

interface Call {
  text: string;
  values: unknown[];
}

const db = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    jobs: [] as JobRow[],
    documents: [] as DocRow[],
    tasks: [] as TaskRow[],
    failures: [] as FailureRow[],
  };

  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });

    // The owner predicate is read out of the statement rather than restated
    // here, both halves of it. Modelling the clause from memory would let the
    // route widen it — to `OR true`, say — while these tests still reported
    // another tenant's job as hidden.
    const scoped = (rows: JobRow[], keyId: unknown): JobRow[] => {
      const clause = /AND \(api_key_id = \$\d+::uuid OR ([^)]+)\)/.exec(text);
      if (!clause) return rows;
      const fallback = clause[1]!.trim();
      const matchesFallback =
        fallback === 'api_key_id IS NULL'
          ? (j: JobRow) => j.api_key_id === null
          : fallback === 'true'
            ? () => true
            : () => false;
      return rows.filter((j) => j.api_key_id === keyId || matchesFallback(j));
    };

    if (text.includes('SELECT id, type, status')) {
      const [id, keyId] = values as [string, string | null];
      const rows = scoped(state.jobs.filter((j) => j.id === id), keyId);
      return { rows, rowCount: rows.length };
    }

    if (text.includes('SELECT request FROM jobs')) {
      const [id, keyId] = values as [string, string | null];
      const rows = scoped(state.jobs.filter((j) => j.id === id), keyId);
      return { rows: rows.map((j) => ({ request: j.request })), rowCount: rows.length };
    }

    if (text.includes('FROM documents')) {
      const [jobId, limit, offset] = values as [string, number, number];
      const rows = state.documents.filter((d) => d.job_id === jobId).slice(offset, offset + limit);
      return { rows, rowCount: rows.length };
    }

    if (text.startsWith('UPDATE jobs')) {
      const [id, type] = values as [string, string | null];
      // The cancellable statuses are read out of the statement rather than
      // restated here. Hardcoding them would make this fake enforce the
      // guard itself, and the route could drop its WHERE clause unnoticed.
      const clause = /status IN \(([^)]*)\)/.exec(text);
      const cancellable = clause
        ? [...clause[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
        : null;
      const [job] = scoped(
        state.jobs.filter(
          (j) =>
            j.id === id &&
            (cancellable === null || cancellable.includes(j.status)) &&
            (type === null || j.type === type),
        ),
        values[2] ?? null,
      );
      if (!job) return { rows: [], rowCount: 0 };
      job.status = 'cancelled';
      job.finished_at = new Date('2026-09-01T12:00:00Z');
      return { rows: [{ id: job.id, status: job.status }], rowCount: 1 };
    }

    if (text.includes('SELECT 1 FROM jobs')) {
      // Two probes share this statement: cancellation passes the type in $2 and
      // the key in $3, the errors route passes the key in $2 and no type.
      const hasType = text.includes('type = $2::job_type');
      const [id] = values as [string];
      const type = hasType ? (values[1] as string | null | undefined) : null;
      const keyId = (hasType ? values[2] : values[1]) ?? null;
      const rows = scoped(
        state.jobs.filter((j) => j.id === id && (type == null || j.type === type)),
        keyId,
      );
      return { rows: rows.map(() => ({ '?column?': 1 })), rowCount: rows.length };
    }

    if (text.startsWith('UPDATE job_tasks')) {
      const [jobId] = values as [string];
      let rowCount = 0;
      for (const task of state.tasks) {
        if (task.job_id === jobId && task.status === 'queued') {
          task.status = 'cancelled';
          rowCount += 1;
        }
      }
      return { rows: [], rowCount };
    }

    if (text.includes('FROM fetch_failures')) {
      const [jobId] = values as [string];
      const rows = state.failures.filter((f) => f.job_id === jobId);
      return { rows, rowCount: rows.length };
    }

    return { rows: [], rowCount: 0 };
  });

  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { cancelJob, fetchJobSchema, fetchJobView, isJobId, registerJobs } from './jobs.js';
import type { ApiKey } from '../core/api-keys.js';

const JOB = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_JOB = '9c858901-8a57-4791-81fe-4c455b099bc9';
const KEY_A = '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const KEY_B = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

let app: FastifyInstance;

function job(over: Partial<JobRow> = {}): JobRow {
  return {
    id: JOB,
    api_key_id: KEY_A,
    type: 'crawl',
    status: 'running',
    total: 10,
    completed: 4,
    failed: 1,
    usage: { pages: 4 },
    error: null,
    created_at: new Date('2026-09-01T10:00:00Z'),
    started_at: new Date('2026-09-01T10:00:01Z'),
    finished_at: null,
    expires_at: new Date('2026-09-08T10:00:00Z'),
    request: { url: 'https://example.com', formats: ['markdown'] },
    ...over,
  };
}

function doc(over: Partial<DocRow> = {}): DocRow {
  return {
    job_id: JOB,
    url: 'https://example.com/a',
    final_url: null,
    content: { markdown: '# A' },
    metadata: { title: 'A' },
    ...over,
  };
}

/**
 * `caller` stands in for the auth hook, which has already resolved the key by
 * the time a route runs. Defaults to KEY_A.
 */
async function build(
  options: { caller?: string | null } = {},
): Promise<FastifyInstance> {
  const built = Fastify();
  const caller = options.caller === undefined ? KEY_A : options.caller;
  built.addHook('onRequest', async (request) => {
    if (caller !== null) request.apiKey = { id: caller } as ApiKey;
  });
  await built.register(
    async (instance) => {
      await registerJobs(instance);
    },
    { prefix: '/v1' },
  );
  await built.ready();
  return built;
}

beforeEach(() => {
  db.state.calls = [];
  db.state.jobs = [];
  db.state.documents = [];
  db.state.tasks = [];
  db.state.failures = [];
});

afterEach(async () => {
  await app?.close();
  vi.clearAllMocks();
});

describe('isJobId', () => {
  it('accepts a uuid', () => {
    expect(isJobId(JOB)).toBe(true);
  });

  it('rejects a value that would error on a uuid column', () => {
    expect(isJobId('not-a-uuid')).toBe(false);
    expect(isJobId('')).toBe(false);
    expect(isJobId(`${JOB} OR 1=1`)).toBe(false);
  });
});

describe('GET /v1/jobs/:id', () => {
  it('returns 404 for a job that does not exist', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}` });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });

  it('answers 404 for a malformed id without querying the database', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/jobs/not-a-uuid' });

    expect(response.statusCode).toBe(404);
    // A malformed value reaching a uuid column is a 500 for what is a typo.
    expect(db.state.calls).toHaveLength(0);
  });

  it('returns the job with its progress counters', async () => {
    app = await build();
    db.state.jobs = [job()];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}` })).json();

    expect(body.id).toBe(JOB);
    expect(body.jobId).toBe(JOB);
    expect(body.status).toBe('running');
    expect(body.total).toBe(10);
    expect(body.completed).toBe(4);
    expect(body.failed).toBe(1);
    expect(body.usage).toEqual({ pages: 4 });
    expect(body.warnings).toEqual([]);
  });

  it('returns the warnings a finished job recorded', async () => {
    app = await build();
    const warning = '2 pages were queued but never recorded as fetched or failed.';
    db.state.jobs = [{ ...job(), status: 'completed', warnings: [warning] }];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}` })).json();

    expect(body.warnings).toEqual([warning]);
  });

  it('returns documents with the source url folded into their metadata', async () => {
    app = await build();
    db.state.jobs = [job()];
    db.state.documents = [doc({ url: 'https://example.com/a', final_url: 'https://example.com/a/' })];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}` })).json();

    expect(body.data).toEqual([
      {
        url: 'https://example.com/a',
        markdown: '# A',
        metadata: { title: 'A', sourceUrl: 'https://example.com/a', finalUrl: 'https://example.com/a/' },
      },
    ]);
  });

  it('falls back to the requested url as the final url when there was no redirect', async () => {
    app = await build();
    db.state.jobs = [job()];
    db.state.documents = [doc({ final_url: null })];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}` })).json();

    expect(body.data[0].metadata.finalUrl).toBe('https://example.com/a');
  });

  it('omits the next link when the page is not full', async () => {
    app = await build();
    db.state.jobs = [job()];
    db.state.documents = [doc()];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}` })).json();

    expect(body.next).toBeNull();
  });

  it('offers a next cursor when the page is exactly full, so a caller knows there may be more', async () => {
    app = await build();
    db.state.jobs = [job()];
    db.state.documents = Array.from({ length: 100 }, (_, i) => doc({ url: `https://example.com/${i}` }));

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}` })).json();

    expect(body.next).toBe(`/v1/jobs/${JOB}?cursor=100`);
  });

  it('advances the cursor past the rows already served', async () => {
    app = await build();
    db.state.jobs = [job()];
    db.state.documents = Array.from({ length: 250 }, (_, i) => doc({ url: `https://example.com/${i}` }));

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}?cursor=100` })).json();

    expect(body.data[0].url).toBe('https://example.com/100');
    expect(body.next).toBe(`/v1/jobs/${JOB}?cursor=200`);
  });

  it('rejects a cursor this API did not hand out rather than passing it to the query', async () => {
    app = await build();
    db.state.jobs = [job()];

    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}?cursor=-1` });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('cursor');
    expect(db.state.calls).toHaveLength(0);
  });

  it('rejects a non-numeric cursor', async () => {
    app = await build();
    db.state.jobs = [job()];

    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}?cursor=abc` });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a cursor too large for the column rather than letting Postgres reject it', async () => {
    app = await build();
    db.state.jobs = [job()];

    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}?cursor=9999999999999999` });

    expect(response.statusCode).toBe(400);
  });

  /**
   * `jobs.api_key_id` is populated by crawl and batch, but one operator owns
   * every key, so the read path must not filter on it.
   */
  it('serves a job to a caller whose key did not create it, under self-host', async () => {
    app = await build();
    db.state.jobs = [job({ api_key_id: KEY_B })];

    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}` });

    expect(response.statusCode).toBe(200);
    const select = db.state.calls.find((c) => c.text.includes('SELECT id, type, status'))!;
    expect(select.values).toEqual([JOB]);
    expect(select.text).not.toContain('api_key_id');
  });
});

describe('fetchJobView type scoping', () => {
  it('hides a job of another type behind the same 404 as a missing one', async () => {
    db.state.jobs = [job({ type: 'batch_scrape' })];

    const result = await fetchJobView(JOB, { basePath: '/v1/crawl', type: 'crawl', requestId: 'r1' });

    expect(result.code).toBe(404);
    expect(result.body['error']).toBe('not_found');
  });

  it('serves a job whose type matches the path it was requested under', async () => {
    db.state.jobs = [job({ type: 'crawl' })];

    const result = await fetchJobView(JOB, { basePath: '/v1/crawl', type: 'crawl', requestId: 'r1' });

    expect(result.code).toBe(200);
  });

  it('builds the next link against the path it was served under', async () => {
    db.state.jobs = [job()];
    db.state.documents = Array.from({ length: 100 }, (_, i) => doc({ url: `https://example.com/${i}` }));

    const result = await fetchJobView(JOB, { basePath: '/v1/crawl', requestId: 'r1' });

    expect(result.body['next']).toBe(`/v1/crawl/${JOB}?cursor=100`);
  });
});

describe('DELETE /v1/jobs/:id', () => {
  it('cancels a running job', async () => {
    app = await build();
    db.state.jobs = [job({ status: 'running' })];

    const response = await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: JOB, jobId: JOB, status: 'cancelled' });
    expect(db.state.jobs[0]!.status).toBe('cancelled');
  });

  it('cancels a job that has not started yet', async () => {
    app = await build();
    db.state.jobs = [job({ status: 'queued' })];

    const response = await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });

    expect(response.statusCode).toBe(200);
    expect(db.state.jobs[0]!.status).toBe('cancelled');
  });

  it('drops the queued tasks so cancellation stops the work, not just the label', async () => {
    app = await build();
    db.state.jobs = [job({ status: 'running' })];
    db.state.tasks = [
      { job_id: JOB, status: 'queued' },
      { job_id: JOB, status: 'queued' },
      { job_id: JOB, status: 'completed' },
    ];

    await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });

    expect(db.state.tasks.map((t) => t.status)).toEqual(['cancelled', 'cancelled', 'completed']);
  });

  it('leaves another job’s tasks alone', async () => {
    app = await build();
    db.state.jobs = [job({ status: 'running' })];
    db.state.tasks = [
      { job_id: JOB, status: 'queued' },
      { job_id: OTHER_JOB, status: 'queued' },
    ];

    await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });

    expect(db.state.tasks.find((t) => t.job_id === OTHER_JOB)!.status).toBe('queued');
  });

  it('refuses to cancel a completed job with 409 rather than reporting a no-op as success', async () => {
    app = await build();
    db.state.jobs = [job({ status: 'completed', finished_at: new Date('2026-09-01T11:00:00Z') })];

    const response = await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('not_cancellable');
    expect(db.state.jobs[0]!.status).toBe('completed');
  });

  it('refuses to cancel a failed job', async () => {
    app = await build();
    db.state.jobs = [job({ status: 'failed', error: 'boom' })];

    const response = await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });

    expect(response.statusCode).toBe(409);
    expect(db.state.jobs[0]!.status).toBe('failed');
  });

  it('is not idempotent by design: cancelling twice reports the second as a conflict', async () => {
    app = await build();
    db.state.jobs = [job({ status: 'running' })];

    const first = await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });
    const second = await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
  });

  it('returns 404 for a job that does not exist, distinguishing it from one that cannot be cancelled', async () => {
    app = await build();

    const response = await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });

    expect(response.statusCode).toBe(404);
  });

  it('answers 404 for a malformed id without issuing an UPDATE', async () => {
    app = await build();

    const response = await app.inject({ method: 'DELETE', url: '/v1/jobs/nope' });

    expect(response.statusCode).toBe(404);
    expect(db.state.calls).toHaveLength(0);
  });

  it('does not cancel a job of a different type when the path scopes to one', async () => {
    db.state.jobs = [job({ type: 'batch_scrape', status: 'running' })];

    const result = await cancelJob(JOB, { type: 'crawl', requestId: 'r1' });

    expect(result.code).toBe(404);
    expect(db.state.jobs[0]!.status).toBe('running');
  });

  it('cancels a job created by another key, under self-host', async () => {
    app = await build();
    db.state.jobs = [job({ api_key_id: KEY_B, status: 'running' })];

    const response = await app.inject({ method: 'DELETE', url: `/v1/jobs/${JOB}` });

    expect(response.statusCode).toBe(200);
    expect(db.state.jobs[0]!.status).toBe('cancelled');
  });
});

describe('GET /v1/jobs/:id/errors', () => {
  it('returns 404 for a job that does not exist', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/errors` });

    expect(response.statusCode).toBe(404);
  });

  it('answers 404 for a malformed id without querying', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/jobs/bad-id/errors' });

    expect(response.statusCode).toBe(404);
    expect(db.state.calls).toHaveLength(0);
  });

  it('returns an empty list for a job that failed nothing', async () => {
    app = await build();
    db.state.jobs = [job()];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/errors` })).json();

    expect(body.errors).toEqual([]);
    expect(body.robotsBlocked).toEqual([]);
  });

  it('reports each failure with the tiers that were attempted', async () => {
    app = await build();
    db.state.jobs = [job()];
    db.state.failures = [
      {
        job_id: JOB,
        url: 'https://example.com/x',
        reason: 'timeout',
        detail: 'took too long',
        status_code: null,
        detected_by: ['fetch'],
        tier: 'browser',
        tiers_tried: ['http', 'browser'],
        profile: 'default',
        escalation_available: true,
        occurred_at: new Date('2026-09-01T10:30:00Z'),
      },
    ];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/errors` })).json();

    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatchObject({
      url: 'https://example.com/x',
      reason: 'timeout',
      statusCode: null,
      detectedBy: ['fetch'],
      tiersAttempted: ['http', 'browser'],
      escalationAvailable: true,
    });
  });

  it('lists robots-denied urls separately, which are a policy outcome rather than a fault', async () => {
    app = await build();
    db.state.jobs = [job()];
    db.state.failures = [
      {
        job_id: JOB,
        url: 'https://example.com/private',
        reason: 'robots_denied',
        detail: null,
        status_code: null,
        detected_by: null,
        tier: null,
        tiers_tried: null,
        profile: null,
        escalation_available: false,
        occurred_at: new Date('2026-09-01T10:30:00Z'),
      },
      {
        job_id: JOB,
        url: 'https://example.com/x',
        reason: 'timeout',
        detail: null,
        status_code: null,
        detected_by: null,
        tier: null,
        tiers_tried: null,
        profile: null,
        escalation_available: false,
        occurred_at: new Date('2026-09-01T10:31:00Z'),
      },
    ];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/errors` })).json();

    expect(body.robotsBlocked).toEqual(['https://example.com/private']);
    expect(body.errors).toHaveLength(2);
  });

  it('defaults null array columns to empty lists rather than emitting nulls', async () => {
    app = await build();
    db.state.jobs = [job()];
    db.state.failures = [
      {
        job_id: JOB,
        url: 'https://example.com/x',
        reason: 'timeout',
        detail: null,
        status_code: null,
        detected_by: null,
        tier: null,
        tiers_tried: null,
        profile: null,
        escalation_available: false,
        occurred_at: new Date('2026-09-01T10:30:00Z'),
      },
    ];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/errors` })).json();

    expect(body.errors[0].detectedBy).toEqual([]);
    expect(body.errors[0].tiersAttempted).toEqual([]);
  });

  it('serves the failure list to any key under self-host', async () => {
    app = await build();
    db.state.jobs = [job({ api_key_id: KEY_B })];

    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/errors` });

    expect(response.statusCode).toBe(200);
  });
});

describe('GET /v1/jobs/:id/schema', () => {
  it('returns 404 for a job that does not exist', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/schema` });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });

  it('answers 404 for a malformed id without querying the database', async () => {
    app = await build();

    const response = await app.inject({ method: 'GET', url: '/v1/jobs/not-a-uuid/schema' });

    expect(response.statusCode).toBe(404);
    expect(db.state.calls).toHaveLength(0);
  });

  it('projects formats from the top-level request', async () => {
    app = await build();
    db.state.jobs = [job({ request: { url: 'https://example.com', formats: ['markdown', 'links'] } })];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/schema` })).json();

    expect(body).toEqual({
      id: JOB,
      jobId: JOB,
      formats: ['markdown', 'links'],
      schema: null,
      prompt: null,
    });
  });

  it('falls back to scrapeOptions.formats when the crawl put formats there', async () => {
    app = await build();
    db.state.jobs = [
      job({ request: { url: 'https://example.com', scrapeOptions: { formats: ['json'] } } }),
    ];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/schema` })).json();

    expect(body.formats).toEqual(['json']);
  });

  it('defaults to markdown when the stored request named no formats at all', async () => {
    app = await build();
    db.state.jobs = [job({ request: { url: 'https://example.com' } })];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/schema` })).json();

    expect(body.formats).toEqual(['markdown']);
  });

  it('surfaces the extraction schema and prompt when the request carried jsonOptions', async () => {
    app = await build();
    db.state.jobs = [
      job({
        request: {
          url: 'https://example.com',
          formats: ['json'],
          jsonOptions: { schema: { type: 'object', properties: { title: { type: 'string' } } }, prompt: 'get the title' },
        },
      }),
    ];

    const body = (await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/schema` })).json();

    expect(body.schema).toEqual({ type: 'object', properties: { title: { type: 'string' } } });
    expect(body.prompt).toBe('get the title');
  });

  it('serves the schema of a job created by another key, under self-host', async () => {
    app = await build();
    db.state.jobs = [job({ api_key_id: KEY_B })];

    const response = await app.inject({ method: 'GET', url: `/v1/jobs/${JOB}/schema` });

    expect(response.statusCode).toBe(200);
    const select = db.state.calls.find((c) => c.text.includes('SELECT request FROM jobs'))!;
    expect(select.values).toEqual([JOB]);
    expect(select.text).not.toContain('api_key_id');
  });

  it('fetchJobSchema returns a plain result object outside the route, for direct calls', async () => {
    db.state.jobs = [job({ request: { url: 'https://example.com', formats: ['text'] } })];

    const result = await fetchJobSchema(JOB, { requestId: 'r1' });

    expect(result.code).toBe(200);
    expect(result.body['formats']).toEqual(['text']);
  });
});
