import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract tests. Postgres and URL discovery are replaced with fakes:
 * the point is the request/response surface — aliases, caps, validation and
 * the `/crawl/{jobId}` view — not the crawl itself.
 */

interface Call {
  text: string;
  values: unknown[];
}

const JOB = '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const JOB_2 = '1f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const JOB_9 = '9f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

const db = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    job: undefined as Record<string, unknown> | undefined,
    documents: [] as Record<string, unknown>[],
    cancelled: undefined as { id: string; status: string } | undefined,
    exists: false,
    /** The row POST /crawl { resume } reads, and how many tasks it re-queues. */
    resumable: undefined as Record<string, unknown> | undefined,
    requeued: 0,
  };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    if (text.includes('INSERT INTO jobs')) return { rows: [{ id: JOB }], rowCount: 1 };
    if (text.includes('INSERT INTO job_tasks')) return { rows: [], rowCount: 1 };
    if (text.startsWith('SELECT id, type, status')) return { rows: state.job ? [state.job] : [], rowCount: state.job ? 1 : 0 };
    if (text.includes('FROM documents')) return { rows: state.documents, rowCount: state.documents.length };
    if (text.includes("SET status = 'cancelled'") && text.includes('UPDATE jobs')) {
      return { rows: state.cancelled ? [state.cancelled] : [], rowCount: state.cancelled ? 1 : 0 };
    }
    if (text.startsWith('SELECT 1 FROM jobs')) return { rows: [], rowCount: state.exists ? 1 : 0 };
    if (text.includes('SELECT api_key_id, status, request, expires_at')) {
      return { rows: state.resumable ? [state.resumable] : [], rowCount: state.resumable ? 1 : 0 };
    }
    if (text.includes('UPDATE job_tasks')) return { rows: [], rowCount: state.requeued };
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

const discoverUrls = vi.hoisted(() => vi.fn());
vi.mock('./map.js', () => ({ discoverUrls }));

import { registerCrawl } from './crawl.js';
import type { ApiKey } from '../core/api-keys.js';

const KEY_A = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function buildApp(
  limits?: { defaultLimit?: number; maxLimit?: number; maxDepth?: number; respectRobots?: boolean },
  options: { caller?: string } = {},
) {
  const app = Fastify();
  const caller = options.caller ?? KEY_A;
  app.addHook('onRequest', async (request) => {
    request.apiKey = { id: caller } as ApiKey;
  });
  return app
    .register(
      async (instance) => {
        await registerCrawl(instance, {
          fetchClient: {} as never,
          extractClient: {} as never,
          userAgent: 'HelixBot/test',
          defaultModel: 'test-model',
          limits,
        });
      },
      { prefix: '/v1' },
    )
    .then(() => app);
}

function storedRequest(): Record<string, unknown> {
  const insert = db.state.calls.find((call) => call.text.includes('INSERT INTO jobs'));
  return JSON.parse(String(insert?.values[1])) as Record<string, unknown>;
}

beforeEach(() => {
  db.state.calls = [];
  db.state.job = undefined;
  db.state.documents = [];
  db.state.cancelled = undefined;
  db.state.exists = false;
  db.state.resumable = undefined;
  db.state.requeued = 0;
  discoverUrls.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /v1/crawl', () => {
  /* The seed is the caller's choice of what this instance connects to, and it
     is written to the frontier for a worker to fetch later. Without the guard
     the job is accepted and the SSRF happens out of band, in the worker. */
  it('refuses a private or link-local seed, and queues nothing', async () => {
    const app = await buildApp();

    for (const url of ['http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/']) {
      const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url } });

      expect(response.statusCode).toBe(400);
      expect(response.json().field).toBe('url');
    }
    expect(db.state.calls.filter((call) => call.text.includes('INSERT INTO job_tasks'))).toHaveLength(0);
    expect(db.state.calls.filter((call) => call.text.includes('INSERT INTO jobs'))).toHaveLength(0);
  });

  it('takes respectRobots from the instance configuration when the request omits it', async () => {
    const app = await buildApp({ respectRobots: false });
    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com' } });

    expect(response.statusCode).toBe(202);
    expect(storedRequest().respectRobots).toBe(false);
  });

  it('lets the request override the configured respectRobots default', async () => {
    const app = await buildApp({ respectRobots: false });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', respectRobots: true },
    });

    expect(response.statusCode).toBe(202);
    expect(storedRequest().respectRobots).toBe(true);
  });

  it('defaults respectRobots to true when the instance configures nothing', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com' } });

    expect(storedRequest().respectRobots).toBe(true);
  });

  it('accepts a crawl and answers with the job under /v1/crawl/{jobId}', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com' } });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ success: true, id: JOB, jobId: JOB, url: `/v1/crawl/${JOB}` });

    const seed = db.state.calls.find((call) => call.text.includes('INSERT INTO job_tasks'));
    expect(seed?.values).toEqual([JOB, 'https://example.com', 'https://example.com::0']);
  });

  it('applies the operator default limit and rejects a request above the ceiling', async () => {
    const app = await buildApp({ defaultLimit: 250, maxLimit: 500, maxDepth: 3 });

    await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com' } });
    expect(storedRequest()['limit']).toBe(250);

    const tooMany = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com', limit: 501 } });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json()).toMatchObject({ error: 'invalid_request', field: 'limit' });

    const tooDeep = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com', maxDepth: 4 } });
    expect(tooDeep.statusCode).toBe(400);
    expect(tooDeep.json()).toMatchObject({ field: 'maxDepth' });
  });

  it('rejects a missing or malformed url with the field named', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'not a url' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request', field: 'url' });
    expect(response.json().requestId).toBeDefined();
  });

  it('normalises the spec aliases into the worker shape', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: {
        url: 'https://example.com',
        allowExternalLinks: true,
        includePaths: ['/blog/*'],
        excludePaths: ['/blog/tag/*'],
        scrapeOptions: { formats: ['markdown', 'links'], onlyMainContent: false },
        webhook: 'https://myapp.example/webhooks/helix',
      },
    });

    const stored = storedRequest();
    expect(stored).toMatchObject({
      allowExternal: true,
      includePaths: ['/blog/*'],
      excludePaths: ['/blog/tag/*'],
      formats: ['markdown', 'links'],
      onlyMainContent: false,
      tier: 'auto',
      webhook: { url: 'https://myapp.example/webhooks/helix' },
    });
    expect(stored).not.toHaveProperty('allowExternalLinks');
    expect(stored).not.toHaveProperty('scrapeOptions');
    expect(stored).not.toHaveProperty('estimate');
  });

  it('keeps the object form of webhook with its event filter', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: {
        url: 'https://example.com',
        webhook: { url: 'https://myapp.example/hook', events: ['page', 'completed'], headers: { 'x-a': '1' }, metadata: { k: 'v' } },
      },
    });

    expect(storedRequest()['webhook']).toEqual({
      url: 'https://myapp.example/hook',
      events: ['page', 'completed'],
      headers: { 'x-a': '1' },
      metadata: { k: 'v' },
    });
  });

  it('rejects a webhook that points at the deployment network', async () => {
    const app = await buildApp();
    for (const url of [
      'http://localhost:7401/',
      'http://127.0.0.1:7400/v1/internal/keys',
      'http://helix-extract:7402/',
      'http://169.254.169.254/latest/meta-data/',
      'ftp://myapp.example/hook',
    ]) {
      const bare = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com', webhook: url } });
      expect(bare.statusCode, url).toBe(400);
      expect(bare.json().field, url).toBe('webhook');

      const object = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com', webhook: { url } } });
      expect(object.statusCode, url).toBe(400);
      expect(object.json().field, url).toBe('webhook.url');
    }
    expect(db.state.calls).toHaveLength(0);
  });

  it('rejects webhook headers fetch would refuse or Helix reserves', async () => {
    const app = await buildApp();
    for (const headers of [{ 'bad header': 'x' }, { 'x-a': 'a\nb' }, { 'content-type': 'text/plain' }, { 'helix-signature': 'x' }]) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/crawl',
        payload: { url: 'https://example.com', webhook: { url: 'https://myapp.example/hook', headers } },
      });
      expect(response.statusCode, JSON.stringify(headers)).toBe(400);
      expect(response.json().field).toBe('webhook.headers');
    }
  });

  it('bounds webhook metadata, which is copied into every delivery', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', webhook: { url: 'https://myapp.example/hook', metadata: { blob: 'x'.repeat(5_000) } } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('webhook.metadata');
  });

  it('rejects an unknown webhook event', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', webhook: { url: 'https://myapp.example/hook', events: ['finished'] } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toContain('webhook');
  });

  it('stores a destination with its defaults applied', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', destination: { type: 'qdrant', collection: 'docs' } },
    });

    expect(storedRequest()['destination']).toEqual({
      type: 'qdrant',
      collection: 'docs',
      upsertMode: 'update-in-place',
    });
  });

  it('keeps an explicit append upsertMode and a namespace', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: {
        url: 'https://example.com',
        destination: { type: 'pgvector', namespace: 'tenant-1', upsertMode: 'append' },
      },
    });

    expect(storedRequest()['destination']).toEqual({
      type: 'pgvector',
      namespace: 'tenant-1',
      upsertMode: 'append',
    });
  });

  it('rejects a destination with an unsupported type', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', destination: { type: 'pinecone' } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('destination.type');
  });

  it('omits destination from the stored request when none is given', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com' } });

    expect(storedRequest()).not.toHaveProperty('destination');
  });

  it('rejects a path pattern that is neither a glob nor a valid regular expression', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', includePaths: ['/docs/*'], excludePaths: ['[unclosed'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request', field: 'excludePaths.0' });
    expect(db.state.calls).toHaveLength(0);
  });

  it('returns an estimate without creating a job', async () => {
    discoverUrls.mockResolvedValue({
      links: [{ url: 'https://example.com/' }, { url: 'https://example.com/a' }, { url: 'https://example.com/b' }],
      truncated: false,
    });
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', estimate: true, limit: 2 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      pages: 2,
      tierBreakdown: { tls: 2 },
      estimatedProviderCost: { amount: 0, model: 'none' },
    });
    expect(response.json().assumptions[0]).toBe('2 pages discovered');
    expect(db.state.calls).toHaveLength(0);
  });

  // openapi.yaml has always declared these as the closed Format enum. Validating
  // as a bare string accepted a name nothing serves, then dropped it per page,
  // which reads as the format silently not working.
  it('rejects a format outside the published set instead of dropping it later', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', scrapeOptions: { formats: ['summary'] } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request' });
    expect(response.json().requestId).toEqual(expect.any(String));
  });

  it('rejects an unknown format given at the top level too', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', formats: ['pdf'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('prices the model in when a format needs one', async () => {
    discoverUrls.mockResolvedValue({ links: [{ url: 'https://example.com/' }], truncated: false });
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: {
        url: 'https://example.com',
        estimate: true,
        scrapeOptions: { formats: ['json'], jsonOptions: { prompt: 'the page title' } },
      },
    });

    expect(response.json().estimatedProviderCost).toEqual({ amount: null, currency: 'USD', model: 'test-model' });
    expect(response.json().estimatedTokens.input).toBeGreaterThan(0);
  });

  it('rejects json without a schema or a prompt, rather than dropping it per page', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', scrapeOptions: { formats: ['json'] } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('scrapeOptions.jsonOptions');
  });
});

describe('GET /v1/crawl/{jobId}', () => {
  it('answers 404 for an unknown job', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: `/v1/crawl/${JOB_9}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });

  it('answers 404 for an id that is not a uuid without asking the database', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/v1/crawl/not-a-uuid' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
    expect(db.state.calls).toHaveLength(0);
  });

  it('answers 400 for a cursor it did not hand out', async () => {
    db.state.job = { id: JOB, type: 'crawl', status: 'running', total: 1, completed: 1, failed: 0, usage: {}, error: null };
    const app = await buildApp();
    for (const cursor of ['-5', '99999999999999999999', 'abc', '1.5']) {
      const response = await app.inject({ method: 'GET', url: `/v1/crawl/${JOB}?cursor=${cursor}` });
      expect(response.statusCode, cursor).toBe(400);
      expect(response.json()).toMatchObject({ error: 'invalid_request', field: 'cursor' });
    }
    expect(db.state.calls.some((call) => call.text.includes('FROM documents'))).toBe(false);
  });

  it('returns the job with its documents, each carrying its url', async () => {
    db.state.job = {
      id: JOB,
      type: 'crawl',
      status: 'running',
      total: 10,
      completed: 1,
      failed: 0,
      usage: {},
      error: null,
      created_at: new Date('2026-08-24T00:00:00Z'),
      started_at: new Date('2026-08-24T00:00:01Z'),
      finished_at: null,
      expires_at: new Date('2026-08-31T00:00:00Z'),
    };
    db.state.documents = [
      { url: 'https://example.com/a', final_url: 'https://example.com/a/', content: { markdown: '# A' }, metadata: { title: 'A' } },
    ];
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: `/v1/crawl/${JOB}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: JOB,
      jobId: JOB,
      status: 'running',
      total: 10,
      completed: 1,
      data: [
        {
          url: 'https://example.com/a',
          markdown: '# A',
          metadata: { title: 'A', sourceUrl: 'https://example.com/a', finalUrl: 'https://example.com/a/' },
        },
      ],
    });
    expect(response.json().next).toBeNull();
  });

  it('points the next cursor back at /v1/crawl', async () => {
    db.state.job = { id: JOB, type: 'crawl', status: 'running', total: 500, completed: 200, failed: 0, usage: {}, error: null };
    db.state.documents = Array.from({ length: 100 }, (_, i) => ({
      url: `https://example.com/${i}`,
      final_url: null,
      content: {},
      metadata: {},
    }));
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: `/v1/crawl/${JOB}?cursor=100` });

    expect(response.json().next).toBe(`/v1/crawl/${JOB}?cursor=200`);
  });

  it('does not serve a job of another type under the crawl path', async () => {
    db.state.job = { id: JOB_2, type: 'batch_scrape', status: 'running' };
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: `/v1/crawl/${JOB_2}` });

    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /v1/crawl/{jobId}', () => {
  it('cancels a running crawl and drops its queued tasks', async () => {
    db.state.cancelled = { id: JOB, status: 'cancelled' };
    const app = await buildApp();
    const response = await app.inject({ method: 'DELETE', url: `/v1/crawl/${JOB}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: JOB, jobId: JOB, status: 'cancelled' });
    expect(db.state.calls.some((call) => call.text.includes('UPDATE job_tasks'))).toBe(true);
  });

  it('answers 404 for an id that is not a uuid', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'DELETE', url: '/v1/crawl/not-a-uuid' });

    expect(response.statusCode).toBe(404);
    expect(db.state.calls).toHaveLength(0);
  });

  it('answers 409 when the crawl already finished and 404 when it never existed', async () => {
    const app = await buildApp();

    db.state.exists = true;
    const finished = await app.inject({ method: 'DELETE', url: `/v1/crawl/${JOB}` });
    expect(finished.statusCode).toBe(409);
    expect(finished.json()).toMatchObject({ error: 'not_cancellable' });

    db.state.exists = false;
    const missing = await app.inject({ method: 'DELETE', url: `/v1/crawl/${JOB_9}` });
    expect(missing.statusCode).toBe(404);
  });
});

/**
 * `/crawl/{jobId}` serves the same rows as `/jobs/{id}`: one operator owns
 * every key, so neither statement carries an owner predicate.
 */
describe('crawl job reads', () => {
  it('leaves both statements unscoped', async () => {
    const app = await buildApp();

    await app.inject({ method: 'GET', url: `/v1/crawl/${JOB}` });
    await app.inject({ method: 'DELETE', url: `/v1/crawl/${JOB}` });

    const select = db.state.calls.find((c) => c.text.startsWith('SELECT id, type, status'))!;
    const update = db.state.calls.find((c) => c.text.startsWith('UPDATE jobs'))!;
    expect(select.text).not.toContain('api_key_id');
    expect(update.text).not.toContain('api_key_id');
    await app.close();
  });
});

describe('crawl expansion', () => {
  const future = () => new Date(Date.now() + 86_400_000);

  it('re-queues a cancelled job and keeps its id', async () => {
    db.state.resumable = { api_key_id: null, status: 'cancelled', request: {}, expires_at: future() };
    db.state.requeued = 37;
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { resume: JOB } });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ id: JOB, status: 'queued', resumed: true, requeued: 37 });
  });

  it('refuses to resume a job that has nothing left queued', async () => {
    db.state.resumable = { api_key_id: null, status: 'cancelled', request: {}, expires_at: future() };
    db.state.requeued = 0;
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { resume: JOB } });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('nothing_to_resume');
  });

  it('refuses to resume a job whose queue has expired', async () => {
    db.state.resumable = {
      api_key_id: null,
      status: 'cancelled',
      request: {},
      expires_at: new Date(Date.now() - 1000),
    };
    db.state.requeued = 5;
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { resume: JOB } });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('expired');
  });

  it('refuses to resume a job that is still running', async () => {
    // An unexpired lease is the evidence a worker is alive and holding it.
    db.state.resumable = {
      api_key_id: null,
      status: 'running',
      request: {},
      expires_at: future(),
      lease_expires_at: new Date(Date.now() + 60_000),
    };
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { resume: JOB } });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('already_running');
  });

  /* A worker killed with -9 leaves the job at 'running' with a lease nobody
   * renews. Refusing that as already_running is what made the strand
   * permanent: the worker will not re-claim a 'running' row either, so the
   * job had no way back. See 012_job_leases.sql. */
  it('resumes a running job whose lease has lapsed', async () => {
    db.state.resumable = {
      api_key_id: null,
      status: 'running',
      request: {},
      expires_at: future(),
      lease_expires_at: new Date(Date.now() - 60_000),
    };
    db.state.requeued = 12;
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { resume: JOB } });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ id: JOB, status: 'queued', resumed: true, requeued: 12 });
  });

  it('rejects url and resume together rather than guessing which seed wins', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', resume: JOB },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('resume');
  });

  it('requires a url when no job is being resumed', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { limit: 10 } });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('url');
  });

  it('estimates from its own route without submitting a job', async () => {
    discoverUrls.mockResolvedValue({
      links: [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }],
      truncated: false,
    });
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl/estimate',
      payload: { url: 'https://example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().pages).toBe(2);
    expect(db.state.calls.some((c) => c.text.includes('INSERT INTO jobs'))).toBe(false);
  });

  it('does not route "estimate" as a job id', async () => {
    discoverUrls.mockResolvedValue({ links: [], truncated: false });
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl/estimate',
      payload: { url: 'https://example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('assumptions');
  });

  it('carries changesOnly, the content filters and the path cap to the worker', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: {
        url: 'https://example.com',
        changesOnly: true,
        includeContent: ['pricing'],
        excludeContent: ['^Sign in'],
        maxPagesPerPath: 25,
      },
    });

    expect(response.statusCode).toBe(202);
    const insert = db.state.calls.find((c) => c.text.includes('INSERT INTO jobs'));
    const stored = JSON.parse(insert!.values[1] as string);
    expect(stored).toMatchObject({
      changesOnly: true,
      includeContent: ['pricing'],
      excludeContent: ['^Sign in'],
      maxPagesPerPath: 25,
    });
    // changesOnly filters on hashes the crawl must have loaded to compare.
    expect(stored.incremental).toBe(true);
  });

  it('carries a site-wide json schema to the worker', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: {
        url: 'https://example.com',
        scrapeOptions: {
          formats: ['markdown', 'json'],
          jsonOptions: { schema: { type: 'object', properties: { price: { type: 'number' } } } },
        },
      },
    });

    expect(response.statusCode).toBe(202);
    const insert = db.state.calls.find((c) => c.text.includes('INSERT INTO jobs'));
    const stored = JSON.parse(insert!.values[1] as string);
    expect(stored.jsonOptions.schema).toEqual({ type: 'object', properties: { price: { type: 'number' } } });
  });

  it('rejects a content pattern that is neither a glob nor a regular expression', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', excludePaths: ['('] },
    });

    expect(response.statusCode).toBe(400);
  });
});
