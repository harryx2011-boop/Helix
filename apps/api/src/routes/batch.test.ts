import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Batch route contract. Postgres is a fake: what matters here is the request
 * surface, that every URL is seeded rather than discovered, and that the job
 * request the worker will read cannot follow a link.
 */

interface Call {
  text: string;
  values: unknown[];
}

const JOB = '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

const db = vi.hoisted(() => {
  const state = { calls: [] as Call[], job: undefined as Record<string, unknown> | undefined };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    if (text.includes('INSERT INTO jobs')) return { rows: [{ id: JOB }], rowCount: 1 };
    if (text.includes('INSERT INTO job_tasks')) return { rows: [], rowCount: 1 };
    if (text.startsWith('SELECT id, type, status')) return { rows: state.job ? [state.job] : [], rowCount: state.job ? 1 : 0 };
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

import { registerBatch } from './batch.js';
import type { ApiKey } from '../core/api-keys.js';

const KEY_A = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

async function buildApp(limits?: { maxUrls?: number }, options: { caller?: string } = {}) {
  const app = Fastify();
  const caller = options.caller ?? KEY_A;
  app.addHook('onRequest', async (request) => {
    request.apiKey = { id: caller } as ApiKey;
  });
  await app.register(
    async (instance) =>
      registerBatch(instance, {
        limits,
        resolveHost: async (host) => (host.endsWith('.rebind.test') ? ['127.0.0.1'] : ['93.184.216.34']),
      }),
    { prefix: '/v1' },
  );
  await app.ready();
  return app;
}

function storedRequest(): Record<string, unknown> {
  const insert = db.state.calls.find((c) => c.text.includes('INSERT INTO jobs'));
  return JSON.parse(String(insert?.values[1])) as Record<string, unknown>;
}

function seededUrls(): string[] {
  const insert = db.state.calls.find((c) => c.text.includes('INSERT INTO job_tasks'));
  return (insert?.values.slice(1) ?? []) as string[];
}

beforeEach(() => {
  db.state.calls = [];
  db.state.job = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /v1/batch/scrape egress check', () => {
  it.each(['http://127.0.0.1:7410/settings', 'http://169.254.169.254/', 'http://app.rebind.test:7410/settings'])(
    'refuses %s before any job is created',
    async (url) => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/v1/batch/scrape',
        payload: { urls: ['https://a.example/x', url] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().field).toBe('urls');
      expect(db.state.calls.some((c) => c.text.includes('INSERT INTO jobs'))).toBe(false);
    },
  );
});

describe('POST /v1/batch/scrape', () => {
  it('accepts a list and answers with the job under /v1/batch/scrape/{jobId}', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://a.example/x', 'https://b.example/y'] },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ success: true, jobId: JOB, total: 2, url: `/v1/batch/scrape/${JOB}` });
  });

  it('seeds every URL, not just the first', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://a.example/x', 'https://b.example/y', 'https://c.example/z'] },
    });

    expect(seededUrls()).toEqual(['https://a.example/x', 'https://b.example/y', 'https://c.example/z']);
  });

  // The worker claims and completes rows by the frontier's normalised URL; a
  // raw `https://example.com` row matched nothing and its page was dropped.
  it('seeds each URL in the form the frontier claims it by', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://example.com', 'https://docs.python.org/3/', 'https://docs.python.org/3'] },
    });

    expect(response.json()).toMatchObject({ total: 2 });
    expect(seededUrls()).toEqual(['https://example.com/', 'https://docs.python.org/3/']);
  });

  it('records the job as batch_scrape so a crawl view cannot claim it', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/v1/batch/scrape', payload: { urls: ['https://a.example/x'] } });

    const insert = db.state.calls.find((c) => c.text.includes('INSERT INTO jobs'));
    expect(insert?.text).toContain('batch_scrape');
  });

  it('builds a job request that cannot follow a link', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://a.example/x', 'https://b.example/y'] },
    });

    const stored = storedRequest();
    // maxDepth 0 rejects every discovered link as too deep; skipping the sitemap
    // stops the other source of URLs the caller did not ask for.
    expect(stored).toMatchObject({ maxDepth: 0, sitemap: 'skip', allowExternal: true, limit: 2 });
  });

  it('drops a duplicate rather than counting it twice', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://a.example/x', 'https://a.example/x'] },
    });

    expect(response.json()).toMatchObject({ total: 1 });
    expect(seededUrls()).toEqual(['https://a.example/x']);
  });

  it('passes scrape options through to the job', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://a.example/x'], scrapeOptions: { formats: ['html'], tier: 'chromium' } },
    });

    expect(storedRequest()).toMatchObject({ formats: ['html'], tier: 'chromium' });
  });

  // Same closed set as /scrape and /crawl; openapi declares it as the Format enum.
  it('rejects a format outside the published set', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://a.example/x'], scrapeOptions: { formats: ['summary'] } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request' });
  });
});

describe('batch validation', () => {
  it('rejects an empty list', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/v1/batch/scrape', payload: { urls: [] } });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a batch over the configured ceiling', async () => {
    const app = await buildApp({ maxUrls: 2 });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://a.example/1', 'https://a.example/2', 'https://a.example/3'] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects the whole batch when a URL is unparseable', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://a.example/x', 'not a url'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ invalidURLs: ['not a url'] });
  });

  it('skips the bad ones and reports them when asked to', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['https://a.example/x', 'not a url'], ignoreInvalidURLs: true },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ total: 1, invalidURLs: ['not a url'] });
  });

  it('refuses a batch left with nothing valid', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['not a url'], ignoreInvalidURLs: true },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a non-http scheme', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/batch/scrape',
      payload: { urls: ['file:///etc/passwd'] },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /v1/batch/scrape/:id', () => {
  it('answers 404 for a crawl job on the batch path', async () => {
    db.state.job = { id: JOB, type: 'crawl', status: 'completed', total: 1, completed: 1, failed: 0, usage: {}, error: null };
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: `/v1/batch/scrape/${JOB}` });

    expect(response.statusCode).toBe(404);
  });

  it('answers 404 for an id that is not a uuid', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/v1/batch/scrape/not-a-uuid' });

    expect(response.statusCode).toBe(404);
  });
});

/**
 * `/batch/scrape/{id}` serves the same rows as `/jobs/{id}`: one operator owns
 * every key, so neither statement carries an owner predicate.
 */
describe('batch job reads', () => {
  it('leaves both statements unscoped', async () => {
    const app = await buildApp();

    await app.inject({ method: 'GET', url: `/v1/batch/scrape/${JOB}` });
    await app.inject({ method: 'DELETE', url: `/v1/batch/scrape/${JOB}` });

    const select = db.state.calls.find((c) => c.text.startsWith('SELECT id, type, status'))!;
    const update = db.state.calls.find((c) => c.text.startsWith('UPDATE jobs'))!;
    expect(select.text).not.toContain('api_key_id');
    expect(update.text).not.toContain('api_key_id');
    await app.close();
  });
});
