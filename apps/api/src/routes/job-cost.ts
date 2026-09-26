import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';
import { isJobId, notFound } from './jobs.js';

/**
 * What a job actually consumed, beside the projection it was made against.
 *
 * Every figure here was measured or saved when the job ran. One that was not
 * is `null`, and `reasons` says why: a zero would claim the job used nothing,
 * and a projection recomputed now would describe today's site, not the one the
 * job crawled.
 */

interface CostRow {
  id: string;
  type: string;
  status: string;
  usage: {
    pagesFetched?: number;
    pagesUnchanged?: number;
    tierBreakdown?: Record<string, number>;
    browserSeconds?: number;
  };
  estimate: Record<string, unknown> | null;
}

const FINISHED = new Set(['completed', 'failed']);

export async function registerJobCost(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/jobs/:id/cost', async (request, reply) => {
    const { id } = request.params;
    if (!isJobId(id)) {
      const result = notFound(request.id);
      return reply.code(result.code).send(result.body);
    }

    const { rows } = await getPool().query<CostRow>(
      'SELECT id, type, status, usage, estimate FROM jobs WHERE id = $1',
      [id],
    );
    const job = rows[0];
    if (!job) {
      const result = notFound(request.id);
      return reply.code(result.code).send(result.body);
    }

    const usage = job.usage ?? {};
    const reasons: string[] = [];

    if (usage.pagesFetched === undefined) {
      reasons.push(
        FINISHED.has(job.status)
          ? 'This job recorded no usage.'
          : `The job is ${job.status}; its figures are written when it finishes.`,
      );
    } else if (usage.tierBreakdown === undefined) {
      reasons.push('Tiers and browser time were not counted for this job: it finished before they were.');
    }
    reasons.push('Tokens and provider spend are not tracked per job; your provider reports them.');
    if (job.estimate === null) {
      reasons.push(
        job.type === 'batch_scrape'
          ? 'A batch discovers nothing, so it has no projection.'
          : 'No projection was saved: the crawl was resumed, its discovery failed, or it predates saved projections.',
      );
    }

    return reply.send({
      jobId: job.id,
      type: job.type,
      status: job.status,
      actual: {
        pagesFetched: usage.pagesFetched ?? null,
        pagesUnchanged: usage.pagesUnchanged ?? null,
        tierBreakdown: usage.tierBreakdown ?? null,
        browserSeconds: usage.browserSeconds ?? null,
        tokens: null,
        providerCost: null,
      },
      estimate: job.estimate,
      reasons,
    });
  });
}
