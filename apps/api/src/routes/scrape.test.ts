import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerScrape, type ScrapeRouteDeps } from './scrape.js';
import type { FetchClient } from '../fetch/client.js';
import { StructuredError, type ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';

const ARTICLE_TEXT = 'Real article text about a real topic. '.repeat(30);
const ARTICLE = `<html><head><script>track()</script><!-- note --></head><body onload="go()"><article>${ARTICLE_TEXT}</article><a href="javascript:alert(1)">x</a></body></html>`;

function fetchClientReturning(body: string, status = 200): FetchClient {
  return {
    fetch: vi.fn(async () => ({
      success: true,
      status,
      headers: {},
      body,
      profileUsed: 'chrome-149-macos',
      timingMs: 10,
    })),
    health: vi.fn(async () => true),
  } as unknown as FetchClient;
}

function extractClient(over: Partial<Record<'extract' | 'structured' | 'chunk', unknown>> = {}): ExtractClient {
  return {
    extract: vi.fn(async () => ({
      markdown: `# Title\n\n${ARTICLE_TEXT}`,
      text: ARTICLE_TEXT,
      title: 'Title',
      language: 'en',
      links: ['https://example.com/a'],
      extractorUsed: 'trafilatura',
      contentHash: 'abc123',
    })),
    structured: vi.fn(async () => ({
      data: { title: 'Title' },
      sources: [],
      tokensInput: 120,
      tokensOutput: 8,
      modelUsed: 'claude-sonnet-4-5',
      blocksKept: 3,
      blocksTotal: 5,
    })),
    chunk: vi.fn(async () => ({
      chunks: [{ text: 'chunk one', anchor: 'a1', tokens: 3, headingPath: ['Title'], index: 0 }],
      embeddingModel: undefined,
      embeddingDimensions: undefined,
    })),
    health: vi.fn(async () => true),
    ...over,
  } as unknown as ExtractClient;
}

function browserPool(html = ARTICLE): BrowserPool {
  return {
    render: vi.fn(async () => ({
      html,
      status: 200,
      headers: {},
      finalUrl: 'https://example.com/',
      screenshot: 'iVBORw0KGgo=',
      timingMs: 500,
    })),
    stats: () => ({ browsers: 1, activeContexts: 0, pagesServed: 1 }),
    close: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
  } as unknown as BrowserPool;
}

let app: FastifyInstance | undefined;

async function build(over: Partial<ScrapeRouteDeps> = {}): Promise<{ app: FastifyInstance; deps: ScrapeRouteDeps }> {
  const deps: ScrapeRouteDeps = {
    fetchClient: fetchClientReturning(ARTICLE),
    extractClient: extractClient(),
    browserPool: browserPool(),
    resolveHost: async () => ['93.184.216.34'],
    ...over,
  };
  app = Fastify();
  await registerScrape(app, deps);
  return { app, deps };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const post = (instance: FastifyInstance, payload: Record<string, unknown>) =>
  instance.inject({ method: 'POST', url: '/scrape', payload });

describe('POST /scrape validation', () => {
  it('rejects a non-URL with the field named', async () => {
    const { app } = await build();
    const res = await post(app, { url: 'not a url' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request', field: 'url' });
  });

  it.each([
    'file:///etc/passwd',
    'gopher://example.com/',
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:7402/structured',
    'http://[::1]/',
    'http://10.0.0.5/',
    'http://[::ffff:127.0.0.1]/',
  ])('refuses %s before any tier is called', async (url) => {
    const { app, deps } = await build();
    const res = await post(app, { url, formats: ['rawHtml'] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request', field: 'url' });
    expect(deps.fetchClient.fetch).not.toHaveBeenCalled();
    expect(deps.browserPool?.render).not.toHaveBeenCalled();
  });

  it('refuses a public name that resolves to a private address', async () => {
    const { app, deps } = await build({ resolveHost: async () => ['203.0.113.9', '10.1.2.3'] });
    const res = await post(app, { url: 'https://rebind.example.com/' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('10.1.2.3');
    expect(deps.fetchClient.fetch).not.toHaveBeenCalled();
  });

  it('lets an operator opt in to private addresses', async () => {
    const { app, deps } = await build({ allowPrivateUrls: true });
    const res = await post(app, { url: 'http://10.0.0.5/' });
    expect(res.statusCode).toBe(200);
    expect(deps.fetchClient.fetch).toHaveBeenCalledWith(expect.objectContaining({ allowPrivate: true }));
  });

  it('rejects formats nothing serves yet', async () => {
    const { app } = await build();
    const res = await post(app, { url: 'https://example.com', formats: ['summary'] });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('formats.0');
  });

  it('requires a schema for the json format', async () => {
    const { app } = await build();
    const res = await post(app, { url: 'https://example.com', formats: ['json'], jsonOptions: { prompt: 'title' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('jsonOptions.schema');
  });

  it('refuses extract and jsonOptions together', async () => {
    const { app } = await build();
    const res = await post(app, {
      url: 'https://example.com',
      extract: { schema: { type: 'object' } },
      jsonOptions: { schema: { type: 'object' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('jsonOptions');
  });

  it('rejects length keywords in the schema and says why', async () => {
    const { app } = await build();
    const res = await post(app, {
      url: 'https://example.com',
      formats: ['json'],
      jsonOptions: { schema: { type: 'object', properties: { items: { type: 'array', minItems: 3 } } } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_schema', field: 'jsonOptions.schema.properties.items.minItems' });
    expect(res.json().message).toContain('invent');
  });

  it('rejects an unknown provider', async () => {
    const { app } = await build();
    const res = await post(app, {
      url: 'https://example.com',
      formats: ['json'],
      jsonOptions: { schema: { type: 'object' }, provider: 'acme' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('jsonOptions.provider');
  });
});

describe('POST /scrape formats', () => {
  it('returns markdown by default with an empty warnings array', async () => {
    const { app } = await build();
    const res = await post(app, { url: 'https://example.com' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.markdown).toContain('Real article text');
    expect(body.data.html).toBeUndefined();
    expect(body.warnings).toEqual([]);
    expect(body.data.metadata).toMatchObject({ sourceUrl: 'https://example.com', tier: 'plain', mobile: false });
  });

  it('serves html with scripts, comments and handlers stripped, and rawHtml untouched', async () => {
    const { app } = await build();
    const res = await post(app, { url: 'https://example.com', formats: ['html', 'rawHtml'] });
    const { data } = res.json();
    expect(data.rawHtml).toContain('<script>');
    expect(data.html).not.toContain('<script>');
    expect(data.html).not.toContain('<!--');
    expect(data.html).not.toContain('onload');
    expect(data.html).not.toContain('javascript:');
    expect(data.html).toContain('<article>');
  });

  it('runs structured extraction through jsonOptions and reports usage', async () => {
    const { app, deps } = await build();
    const res = await post(app, {
      url: 'https://example.com',
      formats: ['markdown', 'json'],
      jsonOptions: {
        schema: { type: 'object', properties: { title: { type: 'string' } } },
        prompt: 'The page title',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.json).toEqual({ title: 'Title' });
    expect(body.usage).toMatchObject({
      model: 'claude-sonnet-4-5',
      tokens: { input: 120, output: 8 },
      blocksKept: 3,
      blocksTotal: 5,
      providerCost: { amount: null, currency: 'USD' },
    });
    expect(deps.extractClient.structured).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'anthropic', model: 'claude-sonnet-4-5', prompt: 'The page title' }),
    );
  });

  it('accepts extract as the alias of jsonOptions', async () => {
    const { app, deps } = await build();
    const res = await post(app, {
      url: 'https://example.com',
      formats: ['json'],
      extract: { schema: { type: 'object', properties: { title: { type: 'string' } } } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.json).toEqual({ title: 'Title' });
    expect(deps.extractClient.structured).toHaveBeenCalledTimes(1);
  });

  it('returns json: null with a warning when the provider is unavailable', async () => {
    const { app } = await build({
      extractClient: extractClient({
        structured: vi.fn(async () => {
          throw new StructuredError(503, 'No LLM credentials configured.');
        }),
      }),
    });
    const res = await post(app, {
      url: 'https://example.com',
      formats: ['markdown', 'json'],
      jsonOptions: { schema: { type: 'object' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.markdown).toContain('Real article text');
    expect(body.data.json).toBeNull();
    expect(body.warnings).toEqual(['json: No LLM credentials configured.']);
    expect(body.usage).toBeUndefined();
  });

  it('names the field when helix-extract rejects the request rather than the schema', async () => {
    const { app } = await build({
      extractClient: extractClient({
        structured: vi.fn(async () => {
          throw new StructuredError(400, '`model` is required with provider "ollama".', 'model');
        }),
      }),
    });
    const res = await post(app, {
      url: 'https://example.com',
      formats: ['json'],
      jsonOptions: { schema: { type: 'object' }, provider: 'ollama' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request', field: 'jsonOptions.model' });
  });

  it('surfaces a schema rejection from helix-extract as a 400', async () => {
    const { app } = await build({
      extractClient: extractClient({
        structured: vi.fn(async () => {
          throw new StructuredError(400, 'This schema has 40 fields.');
        }),
      }),
    });
    const res = await post(app, {
      url: 'https://example.com',
      formats: ['json'],
      jsonOptions: { schema: { type: 'object' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_schema', field: 'jsonOptions.schema' });
  });

  it('returns chunks with anchors', async () => {
    const { app, deps } = await build();
    const res = await post(app, {
      url: 'https://example.com',
      formats: ['chunks'],
      chunk: { strategy: 'heading', maxTokens: 256 },
    });
    expect(res.json().data.chunks).toEqual([
      { text: 'chunk one', anchor: 'a1', tokens: 3, headingPath: ['Title'], index: 0 },
    ]);
    expect(deps.extractClient.chunk).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'heading', maxTokens: 256 }),
    );
  });

  it('returns the screenshot as a PNG data URI', async () => {
    const { app } = await build();
    const res = await post(app, { url: 'https://example.com', formats: ['screenshot'], tier: 'chromium' });
    expect(res.json().data.screenshot).toBe('data:image/png;base64,iVBORw0KGgo=');
  });
});

describe('POST /scrape proxy and mobile', () => {
  it('uses the operator proxy for "auto" when one is configured', async () => {
    const { app, deps } = await build({ proxyUrl: 'http://proxy.local:8080' });
    await post(app, { url: 'https://example.com', proxy: 'auto' });
    expect(deps.fetchClient.fetch).toHaveBeenCalledWith(expect.objectContaining({ proxy: 'http://proxy.local:8080' }));
  });

  it('goes direct for "none" even when a proxy is configured', async () => {
    const { app, deps } = await build({ proxyUrl: 'http://proxy.local:8080' });
    await post(app, { url: 'https://example.com', proxy: 'none' });
    expect(deps.fetchClient.fetch).toHaveBeenCalledWith(expect.objectContaining({ proxy: undefined }));
  });

  it('rejects "stealth" when no proxy is configured, naming the setting', async () => {
    const { app } = await build();
    const res = await post(app, { url: 'https://example.com', proxy: 'stealth' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'proxy_unavailable', field: 'proxy' });
    expect(res.json().message).toContain('HELIX_PROXY_URL');
  });

  it('passes a caller-supplied proxy through', async () => {
    const { app, deps } = await build();
    await post(app, { url: 'https://example.com', proxy: { url: 'http://user:pass@mine:3128', geo: 'DE' } });
    expect(deps.fetchClient.fetch).toHaveBeenCalledWith(expect.objectContaining({ proxy: 'http://user:pass@mine:3128' }));
  });

  it('forces a browser for mobile and renders with the phone viewport', async () => {
    const { app, deps } = await build();
    const res = await post(app, { url: 'https://example.com', mobile: true });
    expect(res.statusCode).toBe(200);
    expect(deps.fetchClient.fetch).not.toHaveBeenCalled();
    expect(deps.browserPool?.render).toHaveBeenCalledWith(expect.objectContaining({ mobile: true, engine: 'chromium' }));
    expect(res.json().data.metadata).toMatchObject({ tier: 'chromium', mobile: true });
  });

  it('warns when mobile is combined with a tier that has no viewport', async () => {
    const { app } = await build();
    const res = await post(app, { url: 'https://example.com', mobile: true, tier: 'plain' });
    expect(res.json().warnings[0]).toContain('mobile');
    expect(res.json().data.metadata.mobile).toBe(false);
  });

  it('warns when mobile is combined with lightpanda and does not report a phone viewport', async () => {
    const { app } = await build();
    const res = await post(app, { url: 'https://example.com', mobile: true, tier: 'lightpanda' });
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings[0]).toContain('lightpanda');
    expect(res.json().data.metadata).toMatchObject({ tier: 'lightpanda', mobile: false });
  });
});

describe('POST /scrape failures', () => {
  it('reports a challenge as a typed failure inside a 200', async () => {
    const challenge = `<html><head><title>Just a moment...</title></head><body><div class="cf-browser-verification">Checking your browser</div></body></html>`;
    const { app } = await build({
      fetchClient: fetchClientReturning(challenge, 403),
      browserPool: browserPool(challenge),
      extractClient: extractClient({
        extract: vi.fn(async () => ({
          markdown: 'Checking your browser',
          text: 'Checking your browser',
          links: [],
          extractorUsed: 'trafilatura',
          contentHash: 'x',
        })),
      }),
    });
    const res = await post(app, { url: 'https://example.com', tier: 'plain' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.failure.tiersAttempted).toEqual(['plain']);
    expect(body.warnings).toEqual([]);
  });
});
