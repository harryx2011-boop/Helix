import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createApiKey, listApiKeys, revokeApiKey } from '../core/api-keys.js';
import { adminGate } from '../core/admin-gate.js';


export interface KeysRouteDeps {
  adminToken: string | undefined;
  publicUrl?: string | undefined;
}

const ADMIN_ONLY = { config: { public: () => true } };

const CreateKeySchema = z.object({
  name: z.string().min(1).max(100),
  rateLimit: z.number().int().min(1).max(1_000_000).default(1000),
});

export async function registerKeys(app: FastifyInstance, deps: KeysRouteDeps): Promise<void> {
  if (!deps.adminToken) return;
  const gate = adminGate({ token: deps.adminToken, publicUrl: deps.publicUrl });

  await app.register(async (scope) => {
    scope.addHook('onRequest', gate);
    registerKeyRoutes(scope);
  });
}

function registerKeyRoutes(app: FastifyInstance): void {
  app.post('/keys', ADMIN_ONLY, async (request, reply) => {
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
      key: created.key,
      keyPrefix: created.keyPrefix,
      rateLimit: created.rateLimit,
      createdAt: created.createdAt,
      warning: 'Store this key now. It cannot be retrieved again.',
    });
  });

  app.get('/keys', ADMIN_ONLY, async (_request, reply) => {
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

  app.delete<{ Params: { id: string } }>('/keys/:id', ADMIN_ONLY, async (request, reply) => {
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
