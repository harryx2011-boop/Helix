import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ExtractHttpError, StructuredError, type ExtractClient } from '../extract/client.js';
import { resolveProviderKeys, toClientKeys } from '../providers/resolve.js';


const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'must be an http(s) URL');

const PROVIDERS = [
  'anthropic',
  'openai',
  'openrouter',
  'google',
  'gemini',
  'ollama',
  'vllm',
  'openai-compatible',
] as const;

const AgentSchemaRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  urls: z.array(HttpUrlSchema).max(10).optional(),
  hint: z.record(z.unknown()).optional(),
  instruction: z.string().min(1).max(2000).optional(),
  provider: z.enum(PROVIDERS).optional(),
  model: z.string().max(200).optional(),
});

export interface AgentRouteDeps {
  extractClient: ExtractClient;
  encryptionKey?: Buffer | undefined;
}

function providerFailure(error: ExtractHttpError): { reason: 'service_unavailable'; detail: string } {
  return { reason: 'service_unavailable', detail: error.detail || `helix-extract answered HTTP ${error.status}` };
}

export async function registerAgent(app: FastifyInstance, deps: AgentRouteDeps): Promise<void> {
  app.post('/agent/schema', async (request, reply) => {
    const parsed = AgentSchemaRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({
        error: 'invalid_request',
        message: first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
        field: first?.path.join('.'),
        requestId: request.id,
      });
    }

    const body = parsed.data;

    const controller = new AbortController();
    const onClose = (): void => {
      if (!reply.raw.writableFinished) controller.abort();
    };
    reply.raw.on('close', onClose);

    try {
      const apiKeyId = request.apiKey?.id;
      const resolved = apiKeyId && deps.encryptionKey ? await resolveProviderKeys(apiKeyId, deps.encryptionKey) : {};
      const { providerKeys, providerModels, providerBaseUrls } = toClientKeys(resolved);

      const result = await deps.extractClient.schema({
        prompt: body.prompt,
        urls: body.urls,
        hint: body.hint,
        instruction: body.instruction,
        provider: body.provider,
        model: body.model,
        providerKeys,
        providerModels,
        providerBaseUrls,
        signal: controller.signal,
      });

      return reply.send({
        success: true,
        schema: result.schema,
        summary: result.summary,
        usage: {
          tokens: { input: result.tokensInput, output: result.tokensOutput },
          model: result.modelUsed,
        },
      });
    } catch (error) {
      if (error instanceof StructuredError) {
        if (error.field !== undefined || error.status === 400) {
          return reply.code(400).send({
            error: 'invalid_request',
            message: error.message,
            field: error.field,
            requestId: request.id,
          });
        }
        return reply.code(200).send({
          success: false,
          failure: providerFailure(error),
        });
      }
      if (error instanceof ExtractHttpError) {
        return reply.code(200).send({ success: false, failure: providerFailure(error) });
      }
      const err = error as { name?: string; message?: string };
      if (err.name === 'AbortError') {
        return reply.code(200).send({
          success: false,
          failure: { reason: 'aborted', detail: 'the caller disconnected before schema generation finished' },
        });
      }
      if (err.name === 'TimeoutError') {
        return reply.code(200).send({
          success: false,
          failure: { reason: 'timeout', detail: 'helix-extract did not finish generating a schema in time' },
        });
      }
      return reply.code(200).send({
        success: false,
        failure: { reason: 'service_unavailable', detail: err.message ?? 'helix-extract is unreachable' },
      });
    } finally {
      reply.raw.off('close', onClose);
    }
  });
}
