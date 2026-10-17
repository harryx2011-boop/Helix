import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerExtract, type ExtractRouteDeps } from './extract.js';
import { StructuredError, type ExtractClient } from '../extract/client.js';
import type { FetchClient } from '../fetch/client.js';
import type { BrowserPool } from '../browser/pool.js';

/**
 * The rule worth testing here is the one that distinguishes this endpoint from
 * a model call with a schema attached: a field the page does not support is
 * dropped and reported, never returned as though it were read.
 */

interface StructuredStub {
  data?: Record<string, unknown>;
  sources?: Record<string, unknown>[];
  error?: Error;
}

/**
 * Carries both methods the route reaches for: `extract` (the pipeline's own
 * text extraction) and `structured` (the model step). Built together rather
 * than merged later — spreading a stub to override one method is what silently
 * dropped the other.
 */
function extractClient(stub: StructuredStub = {}): ExtractClient {
  return {
    extract: vi.fn(async () => ({
      markdown: '# Pricing\n\nThe Pro plan is $79 per month, billed monthly.',
      text: 'The Pro plan is $79 per month, billed monthly.',
      title: 'Pricing',
      language: 'en',
      links: [],
      extractorUsed: 'trafilatura',
      contentHash: 'abc',
    })),
    structured: vi.fn(async () => {
      if (stub.error) throw stub.error;
      return {
        data: stub.data ?? { plan: 'Pro', monthlyPrice: 79 },
        sources: stub.sources ?? [
          { field: 'plan', span: [10, 13] },
          { field: 'monthlyPrice', span: [20, 22] },
        ],
        tokensInput: 100,
        tokensOutput: 20,
        modelUsed: 'test-model',
        blocksKept: 8,
        blocksTotal: 10,
      };
    }),
    health: vi.fn(async () => true),
  } as unknown as ExtractClient;
}

const PAGE =
  '<html><body><h1>Pricing</h1><p>The Pro plan is $79 per month, billed monthly, ' +
  'with everything in Starter plus priority support and a higher rate limit.</p></body></html>';

/** Answers every fetch with the same readable page, so the pipeline succeeds. */
function fetchClient(): FetchClient {
  return {
    fetch: vi.fn(async () => ({
      success: true,
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: PAGE,
      timingMs: 5,
    })),
    health: vi.fn(async () => true),
  } as unknown as FetchClient;
}

/**
 * Present so an escalation has somewhere to go. The pipeline escalates on
 * evidence, and a short fixture page can read as a block; without a pool that
 * becomes `no browser pool is configured` and the row is lost for a reason
 * that has nothing to do with what these tests are checking.
 */
function browserPool(): BrowserPool {
  return {
    render: vi.fn(async () => ({
      html: PAGE,
      status: 200,
      headers: {},
      finalUrl: 'https://example.com/pricing',
      timingMs: 20,
    })),
    stats: () => ({ browsers: 1, activeContexts: 0, pagesServed: 1, engines: ['chromium' as const] }),
    close: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
  } as unknown as BrowserPool;
}

let app: FastifyInstance | undefined;

async function build(over: Partial<ExtractRouteDeps> = {}): Promise<FastifyInstance> {
  const deps = {
    fetchClient: fetchClient(),
    browserPool: browserPool(),
    extractClient: extractClient(),
    resolveHost: async () => ['93.184.216.34'],
    ...over,
  } as ExtractRouteDeps;

  app = Fastify();
  await registerExtract(app, deps);
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('POST /extract', () => {
  it('requires a schema or a prompt', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: { urls: ['https://example.com/pricing'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('schema');
  });

  it('rejects a private url before fetching it', async () => {
    const instance = await build({ resolveHost: async () => ['127.0.0.1'] });

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: { urls: ['https://internal.example'], prompt: 'anything' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('urls.0');
  });

  it('returns a row with its source spans and block counts', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: { urls: ['https://example.com/pricing'], prompt: 'the plan and its price' },
    });

    expect(response.statusCode).toBe(200);
    const [row] = response.json().data;
    expect(row).toMatchObject({ plan: 'Pro', monthlyPrice: 79 });
    expect(row._source.url).toBe('https://example.com/pricing');
    expect(row._source.blocksKept).toBe(8);
    expect(row._source.blocksTotal).toBe(10);
  });

  it('drops a field no source span supports and reports why', async () => {
    const instance = await build({
      extractClient: extractClient({
        data: { plan: 'Pro', monthlyPrice: 79, seatLimit: 25 },
        sources: [
          { field: 'plan', span: [10, 13] },
          { field: 'monthlyPrice', span: [20, 22] },
        ],
      }),
    });

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: { urls: ['https://example.com/pricing'], prompt: 'the plan, price and seat limit' },
    });

    const body = response.json();
    expect(body.data[0]).not.toHaveProperty('seatLimit');
    expect(body.dropped).toEqual([
      { url: 'https://example.com/pricing', field: 'seatLimit', reason: 'no grounding span in source' },
    ]);
  });

  it('keeps an ungrounded field when the caller opts in, and still reports it', async () => {
    const instance = await build({
      extractClient: extractClient({
        data: { plan: 'Pro', seatLimit: 25 },
        sources: [{ field: 'plan', span: [10, 13] }],
      }),
    });

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: {
        urls: ['https://example.com/pricing'],
        prompt: 'the plan and seat limit',
        allowUngrounded: true,
      },
    });

    const body = response.json();
    expect(body.data[0].seatLimit).toBe(25);
    expect(body.dropped).toHaveLength(1);
  });

  it('keeps every field when the extractor returns no spans, and says grounding was unavailable', async () => {
    const instance = await build({
      extractClient: extractClient({ data: { plan: 'Pro' }, sources: [] }),
    });

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: { urls: ['https://example.com/pricing'], prompt: 'the plan' },
    });

    const body = response.json();
    expect(body.data[0].plan).toBe('Pro');
    expect(body.dropped).toHaveLength(0);
    expect(body.warnings[0]).toContain('no source spans');
  });

  it('stops on an invalid schema rather than repeating the same failure per url', async () => {
    const instance = await build({
      extractClient: extractClient({
        error: new StructuredError(400, 'schema: "type" must be one of the JSON Schema types', 'schema'),
      }),
    });

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: {
        urls: ['https://example.com/a', 'https://example.com/b'],
        schema: { type: 'nonsense' },
      },
    });

    expect(response.statusCode).toBe(400);
    // A named field makes it the caller's request that is wrong, which is the
    // same distinction /scrape draws; an unnamed one is `invalid_schema`.
    expect(response.json().error).toBe('invalid_request');
    expect(response.json().field).toBe('schema');
    // One 400, not one per URL.
    expect(response.json().message).toContain('JSON Schema types');
  });

  it('reports a model failure as a warning and keeps the rows it did get', async () => {
    const client = extractClient();
    let calls = 0;
    (client as unknown as { structured: unknown }).structured = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('provider timed out');
      return {
        data: { plan: 'Pro' },
        sources: [{ field: 'plan', span: [10, 13] }],
        tokensInput: 100,
        tokensOutput: 20,
        modelUsed: 'test-model',
        blocksKept: 8,
        blocksTotal: 10,
      };
    });

    const instance = await build({ extractClient: client });

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: { urls: ['https://example.com/a', 'https://example.com/b'], prompt: 'the plan' },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.warnings.some((w: string) => w.includes('provider timed out'))).toBe(true);
    expect(body.usage.urls).toBe(2);
    expect(body.usage.rows).toBe(1);
  });

  it('refuses more urls than the per-request ceiling', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: {
        urls: Array.from({ length: 26 }, (_, i) => `https://example.com/${i}`),
        prompt: 'anything',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('urls');
  });
});

describe('POST /extract concurrency', () => {
  /** Hosts, not paths: the per-host gate paces one host and these tests are about the route. */
  const URLS = [
    'https://one.example/a',
    'https://two.example/b',
    'https://three.example/c',
    'https://four.example/d',
  ];

  /** Finishes the first call last, so completion order cannot be the input order. */
  function reorderingExtractClient(): ExtractClient {
    let call = 0;
    const base = extractClient();
    return {
      ...base,
      structured: vi.fn(async (input: { content: string }) => {
        const delay = 40 - call * 10;
        call++;
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, delay)));
        return (base.structured as unknown as (i: unknown) => Promise<unknown>)(input);
      }),
    } as unknown as ExtractClient;
  }

  it('returns rows in the order the caller listed, whatever order they finished in', async () => {
    const instance = await build({ extractClient: reorderingExtractClient() });

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: { urls: URLS, prompt: 'the plan and its monthly price' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.map((row: { _source: { url: string } }) => row._source.url)).toEqual(URLS);
  });

  it('reads several urls at once instead of one after another', async () => {
    let active = 0;
    let peak = 0;
    const fetchClient = {
      fetch: vi.fn(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active--;
        return {
          success: true,
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: PAGE,
          timingMs: 5,
        };
      }),
      health: vi.fn(async () => true),
    } as unknown as FetchClient;

    const instance = await build({ fetchClient });

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: { urls: URLS, prompt: 'the plan and its monthly price' },
    });

    expect(response.statusCode).toBe(200);
    expect(peak).toBeGreaterThan(1);
  });

  it('still ends the whole request on a schema the provider refused', async () => {
    // The point of stopping: the same 400 would arrive for all four URLs, and
    // the caller has one schema to fix.
    const client = extractClient({
      error: new StructuredError(400, 'schema.properties: unsupported type', 'schema.properties'),
    });
    const instance = await build({ extractClient: client });

    const response = await instance.inject({
      method: 'POST',
      url: '/extract',
      payload: { urls: URLS, schema: { type: 'object' } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('schema.properties');
  });
});
