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
import { verifyProvider } from '../providers/verify.js';
import { isCloudProvider, listCloudModels } from '../providers/cloud-models.js';
import { blockedRange, checkUrl } from '../core/url-guard.js';
import { resolveProviderKeys } from '../providers/repository.js';
import type { DetectLocal } from '../providers/detect.js';


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
  detectLocal?: DetectLocal;
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

    const detected = deps.detectLocal ? await deps.detectLocal() : [];
    const providers = await getProviderStatuses(apiKeyId, deps.instanceConfigured, detected);
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

    if (baseUrl) {
      const reserved = blockedRange(baseUrl);
      if (reserved) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: `baseUrl: ${reserved} is a reserved range, which this instance does not fetch.`,
          field: 'baseUrl',
          requestId: request.id,
        });
      }

      const verdict = await checkUrl(baseUrl, { allowPrivate: local });
      if (!verdict.ok) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: `baseUrl: ${verdict.reason}`,
          field: 'baseUrl',
          requestId: request.id,
        });
      }
    }

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

    const check = await verifyProvider(provider, { apiKey, baseUrl });
    if (check.verdict === 'invalid') {
      return reply.code(400).send({
        error: 'invalid_credential',
        message: check.message ?? `${provider} rejected this credential.`,
        field: local ? 'baseUrl' : 'apiKey',
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
      verified: check.verdict === 'valid',
      ...(check.verdict === 'unverifiable' ? { warning: check.message } : {}),
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
    if (isCloudProvider(provider)) {
      const resolved = await resolveProviderKeys(apiKeyId, deps.encryptionKey);
      const result = await listCloudModels(provider, resolved[provider]?.key ?? null);
      if (!result.ok) {
        return reply.send({ success: false, provider, failure: { reason: result.reason, message: result.message } });
      }
      return reply.send({ success: true, provider, models: result.models });
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
