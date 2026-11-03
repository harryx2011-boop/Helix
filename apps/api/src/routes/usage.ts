import type { FastifyInstance } from 'fastify';
import { listApiKeys } from '../core/api-keys.js';
import { summariseUsage } from '../core/usage.js';


const MIN_WINDOW = 1;
const MAX_WINDOW = 24 * 90;
const DEFAULT_WINDOW = 24 * 7;

export async function registerUsage(app: FastifyInstance): Promise<void> {
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
      window: { hours: parsed, unit: 'hour' },
    });
  });

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
