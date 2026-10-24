import { createHash } from 'node:crypto';
import { getPool } from '../db/pool.js';
import type { Log } from '../core/logger.js';

/**
 * Vector sinks.
 *
 * Write crawl output straight into the operator's own vector store, so a RAG
 * pipeline is one call rather than a crawl followed by a bespoke loader. The
 * store belongs to them — Helix holds no copy and charges nothing for the hop.
 *
 * The property that makes re-crawling viable: **point IDs are deterministic**,
 * derived from the URL and the chunk's anchor. Re-crawling a site updates the
 * vectors in place instead of appending a second copy of every chunk, which is
 * what happens when IDs are random and is why re-indexing usually means wiping
 * the collection first.
 */

export interface ChunkToStore {
  text: string;
  anchor: string;
  tokens: number;
  embedding: number[];
  headingPath?: string[] | undefined;
}

export interface StoreRequest {
  url: string;
  collection: string;
  chunks: ChunkToStore[];
  /** The model that made the embeddings, kept so a later query can refuse to mix models. */
  model?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface StoreResult {
  stored: number;
  updated: number;
  collection: string;
}

export interface QueryRequest {
  collection: string;
  vector: number[];
  k: number;
  filter?: { url?: string | undefined } | undefined;
}

export interface QueryHit {
  text: string;
  anchor: string;
  url: string;
  headingPath: string[];
  /** Cosine similarity: 1 is the same direction, 0 unrelated. */
  score: number;
}

/**
 * What a collection records about the model its chunks were embedded with,
 * measured against the model about to embed a query.
 */
export interface CollectionModels {
  exists: boolean;
  /** A recorded model other than the one asked about, when any chunk carries one. */
  otherModel: string | undefined;
  /** Some chunks were stored before the model was recorded. */
  untracked: boolean;
  dimensions: number | undefined;
}

export interface VectorSink {
  readonly name: string;
  store(request: StoreRequest): Promise<StoreResult>;
  ensureCollection(collection: string, dimensions: number): Promise<void>;
  query(request: QueryRequest): Promise<QueryHit[]>;
  models(collection: string, model: string): Promise<CollectionModels>;
  health(): Promise<boolean>;
}

/** The collection a destination writes to, and so the one a search of it reads. */
export function collectionName(destination: { collection?: string | undefined; namespace?: string | undefined }): string {
  return destination.collection ?? destination.namespace ?? 'default';
}

const MODEL_KEY = 'embeddingModel';

/** A batch mixed embeddings from more than one dimensionality, so the collection could not be sized from chunk 0 alone. */
export class MismatchedEmbeddingDimensionsError extends Error {
  constructor(expected: number, offending: Array<{ index: number; length: number }>) {
    super(
      `embedding dimensions do not match chunk 0 (${expected}): `
      + offending.map((o) => `index ${o.index} has length ${o.length}`).join(', '),
    );
    this.name = 'MismatchedEmbeddingDimensionsError';
  }
}

function assertConsistentDimensions(chunks: ChunkToStore[]): number {
  const expected = chunks[0]?.embedding.length ?? 0;
  const offending = chunks
    .map((chunk, index) => ({ index, length: chunk.embedding.length }))
    .filter((c) => c.length !== expected);
  if (offending.length > 0) throw new MismatchedEmbeddingDimensionsError(expected, offending);
  return expected;
}

/**
 * A UUID v5-style identifier derived from the chunk's identity.
 *
 * Same URL plus same anchor gives the same id on every crawl, which is what
 * makes an upsert an update rather than a duplicate.
 */
export function deterministicId(url: string, anchor: string): string {
  const hash = createHash('sha256').update(`${url} ${anchor}`).digest('hex');

  // Shape the digest as a UUID and stamp version 5 and the RFC 4122 variant, so
  // stores that validate UUID format accept it.
  const bytes = hash.slice(0, 32).split('');
  bytes[12] = '5';
  const variant = Number.parseInt(hash[16] ?? '8', 16);
  bytes[16] = ((variant & 0x3) | 0x8).toString(16);

  const uuid = bytes.join('');
  return [
    uuid.slice(0, 8),
    uuid.slice(8, 12),
    uuid.slice(12, 16),
    uuid.slice(16, 20),
    uuid.slice(20, 32),
  ].join('-');
}

export class QdrantSink implements VectorSink {
  readonly name = 'qdrant';
  readonly #url: string;
  readonly #apiKey: string | undefined;
  readonly #logger: Log | undefined;

  constructor(url: string, apiKey?: string, logger?: Log) {
    this.#url = url.replace(/\/$/, '');
    this.#apiKey = apiKey;
    this.#logger = logger;
  }

  #headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.#apiKey) headers['api-key'] = this.#apiKey;
    return headers;
  }

  async ensureCollection(collection: string, dimensions: number): Promise<void> {
    const existing = await fetch(`${this.#url}/collections/${encodeURIComponent(collection)}`, {
      headers: this.#headers(),
      signal: AbortSignal.timeout(10_000),
    });

    if (existing.ok) return;

    const created = await fetch(`${this.#url}/collections/${encodeURIComponent(collection)}`, {
      method: 'PUT',
      headers: this.#headers(),
      body: JSON.stringify({
        vectors: { size: dimensions, distance: 'Cosine' },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!created.ok) {
      const detail = await created.text().catch(() => '');
      throw new Error(`could not create Qdrant collection: ${detail.slice(0, 200)}`);
    }
  }

  async store(request: StoreRequest): Promise<StoreResult> {
    if (request.chunks.length === 0) {
      return { stored: 0, updated: 0, collection: request.collection };
    }

    const dimensions = assertConsistentDimensions(request.chunks);
    await this.ensureCollection(request.collection, dimensions);

    const points = request.chunks.map((chunk) => ({
      id: deterministicId(request.url, chunk.anchor),
      vector: chunk.embedding,
      payload: {
        text: chunk.text,
        url: request.url,
        anchor: chunk.anchor,
        tokens: chunk.tokens,
        headingPath: chunk.headingPath ?? [],
        ...request.metadata,
        ...(request.model ? { [MODEL_KEY]: request.model } : {}),
      },
    }));

    const response = await fetch(
      `${this.#url}/collections/${encodeURIComponent(request.collection)}/points?wait=true`,
      {
        method: 'PUT',
        headers: this.#headers(),
        body: JSON.stringify({ points }),
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Qdrant upsert failed: ${detail.slice(0, 200)}`);
    }

    this.#logger?.debug(
      { collection: request.collection, points: points.length },
      'upserted into qdrant',
    );

    // Qdrant does not distinguish insert from update in its response, so the
    // count is reported as stored rather than guessed at.
    return { stored: points.length, updated: 0, collection: request.collection };
  }

  async #scrollOne(collection: string, filter: unknown): Promise<Record<string, unknown> | undefined> {
    const response = await fetch(`${this.#url}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify({ filter, limit: 1, with_payload: [MODEL_KEY], with_vector: false }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Qdrant scroll failed: ${detail.slice(0, 200)}`);
    }
    const body = (await response.json()) as { result?: { points?: Array<{ payload?: Record<string, unknown> }> } };
    const point = body.result?.points?.[0];
    return point ? (point.payload ?? {}) : undefined;
  }

  async models(collection: string, model: string): Promise<CollectionModels> {
    const info = await fetch(`${this.#url}/collections/${encodeURIComponent(collection)}`, {
      headers: this.#headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (info.status === 404) return { exists: false, otherModel: undefined, untracked: false, dimensions: undefined };
    if (!info.ok) {
      const detail = await info.text().catch(() => '');
      throw new Error(`Qdrant collection lookup failed: ${detail.slice(0, 200)}`);
    }
    const body = (await info.json()) as { result?: { config?: { params?: { vectors?: { size?: number } } } } };

    const empty = { is_empty: { key: MODEL_KEY } };
    const [other, untracked] = await Promise.all([
      this.#scrollOne(collection, { must_not: [empty, { key: MODEL_KEY, match: { value: model } }] }),
      this.#scrollOne(collection, { must: [empty] }),
    ]);
    const otherModel = other?.[MODEL_KEY];

    return {
      exists: true,
      otherModel: typeof otherModel === 'string' ? otherModel : undefined,
      untracked: untracked !== undefined,
      dimensions: body.result?.config?.params?.vectors?.size,
    };
  }

  async query(request: QueryRequest): Promise<QueryHit[]> {
    const response = await fetch(`${this.#url}/collections/${encodeURIComponent(request.collection)}/points/query`, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify({
        query: request.vector,
        limit: request.k,
        with_payload: true,
        ...(request.filter?.url ? { filter: { must: [{ key: 'url', match: { value: request.filter.url } }] } } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Qdrant query failed: ${detail.slice(0, 200)}`);
    }
    const body = (await response.json()) as {
      result?: { points?: Array<{ score: number; payload?: Record<string, unknown> }> };
    };
    return (body.result?.points ?? []).map((point) => {
      const payload = point.payload ?? {};
      const headingPath = payload['headingPath'];
      return {
        text: String(payload['text'] ?? ''),
        anchor: String(payload['anchor'] ?? ''),
        url: String(payload['url'] ?? ''),
        headingPath: Array.isArray(headingPath) ? headingPath.map(String) : [],
        score: point.score,
      };
    });
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.#url}/healthz`, {
        headers: this.#headers(),
        signal: AbortSignal.timeout(3_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export class PgVectorSink implements VectorSink {
  readonly name = 'pgvector';
  readonly #logger: Log | undefined;

  constructor(logger?: Log) {
    this.#logger = logger;
  }

  async ensureCollection(_collection: string, _dimensions: number): Promise<void> {
    // The `chunks` table already exists from the migration. Collections are a
    // column here rather than a separate table, so nothing to create.
  }

  async store(request: StoreRequest): Promise<StoreResult> {
    if (request.chunks.length === 0) {
      return { stored: 0, updated: 0, collection: request.collection };
    }

    let updated = 0;
    let stored = 0;

    for (const chunk of request.chunks) {
      const id = deterministicId(request.url, chunk.anchor);

      // xmax is zero on an insert and non-zero on an update, which is how
      // Postgres lets an upsert report which one happened.
      const { rows } = await getPool().query<{ inserted: boolean }>(
        `INSERT INTO chunks (id, collection, url, anchor, text, tokens, embedding, metadata, model, dimensions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           text       = EXCLUDED.text,
           tokens     = EXCLUDED.tokens,
           embedding  = EXCLUDED.embedding,
           metadata   = EXCLUDED.metadata,
           model      = EXCLUDED.model,
           dimensions = EXCLUDED.dimensions
         RETURNING (xmax = 0) AS inserted`,
        [
          id,
          request.collection,
          request.url,
          chunk.anchor,
          chunk.text,
          chunk.tokens,
          JSON.stringify(chunk.embedding),
          JSON.stringify({ headingPath: chunk.headingPath ?? [], ...request.metadata }),
          request.model ?? null,
          chunk.embedding.length,
        ],
      );

      if (rows[0]?.inserted) stored++;
      else updated++;
    }

    this.#logger?.debug(
      { collection: request.collection, stored, updated },
      'upserted into pgvector',
    );

    return { stored, updated, collection: request.collection };
  }

  async models(collection: string, model: string): Promise<CollectionModels> {
    const { rows } = await getPool().query<{ model: string | null; dimensions: number | null }>(
      `SELECT model, COALESCE(max(dimensions), max(vector_dims(embedding))) AS dimensions
         FROM chunks WHERE collection = $1 GROUP BY model`,
      [collection],
    );
    return {
      exists: rows.length > 0,
      otherModel: rows.find((r) => r.model !== null && r.model !== model)?.model ?? undefined,
      untracked: rows.some((r) => r.model === null),
      dimensions: rows.find((r) => r.dimensions !== null)?.dimensions ?? undefined,
    };
  }

  async query(request: QueryRequest): Promise<QueryHit[]> {
    const { rows } = await getPool().query<{
      text: string;
      anchor: string;
      url: string;
      heading_path: unknown;
      score: number;
    }>(
      `SELECT text, anchor, url, metadata->'headingPath' AS heading_path,
              1 - (embedding <=> $1::vector) AS score
         FROM chunks
        WHERE collection = $2 AND ($3::text IS NULL OR url = $3)
        ORDER BY embedding <=> $1::vector
        LIMIT $4`,
      [JSON.stringify(request.vector), request.collection, request.filter?.url ?? null, request.k],
    );
    return rows.map((row) => ({
      text: row.text,
      anchor: row.anchor,
      url: row.url,
      headingPath: Array.isArray(row.heading_path) ? row.heading_path.map(String) : [],
      score: Number(row.score),
    }));
  }

  async health(): Promise<boolean> {
    try {
      await getPool().query('SELECT 1 FROM chunks LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }
}

export function createSink(
  type: string,
  env: NodeJS.ProcessEnv,
  logger?: Log,
): VectorSink | undefined {
  switch (type) {
    case 'qdrant': {
      const url = env['QDRANT_URL'];
      if (!url) return undefined;
      return new QdrantSink(url, env['QDRANT_API_KEY'], logger);
    }
    case 'pgvector':
      return new PgVectorSink(logger);
    default:
      return undefined;
  }
}
