import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ApiKey } from './api-keys.js';
import { rateLimitHeaders, type RateLimiter } from './rate-limit.js';
import type { UsageRecorder } from './usage.js';

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKey;
  }
  interface FastifyContextConfig {
    public?: (path: string) => boolean;
  }
}

export const INTERNAL_TICKET_HEADER = 'x-helix-internal-ticket';

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
  open?: string[];
  usage?: UsageRecorder;
}

export function registerAuth(app: FastifyInstance, deps: AuthDeps): void {
  const open = deps.open ?? ['/v1/health'];

  const isOpen = (request: {
    url: string;
    routeOptions?: { url?: string | undefined; config?: { public?: (path: string) => boolean } };
  }): boolean => {
    const path = request.url.split(/[?#]/)[0] ?? '';
    const isPublic = request.routeOptions?.config?.public;
    const matched = request.routeOptions?.url;
    if (typeof isPublic === 'function') {
      if (isPublic(path)) return true;
    } else if (typeof matched === 'string') {
      return open.some((prefix) => matched.startsWith(prefix));
    }

    if (/%2e/i.test(path)) return false;
    if (path.split('/').includes('..') || path.split('/').includes('.')) return false;
    return open.some((prefix) => path.startsWith(prefix));
  };

  app.addHook('onRequest', async (request, reply) => {
    if (isOpen(request)) return;

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
      app.log.error({ error }, 'api key lookup failed');
      return reply.code(503).send({
        error: 'service_unavailable',
        message: 'Unable to verify credentials right now. Retry shortly.',
        requestId: request.id,
      });
    }

    if (!apiKey) {
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

  app.addHook('onResponse', async (request, reply) => {
    const apiKeyId = request.apiKey?.id;
    if (!apiKeyId) return;
    usage.record(apiKeyId, request.url, reply.statusCode);
  });
}
