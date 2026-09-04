import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createApiKey, listApiKeys, revokeApiKey } from '../core/api-keys.js';

/**
 * API key management.
 *
 * These keys authenticate callers to this instance. They have nothing to do with
 * the operator's LLM, proxy or vector-store credentials, which live in the
 * environment and never pass through the API.
 */

export interface KeyRouteDeps {
  /**
   * Many tenants share this instance. Listing and revoking are instance-wide
   * with no owner predicate, so on a shared instance either one lets a tenant
   * read or destroy another's credentials. There is no owner column to filter
   * by here — the hosted dashboard mints keys through Supabase directly and
   * never calls these — so the routes are withheld rather than narrowed.
   */
  multiTenant?: boolean;
}

const CreateKeySchema = z.object({
  name: z.string().min(1).max(100),
  rateLimit: z.number().int().min(1).max(1_000_000).default(1000),
});

export async function registerKeys(app: FastifyInstance, deps: KeyRouteDeps = {}): Promise<void> {
  app.post('/keys', async (request, reply) => {
    const parsed = CreateKeySchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({
        error: 'invalid_request',
        message: first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
        requestId: request.id,
      });
    }

    const created = await createApiKey(parsed.data.name, parsed.data.rateLimit);

    return reply.code(201).send({
      id: created.id,
      name: created.name,
      // Returned exactly once. There is no way to recover it later.
      key: created.key,
      keyPrefix: created.keyPrefix,
      rateLimit: created.rateLimit,
      createdAt: created.createdAt,
      warning: 'Store this key now. It cannot be retrieved again.',
    });
  });

  if (deps.multiTenant === true) return;

  app.get('/keys', async (_request, reply) => {
    const keys = await listApiKeys();
    return reply.send({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        rateLimit: k.rateLimit,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
      })),
    });
  });

  app.delete<{ Params: { id: string } }>('/keys/:id', async (request, reply) => {
    const revoked = await revokeApiKey(request.params.id);
    if (!revoked) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'No such active API key.',
        requestId: request.id,
      });
    }
    return reply.code(204).send();
  });
}
