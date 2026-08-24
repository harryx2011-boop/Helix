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

const db = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    job: undefined as Record<string, unknown> | undefined,
    documents: [] as Record<string, unknown>[],
    cancelled: undefined as { id: string; status: string } | undefined,
    exists: false,
  };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    if (text.includes('INSERT INTO jobs')) return { rows: [{ id: 'job-1' }], rowCount: 1 };
    if (text.includes('INSERT INTO job_tasks')) return { rows: [], rowCount: 1 };
    if (text.startsWith('SELECT id, type, status')) return { rows: state.job ? [state.job] : [], rowCount: state.job ? 1 : 0 };
    if (text.includes('FROM documents')) return { rows: state.documents, rowCount: state.documents.length };
    if (text.includes("SET status = 'cancelled'") && text.includes('UPDATE jobs')) {
      return { rows: state.cancelled ? [state.cancelled] : [], rowCount: state.cancelled ? 1 : 0 };
    }
    if (text.startsWith('SELECT 1 FROM jobs')) return { rows: [], rowCount: state.exists ? 1 : 0 };
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

const discoverUrls = vi.hoisted(() => vi.fn());
vi.mock('./map.js', () => ({ discoverUrls }));

import { registerCrawl } from './crawl.js';

function buildApp(limits?: { defaultLimit?: number; maxLimit?: number; maxDepth?: number }) {
  const app = Fastify();
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
  discoverUrls.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /v1/crawl', () => {
  it('accepts a crawl and answers with the job under /v1/crawl/{jobId}', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/v1/crawl', payload: { url: 'https://example.com' } });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ success: true, id: 'job-1', jobId: 'job-1', url: '/v1/crawl/job-1' });

    const seed = db.state.calls.find((call) => call.text.includes('INSERT INTO job_tasks'));
    expect(seed?.values).toEqual(['job-1', 'https://example.com', 'https://example.com::0']);
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

  it('prices the model in when a format needs one', async () => {
    discoverUrls.mockResolvedValue({ links: [{ url: 'https://example.com/' }], truncated: false });
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/crawl',
      payload: { url: 'https://example.com', estimate: true, scrapeOptions: { formats: ['json'] } },
    });

    expect(response.json().estimatedProviderCost).toEqual({ amount: null, currency: 'USD', model: 'test-model' });
    expect(response.json().estimatedTokens.input).toBeGreaterThan(0);
  });
});

describe('GET /v1/crawl/{jobId}', () => {
  it('answers 404 for an unknown job', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/v1/crawl/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });

  it('returns the job with its documents, each carrying its url', async () => {
    db.state.job = {
      id: 'job-1',
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
    const response = await app.inject({ method: 'GET', url: '/v1/crawl/job-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'job-1',
      jobId: 'job-1',
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
    expect(response.json().next).toBeUndefined();
  });

  it('points the next cursor back at /v1/crawl', async () => {
    db.state.job = { id: 'job-1', type: 'crawl', status: 'running', total: 500, completed: 200, failed: 0, usage: {}, error: null };
    db.state.documents = Array.from({ length: 100 }, (_, i) => ({
      url: `https://example.com/${i}`,
      final_url: null,
      content: {},
      metadata: {},
    }));
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/v1/crawl/job-1?cursor=100' });

    expect(response.json().next).toBe('/v1/crawl/job-1?cursor=200');
  });

  it('does not serve a job of another type under the crawl path', async () => {
    db.state.job = { id: 'job-2', type: 'batch_scrape', status: 'running' };
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/v1/crawl/job-2' });

    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /v1/crawl/{jobId}', () => {
  it('cancels a running crawl and drops its queued tasks', async () => {
    db.state.cancelled = { id: 'job-1', status: 'cancelled' };
    const app = await buildApp();
    const response = await app.inject({ method: 'DELETE', url: '/v1/crawl/job-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 'job-1', jobId: 'job-1', status: 'cancelled' });
    expect(db.state.calls.some((call) => call.text.includes('UPDATE job_tasks'))).toBe(true);
  });

  it('answers 409 when the crawl already finished and 404 when it never existed', async () => {
    const app = await buildApp();

    db.state.exists = true;
    const finished = await app.inject({ method: 'DELETE', url: '/v1/crawl/job-1' });
    expect(finished.statusCode).toBe(409);
    expect(finished.json()).toMatchObject({ error: 'not_cancellable' });

    db.state.exists = false;
    const missing = await app.inject({ method: 'DELETE', url: '/v1/crawl/job-9' });
    expect(missing.statusCode).toBe(404);
  });
});
