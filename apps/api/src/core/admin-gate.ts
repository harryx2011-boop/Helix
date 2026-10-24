import type { FastifyReply, FastifyRequest } from 'fastify';
import { safeEqual } from './api-keys.js';

/**
 * The admin-token gate for operator routes (`/settings`, `/internal`, `/v1/keys`).
 *
 * Register it as an `onRequest` hook inside an encapsulated plugin that holds
 * only the gated routes. The router then decides which requests it covers:
 * every spelling of a path that reaches one of those handlers meets the gate,
 * whatever the raw URL looked like.
 *
 * The Host check refuses a request addressed to any name other than loopback or
 * the configured public URL. A page on another site that rebinds its own name
 * to 127.0.0.1 still sends its own name as the Host, so it is refused here.
 */

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** The lowercase host name of a Host header or URL, port removed. */
function hostNameOf(value: string, withScheme: boolean): string | undefined {
  try {
    return new URL(withScheme ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export interface AdminGateOptions {
  token: string;
  /** The instance's public URL; its host name is accepted beside loopback. */
  publicUrl?: string | undefined;
  /** The 401 message, so each surface keeps its own wording. */
  message?: string;
}

export function adminGate(options: AdminGateOptions) {
  const allowed = new Set(LOOPBACK_HOSTS);
  const publicHost = options.publicUrl ? hostNameOf(options.publicUrl, true) : undefined;
  if (publicHost) allowed.add(publicHost);
  const message = options.message ?? 'Missing or invalid admin token.';

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const host = hostNameOf(request.headers.host ?? '', false);
    if (!host || !allowed.has(host)) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'This route answers only on the instance’s own host name.',
        requestId: request.id,
      });
    }

    const presented = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!presented || !safeEqual(presented, options.token)) {
      return reply.code(401).send({ error: 'unauthorized', message, requestId: request.id });
    }
  };
}
