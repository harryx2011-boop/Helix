import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  deleteProviderKey,
  getProviderStatuses,
  PROVIDERS,
  upsertProviderKey,
  type Provider,
} from '../providers/repository.js';

/**
 * A caller's own LLM provider keys, stored against their Helix API key.
 *
 * Every LLM-backed request made with that key then uses these instead of the
 * instance's environment credentials. The plaintext is accepted once, at
 * write time, and never returned again — only its last 4 characters are.
 */

const PutBodySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8, 'must be at least 8 characters')
    .max(512, 'must be at most 512 characters'),
  model: z.string().min(1).max(200).optional(),
});

export interface ProviderRouteDeps {
  encryptionKey: Buffer;
  instanceConfigured: Record<Provider, boolean>;
}

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

export async function registerProviders(app: FastifyInstance, deps: ProviderRouteDeps): Promise<void> {
  app.get('/providers', async (request, reply) => {
    const apiKeyId = request.apiKey?.id;
    if (!apiKeyId) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing API key.', requestId: request.id });
    }

    const providers = await getProviderStatuses(apiKeyId, deps.instanceConfigured);
    return reply.send({ success: true, providers });
  });

  app.put<{ Params: { provider: string } }>('/providers/:provider', async (request, reply) => {
    const apiKeyId = request.apiKey?.id;
    if (!apiKeyId) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing API key.', requestId: request.id });
    }

    const { provider } = request.params;
    if (!isProvider(provider)) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `provider: must be one of ${PROVIDERS.join(', ')}`,
        field: 'provider',
        requestId: request.id,
      });
    }

    const parsed = PutBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({
        error: 'invalid_request',
        message: first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
        field: first?.path.join('.'),
        requestId: request.id,
      });
    }

    const { apiKey, model } = parsed.data;
    const result = await upsertProviderKey(apiKeyId, provider, apiKey, deps.encryptionKey, model);

    return reply.send({ success: true, provider, last4: result.last4, model: result.model });
  });

  app.delete<{ Params: { provider: string } }>('/providers/:provider', async (request, reply) => {
    const apiKeyId = request.apiKey?.id;
    if (!apiKeyId) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing API key.', requestId: request.id });
    }

    const { provider } = request.params;
    if (!isProvider(provider)) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `provider: must be one of ${PROVIDERS.join(', ')}`,
        field: 'provider',
        requestId: request.id,
      });
    }

    await deleteProviderKey(apiKeyId, provider);
    return reply.send({ success: true });
  });
}
