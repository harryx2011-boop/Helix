import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractHttpError, type ExtractClient } from '../extract/client.js';
import type { CollectionModels, QueryRequest, VectorSink } from '../vectors/sink.js';
import { registerVectors } from './vectors.js';

const MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const HIT = { text: 'Rotate keys monthly.', anchor: '#rotate', url: 'https://docs.test/keys', headingPath: ['Keys'], score: 0.91 };

let app: FastifyInstance;
let sink: VectorSink & { healthy: boolean; collection: CollectionModels; queries: QueryRequest[] };
let embedQuery: ReturnType<typeof vi.fn>;
let sinks: Record<string, VectorSink | undefined>;

function fakeSink(name: string): typeof sink {
  const s = {
    name,
    healthy: true,
    collection: { exists: true, otherModel: undefined, untracked: false, dimensions: 3 } as CollectionModels,
    queries: [] as QueryRequest[],
    store: vi.fn(),
    ensureCollection: vi.fn(),
    health: async () => s.healthy,
    models: async () => s.collection,
    query: async (request: QueryRequest) => {
      s.queries.push(request);
      return [HIT];
    },
  };
  return s;
}

async function search(body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/v1/vectors/search', payload: body });
}

const qdrant = { query: 'how are keys rotated', destination: { type: 'qdrant', collection: 'docs' } };

beforeEach(async () => {
  sink = fakeSink('qdrant');
  sinks = { qdrant: sink, pgvector: fakeSink('pgvector') };
  embedQuery = vi.fn(async () => ({ vector: [0.1, 0.2, 0.3], model: MODEL }));
  app = Fastify();
  await app.register(
    async (instance) =>
      registerVectors(instance, {
        extractClient: { embedQuery } as unknown as ExtractClient,
        sinkFor: (type) => sinks[type],
      }),
    { prefix: '/v1' },
  );
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('POST /v1/vectors/search', () => {
  it('returns the nearest chunks with the model the query was embedded with', async () => {
    const res = await search({ ...qdrant, k: 3, filter: { url: 'https://docs.test/keys' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, collection: 'docs', model: MODEL, results: [HIT] });
    expect(embedQuery).toHaveBeenCalledWith('how are keys rotated');
    expect(sink.queries).toEqual([{ collection: 'docs', vector: [0.1, 0.2, 0.3], k: 3, filter: { url: 'https://docs.test/keys' } }]);
  });

  it('reads the collection a crawl destination wrote to, namespace included', async () => {
    const res = await search({ query: 'q', destination: { type: 'qdrant', namespace: 'ns' } });
    expect(res.json()).toMatchObject({ collection: 'ns' });
    expect(sink.queries[0]).toMatchObject({ collection: 'ns', k: 10 });
  });

  it('rejects an empty query before embedding anything', async () => {
    const res = await search({ ...qdrant, query: '   ' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request', field: 'query' });
    expect(embedQuery).not.toHaveBeenCalled();
  });

  it('says what to set when Qdrant is not configured', async () => {
    sinks['qdrant'] = undefined;
    const res = await search(qdrant);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'destination_unavailable', field: 'destination.type' });
    expect(res.json().message).toContain('QDRANT_URL');
  });

  it('refuses pgvector on a Postgres with no chunks table, naming where it does run', async () => {
    (sinks['pgvector'] as typeof sink).healthy = false;
    const res = await search({ query: 'q', destination: { type: 'pgvector' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'destination_unavailable' });
    expect(res.json().message).toContain('desktop app');
  });

  it('passes the embeddings runtime download through as 503 with Retry-After', async () => {
    embedQuery.mockRejectedValueOnce(new ExtractHttpError(503, 'embeddings runtime downloading (40%)', 30));
    const res = await search(qdrant);
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.json()).toMatchObject({ error: 'embeddings_not_ready', message: 'embeddings runtime downloading (40%)' });
  });

  it('answers 404 for a collection with nothing stored', async () => {
    sink.collection = { exists: false, otherModel: undefined, untracked: false, dimensions: undefined };
    const res = await search(qdrant);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'collection_not_found' });
  });

  it('refuses a collection embedded with another model', async () => {
    sink.collection = { ...sink.collection, otherModel: 'text-embedding-3-small' };
    const res = await search(qdrant);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'model_mismatch', field: 'destination.collection' });
    expect(res.json().message).toContain('text-embedding-3-small');
    expect(sink.queries).toEqual([]);
  });

  it('refuses a caller-named model this instance does not embed with', async () => {
    const res = await search({ ...qdrant, model: 'voyage-3' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'model_mismatch', field: 'model' });
  });

  it('asks for the model when chunks predate tracking, and searches once it is named', async () => {
    sink.collection = { ...sink.collection, untracked: true };

    const refused = await search(qdrant);
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ error: 'model_required', field: 'model' });
    expect(refused.json().message).toContain(MODEL);

    const named = await search({ ...qdrant, model: MODEL });
    expect(named.statusCode).toBe(200);
    expect(sink.queries).toHaveLength(1);
  });

  it('refuses a collection whose vectors are another size', async () => {
    sink.collection = { ...sink.collection, dimensions: 1536 };
    const res = await search(qdrant);
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain('1536');
  });

  it('reports a store failure as 503, not a 500', async () => {
    sink.query = async () => {
      throw new Error('connection refused');
    };
    const res = await search(qdrant);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'service_unavailable' });
  });
});
