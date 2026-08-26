import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { encryptSecret } from './crypto.js';

/**
 * End-to-end: a caller's stored provider key reaches the extract client on
 * `/scrape`, `/parse` and `/agent/schema` — the actual point of this feature,
 * as opposed to the route-contract tests for `/v1/providers` itself.
 */

const ENCRYPTION_KEY = createHash('sha256').update('integration-test-secret').digest();
const API_KEY_ID = 'key-with-stored-anthropic';
const ARTICLE_TEXT = 'Real article text about a real topic. '.repeat(10);

interface Row {
  api_key_id: string;
  provider: string;
  key_ciphertext: Buffer;
  key_iv: Buffer;
  key_last4: string;
  model: string | null;
  updated_at: Date;
}

function storedRow(): Row {
  const { ciphertext, iv } = encryptSecret('sk-ant-stored-key-9999', ENCRYPTION_KEY);
  return {
    api_key_id: API_KEY_ID,
    provider: 'anthropic',
    key_ciphertext: ciphertext,
    key_iv: iv,
    key_last4: '9999',
    model: 'claude-sonnet-4-5',
    updated_at: new Date(),
  };
}

const db = vi.hoisted(() => {
  const state = { rows: [] as Row[] };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (text.startsWith('SELECT provider, key_ciphertext')) {
      const [apiKeyId] = values as [string];
      return { rows: state.rows.filter((r) => r.api_key_id === apiKeyId) };
    }
    return { rows: [] };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

const { registerScrape } = await import('./../routes/scrape.js');
const { registerParse } = await import('./../routes/parse.js');
const { registerAgent } = await import('./../routes/agent.js');
const { ParseCache } = await import('./../parse/cache.js');
type ExtractClient = import('./../extract/client.js').ExtractClient;
type DocumentResult = import('./../extract/client.js').DocumentResult;

const KEY = { id: API_KEY_ID, name: 'test', keyPrefix: 'helix-test', rateLimit: 1000, createdAt: new Date(), lastUsedAt: null, revokedAt: null };

function withApiKey(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    request.apiKey = KEY;
  });
}

beforeEach(() => {
  db.state.rows = [storedRow()];
});

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('provider key resolution reaches the extract client', () => {
  it('/scrape jsonOptions sends the caller\'s stored anthropic key', async () => {
    const structured = vi.fn(async () => ({
      data: { title: 'Title' },
      sources: [],
      tokensInput: 10,
      tokensOutput: 5,
      modelUsed: 'claude-sonnet-4-5',
      blocksKept: 1,
      blocksTotal: 1,
    }));
    const extractClient = {
      extract: vi.fn(async () => ({
        markdown: `# Title\n\n${ARTICLE_TEXT}`,
        text: ARTICLE_TEXT,
        title: 'Title',
        language: 'en',
        links: [],
        extractorUsed: 'trafilatura',
        contentHash: 'abc',
      })),
      structured,
      health: vi.fn(async () => true),
    } as unknown as ExtractClient;

    app = Fastify();
    withApiKey(app);
    await registerScrape(app, {
      fetchClient: {
        fetch: vi.fn(async () => ({
          success: true,
          status: 200,
          headers: {},
          body: `<html><body><article>${ARTICLE_TEXT}</article></body></html>`,
          profileUsed: 'chrome-149-macos',
          timingMs: 5,
        })),
        health: vi.fn(async () => true),
      } as never,
      extractClient,
      resolveHost: async () => ['93.184.216.34'],
      encryptionKey: ENCRYPTION_KEY,
    });
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/scrape',
      payload: {
        url: 'https://example.com',
        formats: ['markdown', 'json'],
        jsonOptions: { schema: { type: 'object', properties: { title: { type: 'string' } } } },
      },
    });

    expect(structured).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKeys: { anthropic: 'sk-ant-stored-key-9999' },
        providerModels: { anthropic: 'claude-sonnet-4-5' },
      }),
    );
  });

  it('/parse jsonOptions sends the caller\'s stored anthropic key', async () => {
    const structured = vi.fn(async () => ({
      data: { invoiceTotal: 100 },
      sources: [],
      tokensInput: 10,
      tokensOutput: 5,
      modelUsed: 'claude-sonnet-4-5',
      blocksKept: 1,
      blocksTotal: 1,
    }));
    const parsed: DocumentResult = {
      markdown: '# Invoice',
      pages: 1,
      needsOcr: false,
      ocrApplied: false,
      suspectedGarbledText: false,
      parserUsed: 'pypdfium2',
    };
    const extractClient = {
      document: vi.fn(async () => parsed),
      structured,
      health: vi.fn(async () => true),
    } as unknown as ExtractClient;

    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Uint8Array(pdf), { status: 200, headers: { 'content-type': 'application/pdf' } }),
    ) as unknown as typeof fetch;
    const lookup = async () => [{ address: '93.184.216.34', family: 4 as const }];

    app = Fastify();
    withApiKey(app);
    await app.register(
      async (instance) => {
        await registerParse(instance, {
          extractClient,
          maxUploadBytes: 1024 * 1024,
          userAgent: 'HelixTest/0',
          cache: new ParseCache<DocumentResult>(),
          encryptionKey: ENCRYPTION_KEY,
          fetchImpl,
          lookup,
        });
      },
      { prefix: '/v1' },
    );
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/v1/parse',
      payload: {
        url: 'https://example.com/files/report.pdf',
        formats: ['markdown', 'json'],
        jsonOptions: { schema: { type: 'object', properties: { invoiceTotal: { type: 'number' } } } },
      },
    });

    expect(structured).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKeys: { anthropic: 'sk-ant-stored-key-9999' },
        providerModels: { anthropic: 'claude-sonnet-4-5' },
      }),
    );
  });

  it('/agent/schema sends the caller\'s stored anthropic key', async () => {
    const schema = vi.fn(async () => ({
      schema: { type: 'object', properties: {} },
      summary: 'An empty schema.',
      tokensInput: 5,
      tokensOutput: 2,
      modelUsed: 'claude-sonnet-4-5',
    }));
    const extractClient = { schema } as unknown as ExtractClient;

    app = Fastify();
    withApiKey(app);
    await app.register(
      async (instance) => {
        await registerAgent(instance, { extractClient, encryptionKey: ENCRYPTION_KEY });
      },
      { prefix: '/v1' },
    );
    await app.ready();

    await app.inject({ method: 'POST', url: '/v1/agent/schema', payload: { prompt: 'pricing plans' } });

    expect(schema).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKeys: { anthropic: 'sk-ant-stored-key-9999' },
        providerModels: { anthropic: 'claude-sonnet-4-5' },
      }),
    );
  });

  it('sends undefined provider keys when the caller has no api key on the request', async () => {
    const structured = vi.fn(async () => ({
      data: {},
      sources: [],
      tokensInput: 0,
      tokensOutput: 0,
      modelUsed: 'x',
      blocksKept: 0,
      blocksTotal: 0,
    }));
    const extractClient = {
      extract: vi.fn(async () => ({
        markdown: ARTICLE_TEXT,
        text: ARTICLE_TEXT,
        links: [],
        extractorUsed: 'trafilatura',
        contentHash: 'abc',
      })),
      structured,
      health: vi.fn(async () => true),
    } as unknown as ExtractClient;

    app = Fastify();
    // No apiKey hook: this request is anonymous, as in the unit route tests.
    await registerScrape(app, {
      fetchClient: {
        fetch: vi.fn(async () => ({
          success: true,
          status: 200,
          headers: {},
          body: `<html><body><article>${ARTICLE_TEXT}</article></body></html>`,
          profileUsed: 'chrome-149-macos',
          timingMs: 5,
        })),
        health: vi.fn(async () => true),
      } as never,
      extractClient,
      resolveHost: async () => ['93.184.216.34'],
      encryptionKey: ENCRYPTION_KEY,
    });
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/scrape',
      payload: {
        url: 'https://example.com',
        formats: ['markdown', 'json'],
        jsonOptions: { schema: { type: 'object', properties: { title: { type: 'string' } } } },
      },
    });

    expect(structured).toHaveBeenCalledWith(
      expect.objectContaining({ providerKeys: undefined, providerModels: undefined }),
    );
  });
});
