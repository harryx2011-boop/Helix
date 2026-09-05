import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RobotsCache } from '../crawl/robots.js';

/**
 * Dry-run robots.txt check: whether a URL is allowed, without fetching it.
 *
 * Shares `RobotsCache` with `/crawl` and `/map`, so the answer here is exactly
 * what a crawl would decide — never a second opinion from a separate parser.
 */

const RobotsCheckRequestSchema = z.object({
  url: z.string().url(),
  userAgent: z.string().min(1).optional(),
});

export interface RobotsRouteDeps {
  userAgent: string;
}

export async function registerRobots(app: FastifyInstance, deps: RobotsRouteDeps): Promise<void> {
  app.post('/robots-check', async (request, reply) => {
    const parsed = RobotsCheckRequestSchema.safeParse(request.body);

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
    const userAgent = body.userAgent ?? deps.userAgent;

    const robots = new RobotsCache(userAgent, request.log);
    const rules = await robots.forUrl(body.url);

    return reply.send({
      url: body.url,
      userAgent,
      allowed: rules.isAllowed(body.url),
      crawlDelaySeconds: rules.crawlDelaySeconds() ?? null,
      sitemaps: rules.sitemaps(),
    });
  });
}
