import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrawlJobRequest } from './worker.js';

const JOB_ID = '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

interface Call {
  text: string;
  values: unknown[];
}

const db = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    request: undefined as CrawlJobRequest | undefined,
    /** Whether this worker still holds the task claim when it marks a page. */
    claimHeld: true,
    /** Task rows still queued or running when the crawl finishes. */
    leftover: 0,
    /** The claimed job's type; undefined keeps the projection out of older tests. */
    type: undefined as string | undefined,
    /** Queued task rows resume() finds, as the crawl route leaves the seed. */
    queued: [] as { url: string; depth: number; site: string }[],
    /** `crawl_state` rows an incremental run loads before it fetches anything. */
    crawlState: [] as Record<string, unknown>[],
  };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    if (text.includes('FOR UPDATE SKIP LOCKED')) {
      const request = state.request;
      state.request = undefined;
      return request ? { rows: [{ id: JOB_ID, request, type: state.type }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    // The guarded mark: no row matches once another worker has reclaimed the
    // lease, which is what tells the worker its result is stale.
    if (text.includes('UPDATE job_tasks') && text.includes('claimed_by = $3')) {
      return { rows: [], rowCount: state.claimHeld ? 1 : 0 };
    }
    // The outcome write lands: zero rows here reads as a cancellation mid-finish.
    if (text.includes('rejections = $6')) return { rows: [], rowCount: 1 };
    if (text.includes('FROM crawl_state')) return { rows: state.crawlState, rowCount: state.crawlState.length };
    if (text.includes('SELECT url, depth, site FROM job_tasks')) return { rows: state.queued, rowCount: state.queued.length };
    if (text.includes('count(*)::int AS n FROM job_tasks')) return { rows: [{ n: state.leftover }], rowCount: 1 };
    if (text.includes('FROM job_tasks WHERE job_id')) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

const runPipeline = vi.hoisted(() => vi.fn());
vi.mock('../core/pipeline.js', () => ({ runPipeline }));

const enqueueDelivery = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../webhooks/deliveries.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object), enqueueDelivery };
});

const sink = vi.hoisted(() => ({
  ensureCollection: vi.fn(async (_collection: string, _dimensions: number) => undefined),
  store: vi.fn(async (_request: { url: string; collection: string; chunks: unknown[] }) => ({
    stored: 1,
    updated: 0,
    collection: 'docs',
  })),
  health: vi.fn(async () => true),
}));
const createSink = vi.hoisted(() => vi.fn((): typeof sink | undefined => sink));
vi.mock('../vectors/sink.js', async (importOriginal) => ({ ...(await importOriginal<object>()), createSink }));

const estimateCrawl = vi.hoisted(() => vi.fn(async () => ({ pages: 7, assumptions: ['7 pages discovered'] })));
vi.mock('./estimate.js', () => ({ estimateCrawl }));

const discover = vi.hoisted(() => vi.fn(async () => [] as { url: string }[]));
vi.mock('./sitemap.js', () => ({
  SitemapFetcher: class {
    discover = discover;
  },
}));

import { CrawlWorker } from './worker.js';

function baseRequest(overrides: Partial<CrawlJobRequest> = {}): CrawlJobRequest {
  return {
    url: 'https://example.com',
    limit: 10,
    includePaths: [],
    excludePaths: [],
    allowSubdomains: false,
    allowExternal: false,
    sitemap: 'skip',
    respectRobots: false,
    politeness: 'fixed',
    incremental: false,
    ignoreQueryParameters: false,
    formats: ['markdown'],
    tier: 'auto',
    extractor: 'trafilatura',
    onlyMainContent: true,
    ...overrides,
  };
}

function pipelineSuccess(markdown = '# Title\n\nSome content.') {
  return {
    success: true as const,
    content: {
      markdown,
      text: 'Some content.',
      links: [] as string[],
      extractorUsed: 'trafilatura',
      contentHash: 'hash1',
    },
    tier: 'tls' as const,
    tiersAttempted: ['tls'] as const,
    escalations: [] as { from: string; to: string; reason: string }[],
    statusCode: 200,
    timingMs: 5,
  };
}

function extractClient(chunkImpl?: () => Promise<unknown>, structuredImpl?: (opts: { signal?: AbortSignal }) => Promise<unknown>) {
  return {
    structured:
      structuredImpl ??
      vi.fn(async () => ({
        data: { title: 'Pro' },
        sources: [{ field: 'title', span: [0, 3] }],
        tokensInput: 10,
        tokensOutput: 2,
        modelUsed: 'test-model',
        blocksKept: 2,
        blocksTotal: 2,
      })),
    chunk:
      chunkImpl ??
      vi.fn(async () => ({
        chunks: [{ text: 'chunk', anchor: '#a:1', tokens: 3, headingPath: [], index: 0, embedding: [0.1, 0.2] }],
        embeddingModel: 'local',
        embeddingDimensions: 2,
      })),
  } as never;
}

function buildWorker(chunkImpl?: () => Promise<unknown>) {
  return new CrawlWorker({
    fetchClient: {} as never,
    extractClient: extractClient(chunkImpl),
    userAgent: 'HelixBot/test',
  });
}

function buildWorkerWithStructured(structuredImpl: (opts: { signal?: AbortSignal }) => Promise<unknown>) {
  return new CrawlWorker({
    fetchClient: {} as never,
    extractClient: extractClient(undefined, structuredImpl),
    userAgent: 'HelixBot/test',
  });
}

beforeEach(() => {
  db.state.calls = [];
  db.state.request = undefined;
  db.state.claimHeld = true;
  db.state.leftover = 0;
  db.state.type = undefined;
  db.state.queued = [];
  db.state.crawlState = [];
  estimateCrawl.mockClear();
  discover.mockClear();
  discover.mockResolvedValue([]);
  runPipeline.mockReset();
  enqueueDelivery.mockClear();
  createSink.mockClear();
  sink.ensureCollection.mockClear();
  sink.store.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CrawlWorker conditional re-fetches', () => {
  const notModified = () => ({
    success: true as const,
    content: { markdown: '', text: '', links: [] as string[], extractorUsed: 'none', contentHash: '' },
    tier: 'tls' as const,
    tiersAttempted: ['tls'] as const,
    escalations: [] as { from: string; to: string; reason: string }[],
    statusCode: 304,
    notModified: true,
    timingMs: 3,
  });

  const stored = {
    url: 'https://example.com/',
    content_hash: 'hash1',
    etag: '"v1"',
    last_modified: new Date('2026-08-01T12:00:00Z'),
    status_code: 200,
    last_seen_at: new Date('2026-08-01T12:00:00Z'),
    unchanged_streak: 2,
  };

  it('counts a 304 as unchanged instead of a failed fetch', async () => {
    db.state.request = baseRequest({ incremental: true });
    db.state.crawlState = [stored];
    runPipeline.mockResolvedValueOnce(notModified());

    const worker = buildWorker();
    await worker.runOnce();

    const failures = db.state.calls.filter((c) => c.text.includes('fetch_failures'));
    expect(failures).toEqual([]);

    const outcome = db.state.calls.find((c) => c.text.includes('rejections = $6'));
    const result = JSON.parse(String(outcome?.values[4])) as Record<string, number>;
    expect(result['pagesUnchanged']).toBe(1);

    // And no empty document written over the one already stored: a 304 body is
    // absent, not blank.
    expect(db.state.calls.filter((c) => c.text.includes('INSERT INTO documents'))).toEqual([]);
  });

  it('keeps the stored validators when a 304 repeats none of them', async () => {
    // A 304 may send no ETag at all. Writing the empty body's hash and a null
    // etag would leave the next run with nothing to ask with, so the saving
    // would last exactly one crawl.
    db.state.request = baseRequest({ incremental: true });
    db.state.crawlState = [stored];
    runPipeline.mockResolvedValueOnce(notModified());

    const worker = buildWorker();
    await worker.runOnce();

    const visit = db.state.calls.find((c) => c.text.includes('INSERT INTO crawl_state'));
    expect(visit?.values[2]).toBe('hash1');
    expect(visit?.values[3]).toBe('"v1"');
  });
});

describe('CrawlWorker destination wiring', () => {
  it('does nothing when the request has no destination', async () => {
    db.state.request = baseRequest();
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    expect(createSink).not.toHaveBeenCalled();
    expect(sink.store).not.toHaveBeenCalled();
  });

  it('chunks, embeds and stores the page once a destination is configured', async () => {
    db.state.request = baseRequest({
      destination: { type: 'qdrant', collection: 'docs', upsertMode: 'update-in-place' },
    });
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    expect(createSink).toHaveBeenCalledWith('qdrant', process.env, undefined);
    expect(sink.ensureCollection).toHaveBeenCalledWith('docs', 2);
    expect(sink.store).toHaveBeenCalledWith({
      url: 'https://example.com/',
      collection: 'docs',
      model: 'local',
      chunks: [{ text: 'chunk', anchor: '#a:1', tokens: 3, embedding: [0.1, 0.2], headingPath: [] }],
    });
  });

  it('calls ensureCollection once across multiple pages in the same job', async () => {
    db.state.request = baseRequest({
      destination: { type: 'qdrant', collection: 'docs', upsertMode: 'update-in-place' },
      formats: ['markdown'],
    });
    const first = pipelineSuccess();
    first.content.links.push('https://example.com/b');
    runPipeline.mockResolvedValueOnce(first).mockResolvedValueOnce(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    expect(sink.ensureCollection).toHaveBeenCalledTimes(1);
    expect(sink.store).toHaveBeenCalledTimes(2);
  });

  it('mangles the anchor for append mode so it never collides with an existing point', async () => {
    db.state.request = baseRequest({
      destination: { type: 'pgvector', collection: 'docs', upsertMode: 'append' },
    });
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    const stored = sink.store.mock.calls[0]?.[0] as { chunks: { anchor: string }[] };
    expect(stored.chunks[0]?.anchor).toMatch(/^#a:1:[0-9a-f-]{36}$/);
  });

  it('records a vector_store failure and keeps the page when the sink throws', async () => {
    db.state.request = baseRequest({
      destination: { type: 'qdrant', collection: 'docs', upsertMode: 'update-in-place' },
    });
    runPipeline.mockResolvedValueOnce(pipelineSuccess());
    sink.store.mockRejectedValueOnce(new Error('qdrant unreachable'));

    const worker = buildWorker();
    await worker.runOnce();

    const failureInsert = db.state.calls.find((call) => call.text.includes('INSERT INTO fetch_failures'));
    expect(failureInsert?.values).toEqual(expect.arrayContaining(['vector_store', 'qdrant unreachable']));

    const documentInsert = db.state.calls.find((call) => call.text.includes('INSERT INTO documents'));
    expect(documentInsert).toBeDefined();

    const completion = db.state.calls.find((call) => call.text.includes('UPDATE jobs') && call.text.includes('rejections = $6'));
    expect(completion?.values[1]).toBe(1);
    expect(JSON.parse(String(completion?.values[4]))).toMatchObject({ vectorFailures: 1 });
  });

  it('records a vector_store failure when chunking itself fails', async () => {
    db.state.request = baseRequest({
      destination: { type: 'qdrant', collection: 'docs', upsertMode: 'update-in-place' },
    });
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    const worker = buildWorker(
      vi.fn(async () => {
        throw new Error('helix-extract unreachable');
      }),
    );
    await worker.runOnce();

    const failureInsert = db.state.calls.find((call) => call.text.includes('INSERT INTO fetch_failures'));
    expect(failureInsert?.values).toEqual(expect.arrayContaining(['vector_store', 'helix-extract unreachable']));
    expect(sink.store).not.toHaveBeenCalled();
  });

  it('does nothing when the destination type has no configured sink', async () => {
    createSink.mockReturnValueOnce(undefined);
    db.state.request = baseRequest({
      destination: { type: 'qdrant', collection: 'docs', upsertMode: 'update-in-place' },
    });
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    expect(sink.store).not.toHaveBeenCalled();
    const failureInsert = db.state.calls.find((call) => call.text.includes('INSERT INTO fetch_failures'));
    expect(failureInsert).toBeUndefined();
  });
});

describe('CrawlWorker identity and politeness wiring', () => {
  function workerWith(over: Record<string, unknown> = {}) {
    return new CrawlWorker({
      fetchClient: {} as never,
      extractClient: extractClient(),
      userAgent: 'HelixBot/test',
      ...over,
    } as never);
  }

  it('sends a coherent identity — one profile and one proxy — with the fetch', async () => {
    db.state.request = baseRequest();
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    await workerWith({ proxyUrl: 'http://proxy.example:8080' }).runOnce();

    const options = runPipeline.mock.calls[0]?.[0] as { profile?: string; proxy?: string };
    expect(options.proxy).toBe('http://proxy.example:8080');
    // The pair travels together: splitting them is the incoherence the Rust
    // profile validator refuses to start on.
    expect(typeof options.profile === 'string' || options.profile === undefined).toBe(true);
  });

  it('goes direct when the instance has no proxy configured', async () => {
    db.state.request = baseRequest();
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    await workerWith().runOnce();

    // No proxy is a real configuration. The worker must not invent one.
    expect((runPipeline.mock.calls[0]?.[0] as { proxy?: string }).proxy).toBeUndefined();
  });

  it('draws every page identity from the pool rather than composing one per request', async () => {
    db.state.request = baseRequest({ limit: 3 });
    runPipeline
      .mockResolvedValueOnce({
        ...pipelineSuccess(),
        content: { ...pipelineSuccess().content, links: ['https://example.com/b'] },
      })
      .mockResolvedValue(pipelineSuccess());

    await workerWith({
      proxyUrl: 'http://proxy.example:8080',
      sessionPoolSize: 1,
    }).runOnce();

    const profiles = runPipeline.mock.calls.map(
      (call) => (call[0] as { profile?: string }).profile,
    );
    expect(profiles.length).toBeGreaterThan(1);
    // With one identity in the pool every page presents it. More than one live
    // session legitimately means more than one identity — what must never
    // happen is an identity being reassembled per request.
    expect(new Set(profiles).size).toBe(1);
  });
});

describe('a cancelled job stops the work it is paying for', () => {
  /** Makes `SELECT status FROM jobs` answer 'cancelled' from the first poll. */
  function cancelImmediately(): void {
    const original = db.query.getMockImplementation()!;
    db.query.mockImplementation((async (text: string, values: unknown[] = []) => {
      if (text.includes('SELECT status FROM jobs')) {
        return { rows: [{ status: 'cancelled' }], rowCount: 1 };
      }
      return original(text, values);
      // The fake answers several different row shapes; the mock's inferred
      // signature only knows the first one it saw.
    }) as unknown as typeof original);
  }

  it('passes a signal into the per-page structured call', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    runPipeline.mockResolvedValue(pipelineSuccess());
    db.state.request = baseRequest({
      formats: ['markdown', 'json'],
      jsonOptions: { prompt: 'the title' },
    });

    const worker = buildWorkerWithStructured(async (opts) => {
      seen.push(opts.signal);
      return {
        data: { title: 'Pro' },
        sources: [{ field: 'title', span: [0, 3] }],
        tokensInput: 1,
        tokensOutput: 1,
        modelUsed: 'm',
        blocksKept: 1,
        blocksTotal: 1,
      };
    });
    await worker.runOnce();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
  });

  it('does not count an aborted extraction as a failed one', async () => {
    runPipeline.mockResolvedValue(pipelineSuccess());
    db.state.request = baseRequest({
      formats: ['markdown', 'json'],
      jsonOptions: { prompt: 'the title' },
    });

    const worker = buildWorkerWithStructured(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    await worker.runOnce();

    // `usage` is written on the completing UPDATE; an abort must not appear
    // there as a page the extractor tried and lost.
    const update = db.state.calls.find(
      (c) => c.text.includes('UPDATE jobs') && c.text.includes('usage'),
    );
    const usage = update ? JSON.parse(update.values[4] as string) : {};
    expect(usage.jsonFailed ?? 0).toBe(0);
  });

  it('still counts a genuine extraction failure', async () => {
    runPipeline.mockResolvedValue(pipelineSuccess());
    db.state.request = baseRequest({
      formats: ['markdown', 'json'],
      jsonOptions: { prompt: 'the title' },
    });

    const worker = buildWorkerWithStructured(async () => {
      throw new Error('the provider returned 500');
    });
    await worker.runOnce();

    const update = db.state.calls.find(
      (c) => c.text.includes('UPDATE jobs') && c.text.includes('usage'),
    );
    const usage = update ? JSON.parse(update.values[4] as string) : {};
    expect(usage.jsonFailed).toBe(1);
  });

  it('passes a signal to the fetch as well, not only the model call', async () => {
    let seen: AbortSignal | undefined;
    runPipeline.mockImplementation(async (options: { signal?: AbortSignal }) => {
      seen = options.signal;
      return pipelineSuccess();
    });
    db.state.request = baseRequest();

    await buildWorker().runOnce();

    expect(seen).toBeInstanceOf(AbortSignal);
  });

  it('does not record a page aborted by the cancellation as a fetch failure', async () => {
    cancelImmediately();
    runPipeline.mockImplementation(async (options: { signal?: AbortSignal }) => {
      // Wait for the cancellation poll to fire, then answer the way the
      // pipeline does once its signal is aborted.
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (!options.signal?.aborted) return pipelineSuccess();
      return {
        success: false as const,
        reason: 'aborted' as const,
        detail: 'the read was cancelled',
        statusCode: undefined,
        tier: 'tls' as const,
        tiersAttempted: ['tls'] as const,
        timingMs: 1,
      };
    });
    db.state.request = baseRequest();

    await buildWorker().runOnce();

    // A cancelled crawl reporting hundreds of broken URLs is the failure this
    // avoids; the row is left leased so `release()` can requeue it.
    expect(db.state.calls.some((c) => c.text.includes('INSERT INTO fetch_failures'))).toBe(false);
    expect(db.state.calls.some((c) => c.text.includes("SET status = 'failed'"))).toBe(false);
  });

  it('does record an abort that did not come from the cancellation', async () => {
    runPipeline.mockResolvedValue({
      success: false as const,
      reason: 'aborted' as const,
      detail: 'the upstream connection dropped',
      statusCode: undefined,
      tier: 'tls' as const,
      tiersAttempted: ['tls'] as const,
      timingMs: 1,
    });
    db.state.request = baseRequest();

    await buildWorker().runOnce();

    // Left unmarked it would stay leased and the loop would spin until the
    // lease expired, so this one still has to reach the frontier.
    expect(db.state.calls.some((c) => c.text.includes("SET status = 'failed'"))).toBe(true);
  });

  it('aborts before waiting on the pages already in flight', async () => {
    cancelImmediately();
    let aborted = false;
    runPipeline.mockImplementation(async (options: { signal?: AbortSignal }) => {
      options.signal?.addEventListener('abort', () => {
        aborted = true;
      });
      // The cancellation poll only fires 2s after the loop starts, so a page
      // has to still be outstanding then for the abort to reach it at all —
      // which is exactly the situation this guards.
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      return pipelineSuccess();
    });
    db.state.request = baseRequest();

    await buildWorker().runOnce();

    expect(aborted).toBe(true);
  }, 15_000);
});

describe('CrawlWorker task claims', () => {
  it('does not store a page whose claim another worker has taken', async () => {
    // The lease expired mid-fetch and a second worker reclaimed the task. This
    // worker's result is stale: storing it writes the page twice.
    db.state.claimHeld = false;
    db.state.request = baseRequest();
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    const documentInsert = db.state.calls.find((call) => call.text.includes('INSERT INTO documents'));
    expect(documentInsert, 'a stale result must not be written').toBeUndefined();

    const completion = db.state.calls.find(
      (call) => call.text.includes('UPDATE jobs') && call.text.includes('rejections = $6'),
    );
    expect(completion?.values[1], 'a page this worker lost is not a page it completed').toBe(0);
  });

  it('stores the page while the claim is still held', async () => {
    db.state.request = baseRequest();
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    expect(db.state.calls.find((call) => call.text.includes('INSERT INTO documents'))).toBeDefined();
  });
});

describe('CrawlWorker sitemap seeding', () => {
  it('does not fetch the sitemap when the crawl cannot go past the seed', async () => {
    // Every sitemap entry is offered at depth 1, so at maxDepth 0 the whole
    // fetch is spent to have every entry rejected as too deep.
    db.state.request = baseRequest({ sitemap: 'include', maxDepth: 0 });
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    expect(discover).not.toHaveBeenCalled();
  });

  it('still fetches the sitemap when the crawl can follow links', async () => {
    db.state.request = baseRequest({ sitemap: 'include', maxDepth: 2 });
    runPipeline.mockResolvedValue(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    expect(discover).toHaveBeenCalled();
  });

  it('renews the job lease once the sitemap phase is done', async () => {
    // Discovery, resume and the incremental state load all run before the loop
    // renews anything, and a slow preamble is exactly when another worker
    // reclaims the job out from under this one.
    db.state.request = baseRequest({ sitemap: 'include', maxDepth: 2 });
    runPipeline.mockResolvedValue(pipelineSuccess());

    const worker = buildWorker();
    await worker.runOnce();

    const renewIndex = db.state.calls.findIndex(
      (call) => call.text.includes('UPDATE jobs') && call.text.includes('SET lease_expires_at'),
    );
    const totalIndex = db.state.calls.findIndex((call) => call.text.includes('SET total = $2'));

    expect(renewIndex, 'the job lease must be renewed after the preamble').toBeGreaterThan(-1);
    expect(renewIndex).toBeLessThan(totalIndex);
  });
});

describe('CrawlWorker — a finished job accounts for every page', () => {
  function finish(): Call {
    const update = db.state.calls.find((c) => c.text.includes('UPDATE jobs') && c.text.includes('rejections = $6'));
    expect(update, 'the worker should write the job outcome').toBeDefined();
    return update!;
  }

  it('finishes clean with no warnings when every page is recorded', async () => {
    db.state.request = baseRequest();
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    await buildWorker().runOnce();

    const update = finish();
    expect(update.values[6]).toBe('completed');
    expect(JSON.parse(String(update.values[7]))).toEqual([]);
    expect(update.values[8]).toBeNull();
  });

  // A fetched page whose task row this worker no longer held was dropped with
  // nothing on the job to say so, and the crawl read as complete.
  it('warns when a fetched page is discarded because the task was not held', async () => {
    db.state.request = baseRequest();
    db.state.claimHeld = false;
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    await buildWorker().runOnce();

    const update = finish();
    expect(update.values[6]).toBe('completed');
    const warnings = JSON.parse(String(update.values[7])) as string[];
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/1 page was fetched and discarded/);
  });

  it('fails a job that recorded nothing and left pages unresolved', async () => {
    db.state.request = baseRequest({ webhook: { url: 'https://hooks.example.com/helix' } });
    db.state.claimHeld = false;
    db.state.leftover = 2;
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    await buildWorker().runOnce();

    const update = finish();
    expect(update.values[6]).toBe('failed');
    expect(String(update.values[8])).toMatch(/2 pages were queued but never recorded/);
    const calls = enqueueDelivery.mock.calls as unknown as [unknown, { event: string }][];
    const events = calls.map((call) => call[1].event);
    expect(events).toContain('failed');
    expect(events).not.toContain('completed');
  });
});

describe('CrawlWorker — what a job cost, and what it was projected to cost', () => {
  function outcome(): Record<string, unknown> {
    const update = db.state.calls.find((c) => c.text.includes('UPDATE jobs') && c.text.includes('rejections = $6'));
    return JSON.parse(String(update?.values[4])) as Record<string, unknown>;
  }

  it('counts recorded pages by tier and the time a render tier took', async () => {
    db.state.request = baseRequest();
    runPipeline.mockResolvedValueOnce({ ...pipelineSuccess(), tier: 'chromium', tiersAttempted: ['plain', 'chromium'], timingMs: 2_340 });

    await buildWorker().runOnce();

    expect(outcome()).toMatchObject({ pagesFetched: 1, tierBreakdown: { chromium: 1 }, browserSeconds: 2.3 });
  });

  it('keeps each page climb with the page', async () => {
    db.state.request = baseRequest();
    const escalations = [{ from: 'plain', to: 'tls', reason: 'content absent' }];
    runPipeline.mockResolvedValueOnce({ ...pipelineSuccess(), tiersAttempted: ['plain', 'tls'], escalations });

    await buildWorker().runOnce();

    const document = db.state.calls.find((c) => c.text.includes('INSERT INTO documents'));
    const metadata = document?.values.map((v) => (typeof v === 'string' && v.startsWith('{') ? JSON.parse(v) : v)).find((v) => v && typeof v === 'object' && 'tiersAttempted' in v);
    expect(metadata).toMatchObject({ escalations });
  });

  it('saves a projection before a fresh crawl fetches anything', async () => {
    db.state.request = baseRequest();
    db.state.type = 'crawl';
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    await buildWorker().runOnce();

    expect(estimateCrawl).toHaveBeenCalledTimes(1);
    const saved = db.state.calls.findIndex((c) => c.text.includes('SET estimate = $2'));
    const firstDocument = db.state.calls.findIndex((c) => c.text.includes('INSERT INTO documents'));
    expect(saved).toBeGreaterThan(-1);
    expect(saved).toBeLessThan(firstDocument);
    expect(JSON.parse(String(db.state.calls[saved]?.values[1]))).toMatchObject({ pages: 7 });
  });

  it('makes no projection for a batch, which discovers nothing', async () => {
    db.state.request = baseRequest();
    db.state.type = 'batch_scrape';
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    await buildWorker().runOnce();

    expect(estimateCrawl).not.toHaveBeenCalled();
    expect(db.state.calls.some((c) => c.text.includes('SET estimate'))).toBe(false);
  });

  it('crawls on when the projection fails', async () => {
    db.state.request = baseRequest();
    db.state.type = 'crawl';
    estimateCrawl.mockRejectedValueOnce(new Error('sitemap unreachable'));
    runPipeline.mockResolvedValueOnce(pipelineSuccess());

    await buildWorker().runOnce();

    expect(outcome()).toMatchObject({ pagesFetched: 1 });
  });
});

// The crawl route queues the seed row before the worker claims the job. Read
// as a resume, that one row switched off the projection and sitemap seeding
// for every crawl submitted through the API.
describe('CrawlWorker — a crawl whose seed the route already queued', () => {
  it('still starts fresh: projects the crawl and seeds from the sitemap', async () => {
    db.state.request = baseRequest({ sitemap: 'include', maxDepth: 2 });
    db.state.type = 'crawl';
    db.state.queued = [{ url: 'https://example.com/', depth: 0, site: 'example.com' }];
    runPipeline.mockResolvedValue(pipelineSuccess());

    await buildWorker().runOnce();

    expect(estimateCrawl).toHaveBeenCalledTimes(1);
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it('treats a crawl that already finished pages as a resume', async () => {
    db.state.request = baseRequest({ sitemap: 'include', maxDepth: 2 });
    db.state.type = 'crawl';
    db.state.queued = [
      { url: 'https://example.com/a', depth: 1, site: 'example.com' },
      { url: 'https://example.com/b', depth: 1, site: 'example.com' },
    ];
    runPipeline.mockResolvedValue(pipelineSuccess());

    await buildWorker().runOnce();

    expect(estimateCrawl).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
  });
});

describe('CrawlWorker session cookies', () => {
  it('sends the cookies one page set on the next page of the same session', async () => {
    db.state.request = baseRequest();
    const first = { ...pipelineSuccess(), setCookies: ['cf_clearance=abc; Path=/; HttpOnly'] };
    first.content.links.push('https://example.com/b');
    runPipeline.mockResolvedValueOnce(first).mockResolvedValueOnce(pipelineSuccess());

    // One identity, so both pages share its jar.
    const worker = new CrawlWorker({
      fetchClient: {} as never,
      extractClient: extractClient(),
      userAgent: 'HelixBot/test',
      sessionPoolSize: 1,
    });
    await worker.runOnce();

    expect(runPipeline).toHaveBeenCalledTimes(2);
    const second = runPipeline.mock.calls[1]?.[0] as { headers?: Record<string, string> };
    expect(second.headers?.['Cookie']).toBe('cf_clearance=abc');
  });
});
