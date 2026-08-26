import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAgent, type AgentRouteDeps } from './agent.js';
import { ExtractHttpError, StructuredError, type ExtractClient, type SchemaResult } from '../extract/client.js';

const SCHEMA: SchemaResult = {
  schema: {
    type: 'object',
    properties: { title: { type: 'string', description: 'The page title' } },
    required: ['title'],
  },
  summary: 'Extracts 1 field: title.',
  tokensInput: 120,
  tokensOutput: 40,
  modelUsed: 'claude-sonnet-4-5',
};

function extractClient(overrides: Partial<{ schema: unknown }> = {}): ExtractClient {
  return {
    schema: vi.fn(async () => SCHEMA),
    ...overrides,
  } as unknown as ExtractClient;
}

async function build(deps: Partial<AgentRouteDeps> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(
    async (instance) => {
      await registerAgent(instance, { extractClient: deps.extractClient ?? extractClient() });
    },
    { prefix: '/v1' },
  );
  await app.ready();
  return app;
}

async function post(app: FastifyInstance, body: unknown) {
  const response = await app.inject({ method: 'POST', url: '/v1/agent/schema', payload: body as object });
  return { status: response.statusCode, body: response.json() };
}

describe('POST /v1/agent/schema', () => {
  it('returns the generated schema, summary and usage on success', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });
    const { status, body } = await post(app, { prompt: 'pricing plans and their monthly cost' });

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      schema: SCHEMA.schema,
      summary: SCHEMA.summary,
      usage: { tokens: { input: 120, output: 40 }, model: 'claude-sonnet-4-5' },
    });
    expect(client.schema).toHaveBeenCalledWith({
      prompt: 'pricing plans and their monthly cost',
      urls: undefined,
      hint: undefined,
      instruction: undefined,
    });
  });

  it('forwards urls, hint and instruction to the extract client', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });

    await post(app, {
      prompt: 'product listings',
      urls: ['https://example.com/shop'],
      hint: { type: 'object', properties: { name: { type: 'string' } } },
      instruction: 'also capture SKU',
    });

    expect(client.schema).toHaveBeenCalledWith({
      prompt: 'product listings',
      urls: ['https://example.com/shop'],
      hint: { type: 'object', properties: { name: { type: 'string' } } },
      instruction: 'also capture SKU',
    });
  });

  it('rejects a missing prompt', async () => {
    const app = await build();
    const { status, body } = await post(app, {});

    expect(status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('prompt');
  });

  it('rejects a prompt over 2000 characters', async () => {
    const app = await build();
    const { status, body } = await post(app, { prompt: 'x'.repeat(2001) });

    expect(status).toBe(400);
    expect(body.field).toBe('prompt');
  });

  it('rejects more than 10 urls', async () => {
    const app = await build();
    const { status, body } = await post(app, {
      prompt: 'x',
      urls: Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`),
    });

    expect(status).toBe(400);
    expect(body.field).toBe('urls');
  });

  it('rejects a non-http(s) url', async () => {
    const app = await build();
    const { status, body } = await post(app, { prompt: 'x', urls: ['ftp://example.com/file'] });

    expect(status).toBe(400);
    expect(body.field).toBe('urls.0');
  });

  it('rejects a malformed url', async () => {
    const app = await build();
    const { status, body } = await post(app, { prompt: 'x', urls: ['not-a-url'] });

    expect(status).toBe(400);
    expect(body.field).toBe('urls.0');
  });

  it('answers with a service_unavailable failure when no provider is configured', async () => {
    const client = extractClient({
      schema: vi.fn(async () => {
        throw new StructuredError(503, 'ANTHROPIC_API_KEY is not set.');
      }),
    });
    const app = await build({ extractClient: client });
    const { status, body } = await post(app, { prompt: 'pricing plans' });

    expect(status).toBe(200);
    expect(body).toEqual({
      success: false,
      failure: { reason: 'service_unavailable', detail: 'ANTHROPIC_API_KEY is not set.' },
    });
  });

  it('maps a field-specific 400 from helix-extract to invalid_request', async () => {
    const client = extractClient({
      schema: vi.fn(async () => {
        throw new StructuredError(400, '`model` is required with provider "ollama"', 'model');
      }),
    });
    const app = await build({ extractClient: client });
    const { status, body } = await post(app, { prompt: 'pricing plans' });

    expect(status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('model');
  });

  it('maps a model that returned no usable schema to a 422-style validation error', async () => {
    const client = extractClient({
      schema: vi.fn(async () => {
        throw new StructuredError(400, 'the model did not return a usable JSON Schema');
      }),
    });
    const app = await build({ extractClient: client });
    const { status, body } = await post(app, { prompt: 'pricing plans' });

    expect(status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.message).toContain('usable JSON Schema');
  });

  it('answers with a service_unavailable failure when helix-extract is unreachable', async () => {
    const client = extractClient({
      schema: vi.fn(async () => {
        throw new ExtractHttpError(502, 'connect ECONNREFUSED');
      }),
    });
    const app = await build({ extractClient: client });
    const { status, body } = await post(app, { prompt: 'pricing plans' });

    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('service_unavailable');
  });

  it('answers with a timeout failure when the call aborts', async () => {
    const client = extractClient({
      schema: vi.fn(async () => {
        const error = new Error('The operation was aborted');
        error.name = 'TimeoutError';
        throw error;
      }),
    });
    const app = await build({ extractClient: client });
    const { status, body } = await post(app, { prompt: 'pricing plans' });

    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('timeout');
  });
});
