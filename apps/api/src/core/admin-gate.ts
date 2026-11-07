import type { FastifyReply, FastifyRequest } from 'fastify';
import { safeEqual } from './api-keys.js';


const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function hostNameOf(value: string, withScheme: boolean): string | undefined {
  try {
    return new URL(withScheme ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export interface AdminGateOptions {
  token: string;
  publicUrl?: string | undefined;
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
