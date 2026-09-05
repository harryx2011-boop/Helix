import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';

/**
 * Success/block rate for one fingerprint profile.
 *
 * `documents.profile` and `fetch_failures.profile` both name the identity that
 * was applied, win or lose, so the rate is real usage against this profile
 * rather than a count of failures alone.
 */

interface ProfileHealthRow {
  successes: string;
  failures: string;
  last_used_at: Date | null;
}

export async function registerProfiles(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/profiles/:id/health', async (request, reply) => {
    const { id } = request.params;

    const { rows } = await getPool().query<ProfileHealthRow>(
      `SELECT
         (SELECT count(*) FROM documents WHERE profile = $1) AS successes,
         (SELECT count(*) FROM fetch_failures WHERE profile = $1) AS failures,
         GREATEST(
           (SELECT max(fetched_at) FROM documents WHERE profile = $1),
           (SELECT max(occurred_at) FROM fetch_failures WHERE profile = $1)
         ) AS last_used_at`,
      [id],
    );

    const row = rows[0];
    const successes = Number.parseInt(row?.successes ?? '0', 10);
    const failures = Number.parseInt(row?.failures ?? '0', 10);
    const attempts = successes + failures;

    if (attempts === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'No recorded attempts for that profile.',
        requestId: request.id,
      });
    }

    return reply.send({
      profile: id,
      attempts,
      successes,
      failures,
      successRate: successes / attempts,
      lastUsedAt: row?.last_used_at ?? null,
    });
  });
}
