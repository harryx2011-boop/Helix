import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerEnrich, type EnrichRouteDeps } from './enrich.js';
import type { ExtractClient, StructuredResult } from '../extract/client.js';
import type { FetchClient } from '../fetch/client.js';
import type { SearchProvider } from '../search/providers.js';

const ABOUT = 'https://acme.example/about';

const ABOUT_TEXT =
  'Acme Robotics is headquartered in Rotterdam, the Netherlands. The company was ' +
  'founded in 2011 by two engineers and now employs 240 people across three sites. ' +
  'We build warehouse automation for mid-market distributors and publish reliability ' +
  'data every quarter for every customer who asks for it. Our flagship picker handles ' +
  '1,200 units an hour and is deployed at sixty customers across the Benelux region, ' +
  'with support answered inside one business day by the team in Rotterdam.';

const ABOUT_HTML =
  '<!doctype html><html><head><meta property="og:site_name" content="Acme Robotics"></head>' +
  `<body><p>${ABOUT_TEXT}</p></body></html>`;

const PARKED_TEXT =
  'This domain is for sale. Buy this domain now. Related searches: robotics, warehouse ' +
  'automation, logistics software, distribution. The owner has listed this name with a broker ' +
  'and offers are reviewed weekly by the registrar handling the transfer for interested buyers.';

function fetchClient(pages: Record<string, { html: string; status?: number }>): FetchClient {
  return {
    fetch: vi.fn(async ({ url }: { url: string }) => {
      const page = pages[url];
      if (!page) return { success: false, headers: {}, timingMs: 1, error: 'not found' };
      return { success: true, status: page.status ?? 200, headers: { 'content-type': 'text/html' }, body: page.html, timingMs: 1 };
    }),
  } as unknown as FetchClient;
}

function extractClient(structured?: Partial<StructuredResult>): ExtractClient {
  return {
    extract: vi.fn(async ({ html, url }: { html: string; url: string }) => ({
      markdown: stripTags(html),
      text: stripTags(html),
      title: 'Acme Robotics',
      links: [],
      extractorUsed: 'trafilatura',
      contentHash: `hash-${url}`,
    })),
    structured: vi.fn(async () => ({
      data: {},
      sources: [],
      tokensInput: 100,
      tokensOutput: 20,
      modelUsed: 'test-model',
      blocksKept: 0,
      blocksTotal: 0,
      ...structured,
    })),
  } as unknown as ExtractClient;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchProvider(urls: string[]): SearchProvider {
  return {
    name: 'test',
    configured: () => true,
    search: vi.fn(async () => ({
      hits: urls.map((url, i) => ({ title: 'hit', url, position: i, source: 'web' as const })),
      failures: [],
    })),
  };
}

async function build(deps: Partial<EnrichRouteDeps>): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(
    async (instance) => {
      await registerEnrich(instance, {
        fetchClient: deps.fetchClient ?? fetchClient({}),
        extractClient: deps.extractClient ?? extractClient(),
        searchProvider: deps.searchProvider,
        concurrency: 2,
      });
    },
    { prefix: '/v1' },
  );
  await app.ready();
  return app;
}

async function post(app: FastifyInstance, body: unknown) {
  const response = await app.inject({ method: 'POST', url: '/v1/enrich', payload: body as object });
  return { status: response.statusCode, body: response.json() };
}

describe('POST /v1/enrich validation', () => {
  it('rejects a request with no fields', async () => {
    const app = await build({});
    const { status, body } = await post(app, { subject: 'Acme', fields: [] });
    expect(status).toBe(400);
    expect(body.error).toBe('invalid_request');
  });

  it('rejects a duplicate field name', async () => {
    const app = await build({});
    const { status, body } = await post(app, {
      subject: 'Acme',
      fields: [{ name: 'city' }, { name: 'city' }],
    });
    expect(status).toBe(400);
    expect(body.message).toContain('more than once');
  });

  it('rejects a non-http url', async () => {
    const app = await build({});
    const { status } = await post(app, { subject: 'Acme', fields: [{ name: 'city' }], urls: ['ftp://x.example'] });
    expect(status).toBe(400);
  });

  it('answers 503 when no urls are given and no search backend is configured', async () => {
    const app = await build({});
    const { status, body } = await post(app, { subject: 'Acme', fields: [{ name: 'city' }] });
    expect(status).toBe(503);
    expect(body.error).toBe('search_unavailable');
  });
});

describe('POST /v1/enrich guardrails', () => {
  it('rejects a parked page and returns null with all_sources_rejected', async () => {
    const app = await build({
      fetchClient: fetchClient({ [ABOUT]: { html: `<html><body>${PARKED_TEXT}</body></html>` } }),
    });

    const { status, body } = await post(app, {
      subject: 'Acme Robotics',
      fields: [{ name: 'headquarters' }],
      urls: [ABOUT],
    });

    expect(status).toBe(200);
    expect(body.data.headquarters).toMatchObject({ value: null, reason: 'all_sources_rejected', confidence: null });
    expect(body.sources.rejected[0]).toMatchObject({ url: ABOUT, reason: 'parked_domain' });
  });

  it('rejects a placeholder page', async () => {
    const app = await build({
      fetchClient: fetchClient({
        [ABOUT]: {
          html:
            '<html><body>Coming soon. Our new site is under construction and will launch shortly. ' +
            'Please check back later for details about our products, our team and how to reach us ' +
            'once the new pages are finished and published for everyone.</body></html>',
        },
      }),
    });
    const { body } = await post(app, { subject: 'Acme', fields: [{ name: 'city' }], urls: [ABOUT] });
    expect(body.sources.rejected[0]).toMatchObject({ reason: 'placeholder_page' });
  });

  it('never fetches a blocklisted social URL', async () => {
    const client = fetchClient({});
    const app = await build({ fetchClient: client });
    const { body } = await post(app, {
      subject: 'Acme',
      fields: [{ name: 'city' }],
      urls: ['https://x.com/acme'],
    });
    expect(body.sources.rejected[0]).toMatchObject({ reason: 'blocklisted_social' });
  });
});

describe('POST /v1/enrich field routing', () => {
  it('answers from metadata without calling the model at all', async () => {
    const client = extractClient();
    const app = await build({
      fetchClient: fetchClient({ [ABOUT]: { html: ABOUT_HTML } }),
      extractClient: client,
    });

    const { body } = await post(app, {
      subject: 'Acme Robotics',
      fields: [{ name: 'name' }],
      urls: [ABOUT],
    });

    expect(body.data.name).toMatchObject({ value: 'Acme Robotics', phase: 'metadata', confidence: 'high' });
    // The whole point of routing: structure answered it, so no model call happened.
    expect(client.structured).not.toHaveBeenCalled();
    expect(body.usage).toBeUndefined();
  });

  it('calls the model only for the fields structure could not answer', async () => {
    const client = extractClient({
      data: {
        headquarters: { value: 'Rotterdam', sourceUrl: ABOUT, citation: ABOUT_TEXT.slice(0, 60) },
      },
    });
    const app = await build({ fetchClient: fetchClient({ [ABOUT]: { html: ABOUT_HTML } }), extractClient: client });

    const { body } = await post(app, {
      subject: 'Acme Robotics',
      fields: [{ name: 'name' }, { name: 'headquarters' }],
      urls: [ABOUT],
    });

    expect(client.structured).toHaveBeenCalledTimes(1);
    const schema = vi.mocked(client.structured).mock.calls[0]?.[0].schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(['headquarters']);

    expect(body.data.name.phase).toBe('metadata');
    expect(body.data.headquarters).toMatchObject({ value: 'Rotterdam', phase: 'model', confidence: 'medium' });
  });

  it('fences the page text it sends to the model', async () => {
    const client = extractClient();
    const app = await build({ fetchClient: fetchClient({ [ABOUT]: { html: ABOUT_HTML } }), extractClient: client });
    await post(app, { subject: 'Acme', fields: [{ name: 'headquarters' }], urls: [ABOUT] });

    const content = vi.mocked(client.structured).mock.calls[0]?.[0].content ?? '';
    expect(content).toContain(`<<<HELIX_UNTRUSTED origin="${ABOUT}"`);
    expect(content).toContain('>>>HELIX_UNTRUSTED');
  });
});

describe('POST /v1/enrich never invents a value', () => {
  it('nulls a field the model hallucinated, and says why', async () => {
    // The model returns a confident, plausible answer with a citation that is
    // nowhere in the page it was fetched from. This is the failure the endpoint
    // exists to catch.
    const client = extractClient({
      data: {
        headquarters: {
          value: 'Berlin',
          sourceUrl: ABOUT,
          citation: 'Acme Robotics is headquartered in Berlin, Germany, where it was founded in 2011.',
        },
      },
    });
    const app = await build({ fetchClient: fetchClient({ [ABOUT]: { html: ABOUT_HTML } }), extractClient: client });

    const { body } = await post(app, {
      subject: 'Acme Robotics',
      fields: [{ name: 'headquarters' }],
      urls: [ABOUT],
    });

    expect(body.data.headquarters).toMatchObject({
      value: null,
      confidence: null,
      citation: null,
      reason: 'citation_not_in_source',
    });
  });

  it('nulls a field the model attributed to a page that was never fetched', async () => {
    const client = extractClient({
      data: {
        headquarters: {
          value: 'Rotterdam',
          sourceUrl: 'https://linkedin.example/company/acme',
          citation: 'Acme Robotics is headquartered in Rotterdam, the Netherlands.',
        },
      },
    });
    const app = await build({ fetchClient: fetchClient({ [ABOUT]: { html: ABOUT_HTML } }), extractClient: client });

    const { body } = await post(app, { subject: 'Acme', fields: [{ name: 'headquarters' }], urls: [ABOUT] });
    expect(body.data.headquarters).toMatchObject({ value: null, reason: 'unknown_source_url' });
  });

  it('returns a grounded value with the passage that grounds it', async () => {
    const citation = 'Acme Robotics is headquartered in Rotterdam, the Netherlands.';
    const client = extractClient({
      data: { headquarters: { value: 'Rotterdam', sourceUrl: ABOUT, citation } },
    });
    const app = await build({ fetchClient: fetchClient({ [ABOUT]: { html: ABOUT_HTML } }), extractClient: client });

    const { body } = await post(app, { subject: 'Acme', fields: [{ name: 'headquarters' }], urls: [ABOUT] });

    expect(body.data.headquarters).toMatchObject({
      value: 'Rotterdam',
      confidence: 'medium',
      reason: null,
      citation: { url: ABOUT, quote: citation, locator: 'body' },
    });
    expect(body.sources.used).toEqual([ABOUT]);
  });

  it('reports model_unavailable rather than not_stated when the model call fails', async () => {
    const client = {
      extract: vi.fn(async ({ html }: { html: string }) => ({
        markdown: stripTags(html),
        text: stripTags(html),
        links: [],
        extractorUsed: 't',
        contentHash: 'h',
      })),
      structured: vi.fn(async () => {
        throw new Error('no provider configured');
      }),
    } as unknown as ExtractClient;

    const app = await build({ fetchClient: fetchClient({ [ABOUT]: { html: ABOUT_HTML } }), extractClient: client });
    const { body } = await post(app, { subject: 'Acme', fields: [{ name: 'headquarters' }], urls: [ABOUT] });

    expect(body.data.headquarters).toMatchObject({ value: null, reason: 'model_unavailable' });
  });

  it('discovers sources through search when no urls are given', async () => {
    const client = extractClient();
    const app = await build({
      fetchClient: fetchClient({ [ABOUT]: { html: ABOUT_HTML } }),
      extractClient: client,
      searchProvider: searchProvider([ABOUT]),
    });

    const { body } = await post(app, { subject: 'Acme Robotics', fields: [{ name: 'name' }] });
    expect(body.data.name).toMatchObject({ value: 'Acme Robotics', phase: 'metadata' });
  });
});
