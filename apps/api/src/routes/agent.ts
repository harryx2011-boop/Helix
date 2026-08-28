import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ExtractHttpError, StructuredError, type ExtractClient } from '../extract/client.js';
import { resolveProviderKeys, toClientKeys } from '../providers/resolve.js';

/**
 * POST /v1/agent/schema — turns a plain-language data request into a JSON
 * Schema.
 *
 * The dashboard's Agent research preview lets someone describe what they want
 * scraped before committing to a full `scrapeOptions.jsonOptions.schema`. This
 * asks helix-extract to design that schema with the operator's own model, so
 * the result is paste-ready into `/scrape` or `/search`.
 */

const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'must be an http(s) URL');

const AgentSchemaRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  urls: z.array(HttpUrlSchema).max(10).optional(),
  hint: z.record(z.unknown()).optional(),
  instruction: z.string().min(1).max(2000).optional(),
});

export interface AgentRouteDeps {
  extractClient: ExtractClient;
  /** Decrypts the caller's stored provider keys, when present, so schema design can use them. */
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

    try {
      const apiKeyId = request.apiKey?.id;
      const resolved = apiKeyId && deps.encryptionKey ? await resolveProviderKeys(apiKeyId, deps.encryptionKey) : {};
      const { providerKeys, providerModels, providerBaseUrls } = toClientKeys(resolved);

      const result = await deps.extractClient.schema({
        prompt: body.prompt,
        urls: body.urls,
        hint: body.hint,
        instruction: body.instruction,
        providerKeys,
        providerModels,
        providerBaseUrls,
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
        // helix-extract's /schema named a specific request field at fault
        // (a 400), or has no provider configured (a 503, no `field`).
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
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return reply.code(200).send({
          success: false,
          failure: { reason: 'timeout', detail: 'helix-extract did not finish generating a schema in time' },
        });
      }
      return reply.code(200).send({
        success: false,
        failure: { reason: 'service_unavailable', detail: err.message ?? 'helix-extract is unreachable' },
      });
    }
  });
}
