import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerDocument, DOCUMENT_OPS } from './document.js';

/**
 * The dispatcher forwards; the operations themselves are tested by their own
 * suites. What matters here is that the forward is faithful: the right target,
 * the body intact, the status and headers passed back, and binary responses
 * (a scrub returns file bytes) not corrupted on the way through.
 */

let app: FastifyInstance | undefined;

/** Stands in for the real routes, echoing what it was handed. */
async function build(): Promise<FastifyInstance> {
  const instance = Fastify();

  await instance.register(
    async (scope) => {
      for (const path of ['/parse', '/metadata', '/pdf-assess']) {
        scope.post(path, async (request, reply) => {
          return reply.code(200).send({ hit: path, body: request.body });
        });
      }

      scope.post('/metadata/scrub', async (_request, reply) => {
        return reply
          .code(200)
          .header('content-type', 'application/pdf')
          .header('x-helix-metadata-report', '{"removed":3}')
          .send(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]));
      });

      await registerDocument(scope);
    },
    { prefix: '/v1' },
  );

  app = instance;
  return instance;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('POST /v1/document', () => {
  it('rejects a missing op rather than guessing an operation', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/v1/document',
      payload: { url: 'https://example.com/a.pdf' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('op');
  });

  it('rejects an unknown op and names the ones that exist', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/v1/document',
      payload: { op: 'summarise', url: 'https://example.com/a.pdf' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('parse');
  });

  it.each([
    ['parse', '/parse'],
    ['metadata', '/metadata'],
    ['assess', '/pdf-assess'],
  ])('forwards op=%s to %s with the body intact', async (op, path) => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/v1/document',
      payload: { op, url: 'https://example.com/a.pdf', formats: ['markdown'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().hit).toBe(path);
    expect(response.json().body).toMatchObject({ url: 'https://example.com/a.pdf', formats: ['markdown'] });
  });

  it('takes op from the query string, for multipart uploads that cannot be pre-read', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/v1/document?op=metadata',
      payload: { url: 'https://example.com/a.pdf' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().hit).toBe('/metadata');
  });

  it('returns scrubbed file bytes unchanged rather than re-encoding them as JSON', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/v1/document',
      payload: { op: 'scrub', url: 'https://example.com/a.pdf' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['x-helix-metadata-report']).toBe('{"removed":3}');
    expect([...response.rawPayload]).toEqual([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
  });

  it('rejects a malformed JSON body as a 400, not a 500', async () => {
    const instance = await build();

    const response = await instance.inject({
      method: 'POST',
      url: '/v1/document',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });

    // Fastify's own JSON parser answers before the handler runs. The wildcard
    // parser the dispatcher adds is a fallback for other content types, not a
    // replacement, so this stays a clean 400 rather than reaching the forward.
    expect(response.statusCode).toBe(400);
  });

  it('covers every declared op with a forward target', async () => {
    const instance = await build();

    for (const op of DOCUMENT_OPS) {
      const response = await instance.inject({
        method: 'POST',
        url: '/v1/document',
        payload: { op, url: 'https://example.com/a.pdf' },
      });
      expect(response.statusCode, `op=${op}`).toBe(200);
    }
  });
});
