import type { FastifyInstance } from 'fastify';
import { abortable } from '../core/abortable.js';


const OPERATIONS = {
  parse: '/v1/parse',
  metadata: '/v1/metadata',
  scrub: '/v1/metadata/scrub',
  assess: '/v1/pdf-assess',
} as const;

export type DocumentOp = keyof typeof OPERATIONS;

export const DOCUMENT_OPS = Object.keys(OPERATIONS) as DocumentOp[];

const isOp = (value: unknown): value is DocumentOp =>
  typeof value === 'string' && Object.hasOwn(OPERATIONS, value);

function opOf(request: { body?: unknown; query?: unknown }): unknown {
  const fromQuery = (request.query as { op?: unknown } | undefined)?.op;
  if (fromQuery !== undefined) return fromQuery;
  const body = request.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    return (body as { op?: unknown }).op;
  }
  return undefined;
}

export async function registerDocument(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, payload, done) => {
    done(null, payload);
  });

  app.post('/document', async (request, reply) => {
    const op = opOf(request);

    if (!isOp(op)) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `op: must be one of ${DOCUMENT_OPS.join(', ')}`,
        field: 'op',
        requestId: request.id,
      });
    }

    const headers: Record<string, string> = { ...(request.headers as Record<string, string>) };
    delete headers['content-length'];

    const controller = new AbortController();
    const onClose = (): void => {
      if (!reply.raw.writableFinished) controller.abort();
    };
    reply.raw.on('close', onClose);

    let response;
    try {
      response = await abortable(
        app.inject({
          method: 'POST',
          url: OPERATIONS[op],
          headers,
          payload: request.body as Buffer,
        }),
        controller.signal,
      );
    } catch (error) {
      const err = error as { name?: string };
      if (err.name === 'AbortError' || controller.signal.aborted) {
        return reply.code(200).send({
          success: false,
          failure: { reason: 'aborted', detail: 'the caller disconnected before the operation finished' },
        });
      }
      throw error;
    } finally {
      reply.raw.off('close', onClose);
    }

    for (const [header, value] of Object.entries(response.headers)) {
      if (header.toLowerCase() === 'content-length') continue;
      if (value !== undefined) reply.header(header, value as string | string[]);
    }

    return reply.code(response.statusCode).send(response.rawPayload);
  });
}
