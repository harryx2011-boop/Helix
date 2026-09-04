import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashKey, importApiKey, revokeApiKeyByHash, safeEqual } from '../core/api-keys.js';

/**
 * Network-internal endpoints used by the hosted website to mirror the keys it
 * mints (WEBSITE.md §8). Guarded by a shared secret; not mounted under /v1 and
 * disabled entirely when HELIX_INTERNAL_ADMIN_TOKEN is unset, which is the
 * self-host default.
 */

const ImportKeySchema = z.object({
  key: z.string().regex(/^helix-[A-Za-z0-9]{16}$/),
  name: z.string().min(1).max(100),
  rateLimitPerMin: z.number().int().min(1).max(1_000_000).nullable().optional(),
});

const RevokeKeySchema = z.object({ key: z.string().regex(/^helix-[A-Za-z0-9]{16}$/) });

function invalidBody(error: z.ZodError, requestId: string) {
  const first = error.issues[0];
  return {
    error: 'invalid_request',
    message: first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
    ...(first && first.path.length > 0 ? { field: first.path.join('.') } : {}),
    requestId,
  };
}

export async function registerInternal(app: FastifyInstance, opts: { adminToken: string | undefined }): Promise<void> {
  if (!opts.adminToken) return;
  const expected = opts.adminToken;

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/internal/')) return;
    const presented = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!presented || !safeEqual(presented, expected)) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Missing or invalid internal admin token.',
        requestId: request.id,
      });
    }
  });

  app.post('/internal/keys', async (request, reply) => {
    const parsed = ImportKeySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(invalidBody(parsed.error, request.id));
    const { key, name, rateLimitPerMin } = parsed.data;
    const row = await importApiKey(key, name, rateLimitPerMin ?? 1000);
    return reply.code(201).send({ id: row.id, keyPrefix: row.keyPrefix, rateLimit: row.rateLimit });
  });

  app.delete('/internal/keys', async (request, reply) => {
    const parsed = RevokeKeySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(invalidBody(parsed.error, request.id));
    const revoked = await revokeApiKeyByHash(hashKey(parsed.data.key));
    return reply.send({ revoked });
  });
}
