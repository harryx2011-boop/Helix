import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  deleteProviderKey,
  getProviderStatuses,
  isLocalProvider,
  listProviderKeys,
  PROVIDERS,
  upsertProviderKey,
  type Provider,
} from '../providers/repository.js';
import { listLocalProviderModels } from '../providers/models.js';

/**
 * A caller's own LLM provider keys, stored against their Helix API key.
 *
 * Every LLM-backed request made with that key then uses these instead of the
 * instance's environment credentials. The plaintext is accepted once, at
 * write time, and never returned again — only its last 4 characters are. A
 * local runtime (ollama, vllm, openai-compatible) stores a base URL instead
 * of, or alongside, a key: most need no credential at all.
 */

const PutBodySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8, 'must be at least 8 characters')
    .max(512, 'must be at most 512 characters')
    .optional(),
  model: z.string().min(1).max(200).optional(),
  baseUrl: z.string().url().optional(),
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

    const { apiKey, model, baseUrl } = parsed.data;
    const local = isLocalProvider(provider);

    if (local && !baseUrl) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'baseUrl: is required for a local runtime',
        field: 'baseUrl',
        requestId: request.id,
      });
    }
    if (!local && !apiKey) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'apiKey: is required for this provider',
        field: 'apiKey',
        requestId: request.id,
      });
    }

    const result = await upsertProviderKey(apiKeyId, provider, deps.encryptionKey, { apiKey, model, baseUrl });

    return reply.send({
      success: true,
      provider,
      last4: result.last4,
      model: result.model,
      baseUrl: result.baseUrl,
    });
  });

  app.get<{ Params: { provider: string } }>('/providers/:provider/models', async (request, reply) => {
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
    if (!isLocalProvider(provider)) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `${provider} has no installed-model listing; only local runtimes do.`,
        field: 'provider',
        requestId: request.id,
      });
    }

    const rows = await listProviderKeys(apiKeyId);
    const baseUrl = rows.find((r) => r.provider === provider)?.base_url;
    if (!baseUrl) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `Save a base URL for ${provider} before browsing its models.`,
        field: 'baseUrl',
        requestId: request.id,
      });
    }

    const result = await listLocalProviderModels(provider, baseUrl);
    if (!result.ok) {
      return reply.send({ success: false, provider, failure: { reason: result.reason, message: result.message } });
    }
    return reply.send({ success: true, provider, models: result.models });
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
