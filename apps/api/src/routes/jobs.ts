import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';

/**
 * Job status, results and cancellation.
 *
 * Results are paginated by cursor rather than returned whole: a crawl of ten
 * thousand pages does not fit in one response, and a caller that has to guess
 * whether it received everything has not really received anything.
 */

const PAGE_SIZE = 100;

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

export async function registerJobs(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/jobs/:id',
    async (request, reply) => {
      const { rows } = await getPool().query<JobRow>(
        `SELECT id, type, status, total, completed, failed, usage, error,
                created_at, started_at, finished_at, expires_at
           FROM jobs WHERE id = $1`,
        [request.params.id],
      );

      const job = rows[0];
      if (!job) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'No such job.',
          requestId: request.id,
        });
      }

      const offset = Number.parseInt(request.query.cursor ?? '0', 10) || 0;

      const { rows: documents } = await getPool().query<{
        url: string;
        content: Record<string, unknown>;
        metadata: Record<string, unknown>;
      }>(
        `SELECT url, content, metadata
           FROM documents
          WHERE job_id = $1
          ORDER BY fetched_at
          LIMIT $2 OFFSET $3`,
        [job.id, PAGE_SIZE, offset],
      );

      const nextOffset = offset + documents.length;
      const hasMore = documents.length === PAGE_SIZE;

      return reply.send({
        id: job.id,
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
        next: hasMore ? `/v1/jobs/${job.id}?cursor=${nextOffset}` : undefined,
        data: documents.map((doc) => ({ ...doc.content, metadata: doc.metadata })),
        usage: job.usage,
      });
    },
  );

  app.delete<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    // Cancelling drops queued work but leaves finished results retrievable —
    // and deliberately does not emit one failure webhook per abandoned URL,
    // which turns a cancellation into a flood for the receiver.
    const { rows } = await getPool().query<{ id: string; status: string }>(
      `UPDATE jobs
          SET status = 'cancelled', finished_at = now()
        WHERE id = $1 AND status IN ('queued', 'running')
        RETURNING id, status`,
      [request.params.id],
    );

    const job = rows[0];
    if (!job) {
      const { rowCount } = await getPool().query('SELECT 1 FROM jobs WHERE id = $1', [
        request.params.id,
      ]);
      if ((rowCount ?? 0) === 0) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'No such job.',
          requestId: request.id,
        });
      }
      return reply.code(409).send({
        error: 'not_cancellable',
        message: 'That job has already finished.',
        requestId: request.id,
      });
    }

    await getPool().query(
      `UPDATE job_tasks SET status = 'cancelled'
        WHERE job_id = $1 AND status = 'queued'`,
      [job.id],
    );

    return reply.send({ id: job.id, status: job.status });
  });

  app.get<{ Params: { id: string } }>('/jobs/:id/errors', async (request, reply) => {
    const { rowCount } = await getPool().query('SELECT 1 FROM jobs WHERE id = $1', [
      request.params.id,
    ]);
    if ((rowCount ?? 0) === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'No such job.',
        requestId: request.id,
      });
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
}
