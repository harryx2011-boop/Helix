import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ApiKey } from './api-keys.js';
import { rateLimitHeaders, type RateLimiter } from './rate-limit.js';
import type { UsageRecorder } from './usage.js';

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKey;
  }
}

/** Header carrying a one-time ticket on requests the server replays against itself. */
export const INTERNAL_TICKET_HEADER = 'x-helix-internal-ticket';

/**
 * A request the server makes against itself (an MCP tool call replayed through
 * `app.inject`) has already been authenticated and charged on the way in. The
 * outer handler issues a ticket bound to the verified key; the replay redeems
 * it instead of hitting the key store and the limiter a second time. Tickets
 * are unguessable, single-use, and revoked by the issuer once the replay ends.
 */
export class InternalTickets {
  readonly #keys = new Map<string, ApiKey>();

  issue(apiKey: ApiKey): string {
    const ticket = randomUUID();
    this.#keys.set(ticket, apiKey);
    return ticket;
  }

  redeem(ticket: string): ApiKey | undefined {
    const apiKey = this.#keys.get(ticket);
    this.#keys.delete(ticket);
    return apiKey;
  }

  revoke(ticket: string): void {
    this.#keys.delete(ticket);
  }

  get size(): number {
    return this.#keys.size;
  }
}

export interface AuthDeps {
  verifyApiKey: (token: string) => Promise<ApiKey | undefined>;
  limiter: RateLimiter;
  tickets: InternalTickets;
  /** URL prefixes served without a key. */
  open?: string[];
  /**
   * Records one row per response for the usage panel. Optional: a deployment
   * without it (and every existing test) authenticates exactly as before.
   */
  usage?: UsageRecorder;
}

/**
 * Auth and rate limiting for every route.
 *
 * `/v1/health` stays open by default: an unauthenticated liveness probe is what
 * orchestrators need, and it reveals only whether providers are configured,
 * never key material.
 */
export function registerAuth(app: FastifyInstance, deps: AuthDeps): void {
  const open = deps.open ?? ['/v1/health'];

  app.addHook('onRequest', async (request, reply) => {
    if (open.some((prefix) => request.url.startsWith(prefix))) return;

    const ticket = request.headers[INTERNAL_TICKET_HEADER];
    if (typeof ticket === 'string') {
      const apiKey = deps.tickets.redeem(ticket);
      if (apiKey) {
        request.apiKey = apiKey;
        return;
      }
    }

    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

    if (!token) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Missing API key. Send `Authorization: Bearer helix-...`.',
        requestId: request.id,
      });
    }

    let apiKey: ApiKey | undefined;
    try {
      apiKey = await deps.verifyApiKey(token);
    } catch (error) {
      // The key store being unreachable is our fault, not the caller's. Say so
      // plainly rather than implying their credentials are wrong.
      app.log.error({ error }, 'api key lookup failed');
      return reply.code(503).send({
        error: 'service_unavailable',
        message: 'Unable to verify credentials right now. Retry shortly.',
        requestId: request.id,
      });
    }

    if (!apiKey) {
      // Unknown and revoked are deliberately indistinguishable.
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Invalid API key.',
        requestId: request.id,
      });
    }

    request.apiKey = apiKey;

    const decision = deps.limiter.check(apiKey.id, apiKey.rateLimit);
    for (const [name, value] of Object.entries(rateLimitHeaders(decision))) {
      void reply.header(name, value);
    }

    if (!decision.allowed) {
      return reply.code(429).send({
        error: 'rate_limited',
        message: `Rate limit exceeded. Retry in ${decision.retryAfterSeconds ?? 60}s.`,
        requestId: request.id,
      });
    }
  });

  if (!deps.usage) return;
  const usage = deps.usage;

  // onResponse, not onRequest: the status code is the point, and a 429 counted
  // as a request is the only way the headroom figure means anything. Open
  // routes and unauthenticated rejections have no key to attribute and are
  // skipped rather than bucketed under a placeholder.
  app.addHook('onResponse', async (request, reply) => {
    const apiKeyId = request.apiKey?.id;
    if (!apiKeyId) return;
    usage.record(apiKeyId, request.url, reply.statusCode);
  });
}
