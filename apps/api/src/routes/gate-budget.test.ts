import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerScrape } from './scrape.js';
import { registerExtract } from './extract.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';
import type * as HostGateModule from '../core/host-gate.js';

/**
 * Time spent waiting for the host's turn is part of the caller's `timeout`,
 * not added on top of it: a 30 s scrape must not take 40 s.
 *
 * The gate is replaced by one that reports a 20 s wait without spending it,
 * and the fetch shows what budget the pipeline was given.
 */

const WAITED_MS = 20_000;

vi.mock('../core/host-gate.js', async (importOriginal) => ({
  ...(await importOriginal<typeof HostGateModule>()),
  hostGate: {
    run: async <T>(_url: string, fn: (waitedMs: number) => Promise<T>) => fn(WAITED_MS),
  },
}));

const TEXT = 'Real article text about a real topic, with enough words to read as content. '.repeat(20);
const PAGE = `<html><body><article>${TEXT}</article></body></html>`;

function fetchClient(): FetchClient {
  return {
    fetch: vi.fn(async () => ({ success: true, status: 200, headers: {}, body: PAGE, timingMs: 5 })),
    health: vi.fn(async () => true),
  } as unknown as FetchClient;
}

function extractClient(): ExtractClient {
  return {
    extract: vi.fn(async () => ({
      markdown: TEXT,
      text: TEXT,
      title: 'Title',
      language: 'en',
      links: [],
      extractorUsed: 'trafilatura',
      contentHash: 'abc',
    })),
    structured: vi.fn(async () => ({
      data: {},
      sources: [],
      tokensInput: 1,
      tokensOutput: 1,
      modelUsed: 'test-model',
      blocksKept: 1,
      blocksTotal: 1,
    })),
    health: vi.fn(async () => true),
  } as unknown as ExtractClient;
}

const browserPool = {} as BrowserPool;

/** The `timeoutMs` the first fetch was given. */
function fetchBudget(client: FetchClient): number {
  const fetch = client.fetch as unknown as { mock: { calls: [{ timeoutMs: number }][] } };
  return fetch.mock.calls[0]![0].timeoutMs;
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('the host gate wait counts against the caller timeout', () => {
  it('on /scrape', async () => {
    const fetch = fetchClient();
    app = Fastify();
    await registerScrape(app, {
      fetchClient: fetch,
      extractClient: extractClient(),
      browserPool,
      resolveHost: async () => ['93.184.216.34'],
    });

    await app.inject({
      method: 'POST',
      url: '/scrape',
      payload: { url: 'https://budget.example/scrape', tier: 'plain', timeout: 30_000 },
    });

    expect(fetchBudget(fetch)).toBeLessThanOrEqual(30_000 - WAITED_MS);
  });

  it('on /extract', async () => {
    const fetch = fetchClient();
    app = Fastify();
    await registerExtract(app, {
      fetchClient: fetch,
      extractClient: extractClient(),
      browserPool,
      resolveHost: async () => ['93.184.216.34'],
    });

    await app.inject({
      method: 'POST',
      url: '/extract',
      payload: {
        urls: ['https://budget.example/extract'],
        prompt: 'the title',
        tier: 'plain',
        timeout: 60_000,
      },
    });

    expect(fetchBudget(fetch)).toBeLessThanOrEqual(60_000 - WAITED_MS);
  });
});
