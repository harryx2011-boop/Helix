import type { FastifyInstance } from 'fastify';
import { listApiKeys } from '../core/api-keys.js';
import { summariseUsage } from '../core/usage.js';

/**
 * Request usage for the calling key.
 *
 * Scoped to `request.apiKey` and nothing else: a key id in the query would let
 * any caller read any other caller's traffic, and there is no ownership model
 * at this layer to check it against. The hosted dashboard aggregates across a
 * profile's keys by calling this with each of them — that fan-out belongs where
 * the profile is known, which is the dashboard, not here.
 */

export interface UsageRouteDeps {
  /**
   * Many tenants share this instance, so summing every key on it crosses the
   * tenant boundary. `/usage/all` has no owner predicate to narrow — that
   * fan-out belongs to the dashboard, where the profile is known — so it is
   * withheld here instead. Per-key `/usage` is unaffected: it already reads
   * only the calling key.
   */
  multiTenant?: boolean;
}

/** Hours. Bounded so a caller cannot ask for a scan of the whole table. */
const MIN_WINDOW = 1;
const MAX_WINDOW = 24 * 90;
const DEFAULT_WINDOW = 24 * 7;

export async function registerUsage(app: FastifyInstance, deps: UsageRouteDeps = {}): Promise<void> {
  app.get<{ Querystring: { hours?: string } }>('/usage', async (request, reply) => {
    const apiKey = request.apiKey;
    if (!apiKey) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Missing API key.',
        requestId: request.id,
      });
    }

    const raw = request.query.hours;
    const parsed = raw === undefined ? DEFAULT_WINDOW : Number(raw);
    if (!Number.isInteger(parsed) || parsed < MIN_WINDOW || parsed > MAX_WINDOW) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `hours: must be an integer between ${MIN_WINDOW} and ${MAX_WINDOW}`,
        field: 'hours',
        requestId: request.id,
      });
    }

    const until = new Date();
    const since = new Date(until.getTime() - parsed * 60 * 60 * 1000);

    const summary = await summariseUsage([apiKey.id], since, until);

    return reply.send({
      ...summary,
      key: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        rateLimit: apiKey.rateLimit,
        lastUsedAt: apiKey.lastUsedAt,
      },
      // The limiter is an in-process token bucket, so remaining headroom is
      // only knowable from the X-RateLimit-* headers on a live response, not
      // from anything stored. Stating the window here keeps the dashboard from
      // presenting a stored count as if it were current headroom.
      window: { hours: parsed, unit: 'hour' },
    });
  });

  if (deps.multiTenant === true) return;

  /**
   * Usage across every key on this instance. Self-host only, and now enforced
   * as such: the hosted deployment never calls it, because a key there belongs
   * to one profile and this would cross that boundary.
   */
  app.get<{ Querystring: { hours?: string } }>('/usage/all', async (request, reply) => {
    const raw = request.query.hours;
    const parsed = raw === undefined ? DEFAULT_WINDOW : Number(raw);
    if (!Number.isInteger(parsed) || parsed < MIN_WINDOW || parsed > MAX_WINDOW) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `hours: must be an integer between ${MIN_WINDOW} and ${MAX_WINDOW}`,
        field: 'hours',
        requestId: request.id,
      });
    }

    const until = new Date();
    const since = new Date(until.getTime() - parsed * 60 * 60 * 1000);
    const keys = await listApiKeys();

    const summary = await summariseUsage(
      keys.map((k) => k.id),
      since,
      until,
    );

    return reply.send({ ...summary, window: { hours: parsed, unit: 'hour' } });
  });
}
