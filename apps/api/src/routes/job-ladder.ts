import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';
import { CURSOR, PAGE_SIZE, isJobId, notFound } from './jobs.js';

/**
 * Which tier served each page of a job, and why it climbed to get there.
 *
 * The ladder is Helix's own evidence trail: a page that needed a browser
 * says which cheaper tier it tried first and what that tier returned. Pages
 * recorded before the pipeline kept its climbs answer `escalations: null`
 * rather than an empty list, which would claim the first tier served them.
 */

interface LadderRow {
  url: string;
  tier: string | null;
  profile: string | null;
  metadata: {
    tiersAttempted?: string[];
    escalations?: Array<{ from: string; to: string; reason: string }>;
    timingMs?: number;
  };
}

export async function registerJobLadder(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>('/jobs/:id/ladder', async (request, reply) => {
    const { id } = request.params;
    const { cursor } = request.query;

    if (!isJobId(id)) {
      const result = notFound(request.id);
      return reply.code(result.code).send(result.body);
    }
    if (cursor !== undefined && !CURSOR.test(cursor)) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'cursor: must be the `next` cursor from a previous response',
        field: 'cursor',
        requestId: request.id,
      });
    }

    const { rowCount } = await getPool().query('SELECT 1 FROM jobs WHERE id = $1', [id]);
    if ((rowCount ?? 0) === 0) {
      const result = notFound(request.id);
      return reply.code(result.code).send(result.body);
    }

    const offset = Number.parseInt(cursor ?? '0', 10);
    const { rows } = await getPool().query<LadderRow>(
      `SELECT url, tier, profile, metadata
         FROM documents
        WHERE job_id = $1
        ORDER BY fetched_at
        LIMIT $2 OFFSET $3`,
      [id, PAGE_SIZE, offset],
    );

    return reply.send({
      jobId: id,
      next: rows.length === PAGE_SIZE ? `/v1/jobs/${id}/ladder?cursor=${offset + rows.length}` : null,
      data: rows.map((row) => ({
        url: row.url,
        tier: row.tier,
        tiersAttempted: row.metadata.tiersAttempted ?? (row.tier ? [row.tier] : []),
        escalations: Array.isArray(row.metadata.escalations) ? row.metadata.escalations : null,
        profile: row.profile,
        timingMs: row.metadata.timingMs ?? null,
      })),
    });
  });
}
