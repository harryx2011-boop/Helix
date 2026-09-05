import type { FastifyInstance } from 'fastify';

/**
 * POST /v1/document — one endpoint over every document operation.
 *
 * Parse, convert, metadata and assess were four endpoints a caller had to know
 * about separately, all taking the same file and answering in the same
 * envelope. This is the single surface; `op` picks the operation.
 *
 * It **dispatches** rather than reimplements. Each underlying route owns
 * multipart parsing, its own body limit, an in-flight cap and a result cache,
 * and a second copy of that logic here would be the kind of duplication that
 * drifts silently — the dispatcher would keep working while quietly disagreeing
 * about upload ceilings. Rewriting the URL and re-entering the router keeps one
 * implementation of each operation.
 *
 * The four original paths stay registered and documented: this is an addition,
 * not a migration, and callers already using `/v1/parse` are not broken by it.
 */

/** `op` values and the route each one forwards to. */
const OPERATIONS = {
  parse: '/v1/parse',
  convert: '/v1/convert',
  metadata: '/v1/metadata',
  scrub: '/v1/metadata/scrub',
  assess: '/v1/pdf-assess',
} as const;

export type DocumentOp = keyof typeof OPERATIONS;

export const DOCUMENT_OPS = Object.keys(OPERATIONS) as DocumentOp[];

const isOp = (value: unknown): value is DocumentOp =>
  typeof value === 'string' && Object.hasOwn(OPERATIONS, value);

/**
 * `op` comes from the JSON body, or from the query string.
 *
 * A multipart upload is buffered rather than parsed here — that is the target
 * route's job, and parsing it twice would consume the stream — so an upload
 * names its operation as `?op=`, which is also why the query is checked first.
 */
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
  // Buffers the raw body untouched so the target route's own content-type
  // parser sees exactly what the caller sent, multipart boundaries included.
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, payload, done) => {
    done(null, payload);
  });

  app.post('/document', async (request, reply) => {
    // A JSON body still goes through Fastify's own parser — the wildcard above
    // adds a fallback for everything else rather than replacing it — so `op` is
    // read from a parsed object here, and malformed JSON is already a 400
    // before this handler runs.
    const op = opOf(request);

    if (!isOp(op)) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `op: must be one of ${DOCUMENT_OPS.join(', ')}`,
        field: 'op',
        requestId: request.id,
      });
    }

    // Re-enter the router at the operation's own path. `inject` runs the full
    // chain — auth, rate limit, body parsing, the handler — so the operation
    // behaves identically whether it was reached here or directly.
    // `inject` sets content-length from the payload it is given. Forwarding the
    // original value would describe a body length that no longer applies, and
    // an explicit `undefined` is rejected outright, so the key is removed.
    const headers: Record<string, string> = { ...(request.headers as Record<string, string>) };
    delete headers['content-length'];

    const response = await app.inject({
      method: 'POST',
      url: OPERATIONS[op],
      headers,
      payload: request.body as Buffer,
    });

    for (const [header, value] of Object.entries(response.headers)) {
      // `inject` reports the length of its own response; letting it through
      // alongside a re-serialised body is how a truncated reply happens.
      if (header.toLowerCase() === 'content-length') continue;
      if (value !== undefined) reply.header(header, value as string | string[]);
    }

    // A scrub answers with file bytes, not JSON, so the payload is forwarded as
    // received rather than parsed and re-encoded.
    return reply.code(response.statusCode).send(response.rawPayload);
  });
}
