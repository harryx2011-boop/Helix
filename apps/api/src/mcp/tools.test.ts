import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { deref, flattenAllOf, loadSpec, parseSpec, type OpenApiSpec } from './spec.js';
import { CONFIRM_REQUIRED, generateTools, planRequest, toolName } from './tools.js';
import { registerMcp } from './server.js';
import { InternalTickets, registerAuth } from '../core/auth.js';
import { RateLimiter } from '../core/rate-limit.js';
import type { ApiKey } from '../core/api-keys.js';

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

describe('planRequest query parameter values', () => {
  const SPEC = parseSpec(`
openapi: 3.1.0
info: { title: Query, version: 0.0.1 }
paths:
  /search:
    get:
      summary: Search
      operationId: search
      parameters:
        - { name: tags, in: query, schema: { type: array, items: { type: string } } }
        - { name: limit, in: query, schema: { type: integer } }
        - { name: fresh, in: query, schema: { type: boolean } }
        - { name: filter, in: query, schema: { type: object } }
      responses:
        '200': { description: Results. }
`);
  const tool = () => generateTools(SPEC).find((t) => t.name === 'helix_search')!;

  it('appends each array element as its own query entry', () => {
    const planned = planRequest(tool(), { tags: ['a', 'b', 'c'] });
    expect(planned.url).toBe('/v1/search?tags=a&tags=b&tags=c');
  });

  it('stringifies a boolean scalar', () => {
    const planned = planRequest(tool(), { fresh: true });
    expect(planned.url).toBe('/v1/search?fresh=true');
  });

  it('stringifies a number scalar', () => {
    const planned = planRequest(tool(), { limit: 5 });
    expect(planned.url).toBe('/v1/search?limit=5');
  });

  it('rejects a plain object with an error naming the parameter', () => {
    expect(() => planRequest(tool(), { filter: { status: 'open' } })).toThrow(/filter/);
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

  // A gate entry whose path does not exist in the spec matches nothing and
  // gates nothing. Batch cancel was listed as /batch/scrape/{jobId} while the
  // spec says {id}, so the tool shipped without confirm.
  it('gates only paths the spec has, so batch cancel requires confirm', () => {
    const spec = loadSpec();
    const paths = Object.keys(spec.paths);
    for (const entry of CONFIRM_REQUIRED) expect(paths).toContain(entry.path);
    const cancel = generateTools(spec).find((t) => t.name === 'helix_cancel_batch_scrape')!;
    expect(cancel.inputSchema['required']).toContain('confirm');
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

  it('exposes only the allowlisted tools when one is configured', async () => {
    // Every tool schema is loaded into the agent's context on connect; an
    // operator who wants the core dozen must be able to say so.
    const app = Fastify();
    await app.register(async (i) => { i.post('/scrape', async () => ({})); i.get('/jobs/:id', async () => ({})); }, { prefix: '/v1' });
    await registerMcp(app, { spec: MINI_SPEC, only: ['helix_get_job', 'helix_nope'] });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as { port: number }).port;
    const client = new Client({ name: 'test', version: '0.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)) as unknown as Transport);
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['helix_get_job']);
      const r = await client.callTool({ name: 'helix_scrape', arguments: { url: 'https://example.com' } });
      expect(r.isError).toBe(true);
    } finally {
      await client.close();
      await app.close();
    }
  });

  it('lists only live tools and forwards calls, with the bearer key, through the HTTP routes', async () => {
    const { app, client, seen } = await boot(MINI_SPEC);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['helix_scrape', 'helix_get_job']);

      const ok = await client.callTool({ name: 'helix_scrape', arguments: { url: 'https://example.com' } });
      expect(ok.isError).toBeFalsy();
      // One line: a pretty-printed envelope spends tokens on indentation.
      expect((ok.content as { text: string }[])[0]!.text).not.toContain('\n');
      expect(JSON.parse((ok.content as { text: string }[])[0]!.text)).toEqual({
        success: true,
        data: { markdown: '# hi' },
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

describe('/mcp behind the auth hook', () => {
  const KEY: ApiKey = {
    id: 'key-1',
    name: 'test',
    keyPrefix: 'helix-tes',
    rateLimit: 4,
    createdAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  };

  async function boot() {
    const app = Fastify();
    const verified: string[] = [];
    const seen: { apiKeyId?: string | undefined; ticket?: string | undefined }[] = [];
    const tickets = new InternalTickets();
    registerAuth(app, {
      verifyApiKey: async (token) => {
        verified.push(token);
        return token === 'helix-testkey' ? KEY : undefined;
      },
      limiter: new RateLimiter({ limit: 1000, windowMs: 60_000 }),
      tickets,
    });
    await app.register(
      async (instance) => {
        instance.post('/scrape', async (request) => {
          seen.push({ apiKeyId: request.apiKey?.id, ticket: request.headers['x-helix-internal-ticket'] as string | undefined });
          return { success: true, data: { markdown: '# hi' }, warnings: [] };
        });
      },
      { prefix: '/v1' },
    );
    await registerMcp(app, { spec: MINI_SPEC, tickets });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return { app, url: `http://127.0.0.1:${port}/mcp`, verified, seen, tickets };
  }

  const rpc = (url: string, authorization: string | undefined, body: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: {
        ...(authorization ? { authorization } : {}),
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  it('verifies the key once per MCP request, and the replay rides a ticket', async () => {
    const { app, url, verified, seen, tickets } = await boot();
    try {
      const call = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'helix_scrape', arguments: { url: 'https://example.com' } },
      };
      const response = await rpc(url, 'Bearer helix-testkey', call);
      expect(await response.text()).toContain('# hi');
      expect(verified).toEqual(['helix-testkey']);
      expect(seen).toHaveLength(1);
      expect(seen[0]!.apiKeyId).toBe(KEY.id);
      expect(seen[0]!.ticket).toMatch(/^[0-9a-f-]{36}$/);
      expect(tickets.size).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('carries X-RateLimit-* on MCP responses and counts one token per request', async () => {
    const { app, url } = await boot();
    try {
      const list = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
      const first = await rpc(url, 'Bearer helix-testkey', list);
      await first.text();
      expect(first.status).toBe(200);
      expect(first.headers.get('x-ratelimit-limit')).toBe('4');
      expect(first.headers.get('x-ratelimit-remaining')).toBe('3');
      expect(first.headers.get('x-ratelimit-reset')).toMatch(/^\d+$/);

      const call = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'helix_scrape', arguments: { url: 'https://example.com' } },
      };
      const second = await rpc(url, 'Bearer helix-testkey', call);
      expect((await second.text())).toContain('# hi');
      expect(second.headers.get('x-ratelimit-remaining')).toBe('2');

      await (await rpc(url, 'Bearer helix-testkey', call)).text();
      await (await rpc(url, 'Bearer helix-testkey', call)).text();
      const limited = await rpc(url, 'Bearer helix-testkey', call);
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBeTruthy();
      expect(await limited.json()).toMatchObject({ error: 'rate_limited' });
    } finally {
      await app.close();
    }
  });

  it('rejects a missing or unknown key before any tool runs', async () => {
    const { app, url, seen } = await boot();
    try {
      const call = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'helix_scrape', arguments: { url: 'https://example.com' } },
      };
      const anonymous = await rpc(url, undefined, call);
      expect(anonymous.status).toBe(401);
      const unknown = await rpc(url, 'Bearer helix-nope', call);
      expect(unknown.status).toBe(401);
      expect(await unknown.json()).toMatchObject({ error: 'unauthorized' });
      expect(seen).toHaveLength(0);

      const forged = await rpc(url, undefined, { ...call, id: 2 });
      expect(forged.status).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('confirm gate on irreversible operations', () => {
  // A curl caller who sends DELETE chose that verb. A model inferred it from a
  // description, and CallTool hands both to app.inject identically. The gate is
  // at the MCP boundary because that is where the asymmetry is.
  const GATED_SPEC = parseSpec(`
openapi: 3.1.0
info: { title: Gated, version: 0.0.1 }
paths:
  /providers/{provider}:
    parameters:
      - { name: provider, in: path, required: true, schema: { type: string } }
    put:
      summary: Store your key for a provider
      operationId: putProvider
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [apiKey]
              properties:
                apiKey: { type: string }
      responses:
        '200': { description: Stored. }
  /monitor/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    delete:
      summary: Delete a monitor
      operationId: deleteMonitor
      responses:
        '204': { description: Deleted. }
  /scrape:
    post:
      summary: Read one URL
      operationId: scrape
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                url: { type: string }
      responses:
        '200': { description: The page. }
`);

  const toolFor = (name: string) => {
    const tool = generateTools(GATED_SPEC).find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    return tool;
  };

  it('advertises confirm on a gated operation and requires it', () => {
    for (const name of ['helix_put_provider', 'helix_delete_monitor']) {
      const tool = toolFor(name);
      const props = tool.inputSchema['properties'] as Record<string, unknown>;
      expect(props['confirm'], `${name} advertises confirm`).toBeDefined();
      expect(tool.inputSchema['required'], `${name} requires confirm`).toContain('confirm');
      expect(tool.description, `${name} explains why`).toMatch(/Requires confirm/);
    }
  });

  it('leaves an ordinary operation alone', () => {
    // Gating /scrape would mean confirming a scrape. Most mutations here ARE
    // the product; only the ones a caller cannot undo are listed.
    const tool = toolFor('helix_scrape');
    const props = tool.inputSchema['properties'] as Record<string, unknown>;
    expect(props['confirm']).toBeUndefined();
    expect(tool.inputSchema['required'] ?? []).not.toContain('confirm');
    expect(tool.description).not.toMatch(/Requires confirm/);
  });

  it('never puts confirm into the HTTP request', () => {
    // It is an MCP-layer argument. The route has never heard of it, and a body
    // carrying an unexpected field is a body the route rejects.
    const planned = planRequest(toolFor('helix_put_provider'), {
      provider: 'anthropic',
      apiKey: 'sk-ant-xxxxxxxx',
      confirm: true,
    });
    expect(planned.url).toBe('/v1/providers/anthropic');
    expect(planned.body).toEqual({ apiKey: 'sk-ant-xxxxxxxx' });
    expect(planned.body).not.toHaveProperty('confirm');
  });

  it('strips confirm even from an ungated tool', () => {
    const planned = planRequest(toolFor('helix_scrape'), { url: 'https://x.test', confirm: true });
    expect(planned.body).toEqual({ url: 'https://x.test' });
  });
});

describe('confirm gate refuses a real dispatch', () => {
  // The tests above cover the SCHEMA half. This one covers enforcement, which
  // is the half that matters: a `required` entry in an inputSchema describes
  // what a caller should send and checks nothing. Mutation testing on
  // 2026-08-28 found exactly this gap — disabling the server-side branch left
  // every schema assertion green.
  const GATED = parseSpec(`
openapi: 3.1.0
info: { title: Gated, version: 0.0.1 }
paths:
  /monitor/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    delete:
      summary: Delete a monitor
      operationId: deleteMonitor
      responses:
        '204': { description: Deleted. }
`);

  async function boot() {
    const app = Fastify();
    const deleted: string[] = [];
    await app.register(
      async (instance) => {
        instance.delete<{ Params: { id: string } }>('/monitor/:id', async (request, reply) => {
          deleted.push(request.params.id);
          return reply.code(204).send();
        });
      },
      { prefix: '/v1' },
    );
    await registerMcp(app, { spec: GATED });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const client = new Client({ name: 'test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { authorization: 'Bearer helix-testkey' } },
    });
    await client.connect(transport as unknown as Transport);
    return { app, client, deleted };
  }

  it('does not reach the route without confirm, and does with it', async () => {
    const { app, client, deleted } = await boot();
    try {
      const refused = await client.callTool({ name: 'helix_delete_monitor', arguments: { id: 'mon-1' } });
      expect(refused.isError).toBe(true);
      expect((refused.content as { text: string }[])[0]!.text).toContain('confirmation_required');
      expect(deleted, 'the route must not have run').toEqual([]);

      const confirmed = await client.callTool({
        name: 'helix_delete_monitor',
        arguments: { id: 'mon-1', confirm: true },
      });
      expect(confirmed.isError).toBeFalsy();
      expect(deleted, 'the route runs once confirmed').toEqual(['mon-1']);
    } finally {
      await client.close();
      await app.close();
    }
  });

  it('treats a non-true confirm as absent', async () => {
    const { app, client, deleted } = await boot();
    try {
      for (const value of ['true', 1, {}]) {
        const r = await client.callTool({
          name: 'helix_delete_monitor',
          arguments: { id: 'mon-2', confirm: value as never },
        });
        expect(r.isError, `confirm=${JSON.stringify(value)} must be refused`).toBe(true);
      }
      expect(deleted).toEqual([]);
    } finally {
      await client.close();
      await app.close();
    }
  });
});
