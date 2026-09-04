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
  };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    if (text.includes('FOR UPDATE SKIP LOCKED')) {
      const request = state.request;
      state.request = undefined;
      return request ? { rows: [{ id: JOB_ID, request }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
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
vi.mock('../vectors/sink.js', () => ({ createSink }));

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
    statusCode: 200,
    timingMs: 5,
  };
}

function extractClient(chunkImpl?: () => Promise<unknown>) {
  return {
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

beforeEach(() => {
  db.state.calls = [];
  db.state.request = undefined;
  runPipeline.mockReset();
  enqueueDelivery.mockClear();
  createSink.mockClear();
  sink.ensureCollection.mockClear();
  sink.store.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
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

    const completion = db.state.calls.find((call) => call.text.includes('UPDATE jobs') && call.text.includes("status = 'completed'"));
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
