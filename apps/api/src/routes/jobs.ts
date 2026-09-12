import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';

/**
 * Job status, results and cancellation.
 *
 * Results are paginated by cursor rather than returned whole: a crawl of ten
 * thousand pages does not fit in one response, and a caller that has to guess
 * whether it received everything has not really received anything.
 *
 * The handlers are exported so `/crawl/{jobId}` can serve the same view under
 * the path the crawl spec documents.
 */

const PAGE_SIZE = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Job ids are uuids. Anything else is answered as not found before it reaches
 * a query: Postgres rejects a malformed value on a uuid column as an error,
 * which would surface as a 500 for what is a caller's typo.
 */
export function isJobId(id: string): boolean {
  return UUID.test(id);
}

/** Only an offset this API handed out is a cursor. Postgres rejects a negative or oversized one. */
const CURSOR = /^\d{1,15}$/;

function notFound(requestId: string): RouteResult {
  return {
    code: 404,
    body: { error: 'not_found', message: 'No such job.', requestId },
  };
}

interface JobRow {
  id: string;
  type: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  usage: Record<string, unknown>;
  error: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  expires_at: Date;
}

/**
 * Restricts a job read or cancellation to the calling key.
 *
 * Only on a multi-tenant instance. Under self-host every key belongs to the
 * same operator, and an operator polling a job with a different key than
 * created it is ordinary use, not a boundary crossing.
 *
 * `api_key_id IS NULL` stays readable either way: jobs created before the
 * column was populated, and anything the workers write unattributed, would
 * otherwise be orphaned by an upgrade.
 */
export interface JobOwner {
  apiKeyId?: string | null | undefined;
  multiTenant?: boolean | undefined;
}

/**
 * The owner predicate and its parameters, or neither. Returned together so a
 * caller cannot add the clause and forget the value that fills it.
 */
function ownerClause(
  owner: JobOwner | undefined,
  nextParam: number,
): { sql: string; values: (string | null)[] } {
  if (owner?.multiTenant !== true) return { sql: '', values: [] };
  // A null key matches no attributed row rather than every one: `= NULL` is
  // never true, so an unauthenticated caller is left with the unattributed
  // jobs only. Passing a placeholder string instead would error on a uuid column.
  return {
    sql: ` AND (api_key_id = $${nextParam}::uuid OR api_key_id IS NULL)`,
    values: [owner.apiKeyId ?? null],
  };
}

export interface JobViewOptions extends JobOwner {
  cursor?: string | undefined;
  /** Path prefix used to build the `next` cursor link, e.g. `/v1/jobs`. */
  basePath: string;
  /** Restrict to one job type; other types answer 404 on that path. */
  type?: string | undefined;
  requestId: string;
}

export interface RouteResult {
  code: number;
  body: Record<string, unknown>;
}

export async function fetchJobView(id: string, options: JobViewOptions): Promise<RouteResult> {
  if (!isJobId(id)) return notFound(options.requestId);

  if (options.cursor !== undefined && !CURSOR.test(options.cursor)) {
    return {
      code: 400,
      body: {
        error: 'invalid_request',
        message: 'cursor: must be the `next` cursor from a previous response',
        field: 'cursor',
        requestId: options.requestId,
      },
    };
  }

  const owner = ownerClause(options, 2);

  const { rows } = await getPool().query<JobRow>(
    `SELECT id, type, status, total, completed, failed, usage, error,
            created_at, started_at, finished_at, expires_at
       FROM jobs WHERE id = $1${owner.sql}`,
    [id, ...owner.values],
  );

  const job = rows[0];
  if (!job || (options.type !== undefined && job.type !== options.type)) {
    return notFound(options.requestId);
  }

  const offset = Number.parseInt(options.cursor ?? '0', 10);

  const { rows: documents } = await getPool().query<{
    url: string;
    final_url: string | null;
    content: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }>(
    `SELECT url, final_url, content, metadata
       FROM documents
      WHERE job_id = $1
      ORDER BY fetched_at
      LIMIT $2 OFFSET $3`,
    [job.id, PAGE_SIZE, offset],
  );

  const nextOffset = offset + documents.length;
  const hasMore = documents.length === PAGE_SIZE;

  return {
    code: 200,
    body: {
      id: job.id,
      jobId: job.id,
      type: job.type,
      status: job.status,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      createdAt: job.created_at,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      expiresAt: job.expires_at,
      error: job.error,
      next: hasMore ? `${options.basePath}/${job.id}?cursor=${nextOffset}` : null,
      data: documents.map((doc) => ({
        url: doc.url,
        ...doc.content,
        metadata: { ...doc.metadata, sourceUrl: doc.url, finalUrl: doc.final_url ?? doc.url },
      })),
      usage: job.usage,
    },
  };
}

export async function cancelJob(
  id: string,
  options: JobOwner & { type?: string | undefined; requestId: string },
): Promise<RouteResult> {
  if (!isJobId(id)) return notFound(options.requestId);

  const owner = ownerClause(options, 3);

  // Cancelling drops queued work but leaves finished results retrievable —
  // and deliberately does not emit one failure webhook per abandoned URL,
  // which turns a cancellation into a flood for the receiver.
  const { rows } = await getPool().query<{ id: string; status: string }>(
    `UPDATE jobs
        SET status = 'cancelled', finished_at = now()
      WHERE id = $1 AND status IN ('queued', 'running')
        AND ($2::text IS NULL OR type = $2::job_type)${owner.sql}
      RETURNING id, status`,
    [id, options.type ?? null, ...owner.values],
  );

  const job = rows[0];
  if (!job) {
    const { rowCount } = await getPool().query(
      `SELECT 1 FROM jobs WHERE id = $1 AND ($2::text IS NULL OR type = $2::job_type)${owner.sql}`,
      [id, options.type ?? null, ...owner.values],
    );
    if ((rowCount ?? 0) === 0) return notFound(options.requestId);
    return {
      code: 409,
      body: {
        error: 'not_cancellable',
        message: 'That job has already finished.',
        requestId: options.requestId,
      },
    };
  }

  await getPool().query(
    `UPDATE job_tasks SET status = 'cancelled'
      WHERE job_id = $1 AND status = 'queued'`,
    [job.id],
  );

  return { code: 200, body: { id: job.id, jobId: job.id, status: job.status } };
}

interface JobRequestRow {
  request: Record<string, unknown>;
}

/**
 * A job's expected output shape, projected from the request that created it
 * rather than stored separately — `jobs.request` already holds the whole
 * original body, and a second copy would only be a chance for the two to
 * disagree.
 */
export async function fetchJobSchema(id: string, options: JobOwner & { requestId: string }): Promise<RouteResult> {
  if (!isJobId(id)) return notFound(options.requestId);

  const owner = ownerClause(options, 2);

  const { rows } = await getPool().query<JobRequestRow>(
    `SELECT request FROM jobs WHERE id = $1${owner.sql}`,
    [id, ...owner.values],
  );

  const job = rows[0];
  if (!job) return notFound(options.requestId);

  const request = job.request;
  const scrapeOptions = (request['scrapeOptions'] as Record<string, unknown> | undefined) ?? {};
  const formats =
    (request['formats'] as unknown[] | undefined) ??
    (scrapeOptions['formats'] as unknown[] | undefined) ??
    ['markdown'];
  const extraction =
    (request['jsonOptions'] as Record<string, unknown> | undefined) ??
    (request['extract'] as Record<string, unknown> | undefined) ??
    (scrapeOptions['jsonOptions'] as Record<string, unknown> | undefined) ??
    (scrapeOptions['extract'] as Record<string, unknown> | undefined);

  return {
    code: 200,
    body: {
      id,
      jobId: id,
      formats,
      schema: extraction?.['schema'] ?? null,
      prompt: extraction?.['prompt'] ?? null,
    },
  };
}

export interface JobRouteDeps {
  multiTenant?: boolean;
}

export async function registerJobs(app: FastifyInstance, deps: JobRouteDeps = {}): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/jobs/:id',
    async (request, reply) => {
      const result = await fetchJobView(request.params.id, {
        cursor: request.query.cursor,
        basePath: '/v1/jobs',
        requestId: request.id,
        apiKeyId: request.apiKey?.id ?? null,
        multiTenant: deps.multiTenant === true,
      });
      return reply.code(result.code).send(result.body);
    },
  );

  app.delete<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    const result = await cancelJob(request.params.id, {
      requestId: request.id,
      apiKeyId: request.apiKey?.id ?? null,
      multiTenant: deps.multiTenant === true,
    });
    return reply.code(result.code).send(result.body);
  });

  app.get<{ Params: { id: string } }>('/jobs/:id/errors', async (request, reply) => {
    if (!isJobId(request.params.id)) {
      const result = notFound(request.id);
      return reply.code(result.code).send(result.body);
    }
    // The failure list names every URL the crawl touched and the tier and
    // profile each was tried at. A job the caller cannot see must not be
    // distinguishable here from one that does not exist.
    const owner = ownerClause(
      { apiKeyId: request.apiKey?.id ?? null, multiTenant: deps.multiTenant === true },
      2,
    );
    const { rowCount } = await getPool().query(
      `SELECT 1 FROM jobs WHERE id = $1${owner.sql}`,
      [request.params.id, ...owner.values],
    );
    if ((rowCount ?? 0) === 0) {
      const result = notFound(request.id);
      return reply.code(result.code).send(result.body);
    }

    const { rows } = await getPool().query<{
      url: string;
      reason: string;
      detail: string | null;
      status_code: number | null;
      detected_by: string[] | null;
      tier: string | null;
      tiers_tried: string[] | null;
      profile: string | null;
      escalation_available: boolean;
      occurred_at: Date;
    }>(
      `SELECT url, reason, detail, status_code, detected_by, tier, tiers_tried,
              profile, escalation_available, occurred_at
         FROM fetch_failures
        WHERE job_id = $1
        ORDER BY occurred_at`,
      [request.params.id],
    );

    return reply.send({
      errors: rows.map((row) => ({
        url: row.url,
        reason: row.reason,
        detail: row.detail,
        statusCode: row.status_code,
        detectedBy: row.detected_by ?? [],
        tier: row.tier,
        tiersAttempted: row.tiers_tried ?? [],
        profile: row.profile,
        escalationAvailable: row.escalation_available,
        occurredAt: row.occurred_at,
      })),
      robotsBlocked: rows.filter((r) => r.reason === 'robots_denied').map((r) => r.url),
    });
  });

  app.get<{ Params: { id: string } }>('/jobs/:id/schema', async (request, reply) => {
    const result = await fetchJobSchema(request.params.id, {
      requestId: request.id,
      apiKeyId: request.apiKey?.id ?? null,
      multiTenant: deps.multiTenant === true,
    });
    return reply.code(result.code).send(result.body);
  });
}
