import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { deref, flattenAllOf, loadSpec, parseSpec, type OpenApiSpec } from './spec.js';
import { generateTools, planRequest, toolName } from './tools.js';
import { registerMcp } from './server.js';

const MINI_SPEC = parseSpec(`
openapi: 3.1.0
info: { title: Mini, version: 0.0.1 }
paths:
  /scrape:
    post:
      summary: Read one URL
      description: Fetches a page.
      operationId: scrape
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ScrapeRequest' }
      responses:
        '200': { description: The document. }
  /jobs/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      - { name: cursor, in: query, schema: { type: string }, description: Continue. }
    get:
      summary: Get job
      operationId: getJob
      responses:
        '200': { description: Job state. }
    delete:
      summary: Cancel job
      operationId: cancelJob
      responses:
        '200': { description: Cancelled. }
  /ghost:
    post:
      summary: Not served
      operationId: ghost
      responses:
        '200': { description: Never. }
components:
  schemas:
    Options:
      type: object
      properties:
        formats:
          type: array
          items: { $ref: '#/components/schemas/Format' }
        nested: { $ref: '#/components/schemas/Options' }
    Format:
      type: string
      enum: [markdown, html]
    ScrapeRequest:
      allOf:
        - type: object
          required: [url]
          properties:
            url: { type: string, format: uri }
        - $ref: '#/components/schemas/Options'
`);

describe('spec helpers', () => {
  it('inlines $refs and stops at cycles', () => {
    const resolved = deref(MINI_SPEC.components!.schemas!['Options'], MINI_SPEC) as {
      properties: { formats: { items: unknown } };
    };
    expect(resolved.properties.formats.items).toEqual({ type: 'string', enum: ['markdown', 'html'] });
    expect(JSON.stringify(resolved)).not.toContain('$ref');
  });

  it('flattens allOf into one object schema', () => {
    const flat = flattenAllOf(deref(MINI_SPEC.components!.schemas!['ScrapeRequest'], MINI_SPEC) as Record<string, unknown>);
    expect(flat['type']).toBe('object');
    expect(Object.keys(flat['properties'] as object)).toEqual(['url', 'formats', 'nested']);
    expect(flat['required']).toEqual(['url']);
    expect(flat).not.toHaveProperty('allOf');
  });
});

describe('generateTools', () => {
  it('names tools helix_<snake_case operationId>', () => {
    expect(toolName('scrape')).toBe('helix_scrape');
    expect(toolName('getJobErrors')).toBe('helix_get_job_errors');
  });

  it('emits one tool per live operation, skipping unserved paths', () => {
    const tools = generateTools(MINI_SPEC, (_method, path) => path !== '/ghost');
    expect(tools.map((t) => t.name)).toEqual(['helix_scrape', 'helix_get_job', 'helix_cancel_job']);
  });

  it('derives the body schema, description and response note from the spec', () => {
    const [scrape] = generateTools(MINI_SPEC);
    expect(scrape!.description).toBe('Read one URL\n\nFetches a page.\n\nReturns: The document.');
    expect(scrape!.inputSchema).toEqual({
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri' },
        formats: { type: 'array', items: { type: 'string', enum: ['markdown', 'html'] } },
        nested: { type: 'object', description: 'Recursive: Options' },
      },
      required: ['url'],
    });
    expect(scrape!.hasBody).toBe(true);
  });

  it('turns path and query parameters into required/optional properties', () => {
    const tools = generateTools(MINI_SPEC);
    const getJob = tools.find((t) => t.name === 'helix_get_job')!;
    expect(getJob.inputSchema).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        cursor: { type: 'string', description: 'Continue.' },
      },
      required: ['id'],
    });
    expect(getJob.hasBody).toBe(false);
  });

  it('plans HTTP requests from tool arguments', () => {
    const tools = generateTools(MINI_SPEC);
    const getJob = tools.find((t) => t.name === 'helix_get_job')!;
    expect(planRequest(getJob, { id: 'a b', cursor: 'c' })).toEqual({ method: 'GET', url: '/v1/jobs/a%20b?cursor=c' });

    const scrape = tools.find((t) => t.name === 'helix_scrape')!;
    expect(planRequest(scrape, { url: 'https://example.com', formats: ['markdown'] })).toEqual({
      method: 'POST',
      url: '/v1/scrape',
      body: { url: 'https://example.com', formats: ['markdown'] },
    });
  });
});

describe('the real openapi.yaml', () => {
  it('yields a tool for every operationId, each with a description and an object schema', () => {
    const spec = loadSpec();
    const tools = generateTools(spec);
    const names = tools.map((t) => t.name);
    for (const expected of ['helix_scrape', 'helix_map', 'helix_crawl', 'helix_search', 'helix_get_job', 'helix_health']) {
      expect(names).toContain(expected);
    }
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema['type']).toBe('object');
      expect(JSON.stringify(tool.inputSchema)).not.toContain('$ref');
    }
    const scrape = tools.find((t) => t.name === 'helix_scrape')!;
    expect(scrape.inputSchema['required']).toEqual(['url']);
    expect(scrape.inputSchema['properties']).toHaveProperty('formats');
  });
});

describe('/mcp over streamable HTTP', () => {
  async function boot(spec: OpenApiSpec) {
    const app = Fastify();
    const seen: { auth?: string | undefined; body?: unknown }[] = [];
    await app.register(
      async (instance) => {
        instance.post('/scrape', async (request) => {
          seen.push({ auth: request.headers.authorization, body: request.body });
          return { success: true, data: { markdown: '# hi' }, warnings: [] };
        });
        instance.get<{ Params: { id: string } }>('/jobs/:id', async (request, reply) =>
          reply.code(404).send({ error: 'not_found', message: `no job ${request.params.id}` }),
        );
      },
      { prefix: '/v1' },
    );
    await registerMcp(app, { spec });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const client = new Client({ name: 'test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { authorization: 'Bearer helix-testkey' } },
    });
    await client.connect(transport as unknown as Transport);
    return { app, client, seen };
  }

  it('lists only live tools and forwards calls, with the bearer key, through the HTTP routes', async () => {
    const { app, client, seen } = await boot(MINI_SPEC);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['helix_scrape', 'helix_get_job']);

      const ok = await client.callTool({ name: 'helix_scrape', arguments: { url: 'https://example.com' } });
      expect(ok.isError).toBeFalsy();
      expect(JSON.parse((ok.content as { text: string }[])[0]!.text)).toEqual({
        success: true,
        data: { markdown: '# hi' },
        warnings: [],
      });
      expect(seen[0]).toEqual({ auth: 'Bearer helix-testkey', body: { url: 'https://example.com' } });

      const missing = await client.callTool({ name: 'helix_get_job', arguments: { id: 'nope' } });
      expect(missing.isError).toBe(true);
      expect((missing.content as { text: string }[])[0]!.text).toContain('no job nope');
    } finally {
      await client.close();
      await app.close();
    }
  });
});
