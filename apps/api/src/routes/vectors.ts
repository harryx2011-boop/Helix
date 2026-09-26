import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ExtractHttpError, type ExtractClient } from '../extract/client.js';
import { collectionName, createSink, type VectorSink } from '../vectors/sink.js';
import { DestinationSchema } from './crawl.js';

/**
 * Semantic search over what a crawl wrote to a vector destination.
 *
 * The query is embedded by the same helix-extract that embedded the chunks, and
 * the search refuses to run when the collection was embedded with a different
 * model: vectors from two models live in unrelated spaces, and scoring one
 * against the other returns confident nonsense rather than an error.
 */

const MAX_QUERY_CHARS = 2000;

const VectorsSearchSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_CHARS),
  destination: DestinationSchema,
  k: z.number().int().min(1).max(50).default(10),
  filter: z.object({ url: z.string().url().optional() }).strict().optional(),
  model: z.string().trim().min(1).optional(),
});

export interface VectorsRouteDeps {
  extractClient: ExtractClient;
  sinkFor?: ((type: string) => VectorSink | undefined) | undefined;
}

const UNAVAILABLE: Record<string, string> = {
  qdrant: 'Qdrant is not configured on this instance: set QDRANT_URL.',
  pgvector:
    'pgvector is not available on this instance: its Postgres has no vector extension, so there is no chunks table. '
    + 'The desktop app includes it; use a qdrant destination elsewhere.',
};

function refuse(
  reply: FastifyReply,
  request: FastifyRequest,
  code: number,
  error: string,
  message: string,
  field?: string,
) {
  return reply.code(code).send({ error, message, ...(field ? { field } : {}), requestId: request.id });
}

export async function registerVectors(app: FastifyInstance, deps: VectorsRouteDeps): Promise<void> {
  const sinkFor = deps.sinkFor ?? ((type: string) => createSink(type, process.env));

  app.post('/vectors/search', async (request, reply) => {
    const parsed = VectorsSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path.join('.');
      return refuse(reply, request, 400, 'invalid_request', first ? `${field}: ${first.message}` : 'invalid request body', field);
    }
    const body = parsed.data;
    const collection = collectionName(body.destination);

    const sink = sinkFor(body.destination.type);
    if (!sink) return refuse(reply, request, 400, 'destination_unavailable', UNAVAILABLE[body.destination.type] ?? 'unknown destination', 'destination.type');
    if (!(await sink.health())) {
      return body.destination.type === 'pgvector'
        ? refuse(reply, request, 400, 'destination_unavailable', UNAVAILABLE['pgvector'] ?? '', 'destination.type')
        : refuse(reply, request, 503, 'service_unavailable', `${sink.name} did not answer its health check.`);
    }

    let embedded;
    try {
      embedded = await deps.extractClient.embedQuery(body.query);
    } catch (error) {
      if (error instanceof ExtractHttpError && error.retryAfterSeconds !== undefined) {
        void reply.header('retry-after', String(error.retryAfterSeconds));
        return refuse(reply, request, 503, 'embeddings_not_ready', error.detail);
      }
      const detail = error instanceof ExtractHttpError ? error.detail : 'helix-extract did not answer';
      return refuse(reply, request, 503, 'service_unavailable', `Could not embed the query: ${detail}`);
    }

    try {
      const models = await sink.models(collection, embedded.model);
      if (!models.exists) {
        return refuse(reply, request, 404, 'collection_not_found', `No chunks are stored in ${sink.name} collection "${collection}".`, 'destination.collection');
      }

      const mismatch = models.otherModel ?? (body.model !== undefined && body.model !== embedded.model ? body.model : undefined);
      if (mismatch !== undefined) {
        return refuse(
          reply,
          request,
          409,
          'model_mismatch',
          `The collection was embedded with ${mismatch}; this instance embeds queries with ${embedded.model}. `
          + 'Scores across two models are meaningless: re-crawl into the collection, or set HELIX_EMBEDDING_MODEL to match.',
          models.otherModel ? 'destination.collection' : 'model',
        );
      }
      if (models.untracked && body.model === undefined) {
        return refuse(
          reply,
          request,
          400,
          'model_required',
          `Some chunks in "${collection}" were stored before Helix recorded the embedding model. `
          + `Pass \`model\` naming the model they were embedded with; this instance embeds queries with ${embedded.model}.`,
          'model',
        );
      }
      if (models.dimensions !== undefined && models.dimensions !== embedded.vector.length) {
        return refuse(
          reply,
          request,
          409,
          'model_mismatch',
          `The collection holds ${models.dimensions}-dimension vectors; ${embedded.model} makes ${embedded.vector.length}.`,
          'destination.collection',
        );
      }

      const results = await sink.query({ collection, vector: embedded.vector, k: body.k, filter: body.filter });
      return reply.send({ success: true, collection, model: embedded.model, results });
    } catch (error) {
      request.log.warn({ err: error, collection }, 'vector search failed');
      return refuse(reply, request, 503, 'service_unavailable', `${sink.name} search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
