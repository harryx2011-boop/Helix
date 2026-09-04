import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: VerifiedKey;
  }
}

export type VerifiedKey = { id: string; name: string; rateLimit: number };

/** Same shape the rest of Helix issues: `helix-` + 16 of [A-Za-z0-9]. */
const KEY_PREFIX = 'helix-';
const KEY_SHAPE = new RegExp(`^${KEY_PREFIX}[A-Za-z0-9]{16}$`);

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function isKeyShape(value: string): boolean {
  return KEY_SHAPE.test(value);
}

export type Verifier = (token: string) => Promise<VerifiedKey | undefined>;

export type AuthOptions = {
  verify: Verifier;
  /** URL prefixes served without a key. */
  open?: string[];
};

/**
 * Helix authenticates with bearer keys and has no session layer, so the browser
 * tool holds a key too rather than a cookie. The key travels in the header on
 * XHR and, because EventSource cannot set headers, in the query string on the
 * SSE stream alone — that URL is same-origin, never logged with its query, and
 * names a job the key already owns.
 */
export function tokenFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }

  const query = request.query as Record<string, unknown> | undefined;
  const key = query?.key;
  return typeof key === 'string' && key ? key : undefined;
}

export function registerAuth(app: FastifyInstance, options: AuthOptions): void {
  const open = options.open ?? ['/health'];

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return;
    if (open.some((prefix) => request.url.startsWith(prefix))) return;

    const token = tokenFrom(request);
    if (!token) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Missing API key. Send `Authorization: Bearer helix-...`.',
      });
    }

    let key: VerifiedKey | undefined;
    try {
      key = await options.verify(token);
    } catch (error) {
      // An unreachable key store is our fault, not the caller's.
      app.log.error({ error }, 'api key lookup failed');
      return reply.code(503).send({
        error: 'service_unavailable',
        message: 'Unable to verify credentials right now. Retry shortly.',
      });
    }

    if (!key) {
      // Unknown and revoked are deliberately indistinguishable.
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid API key.' });
    }

    request.apiKey = key;
  });
}

/**
 * Postgres-backed verifier reading the same `api_keys` table the rest of Helix
 * writes. Imported lazily so the service starts without a database when
 * CONVERT_AUTH is off.
 */
export async function postgresVerifier(): Promise<Verifier> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  return async (token) => {
    if (!isKeyShape(token)) return undefined;

    const { rows } = await pool.query<{ id: string; name: string; rate_limit: number }>(
      `SELECT id, name, rate_limit
         FROM api_keys
        WHERE key_hash = $1 AND revoked_at IS NULL`,
      [hashKey(token)],
    );

    const row = rows[0];
    if (!row) return undefined;
    return { id: row.id, name: row.name, rateLimit: row.rate_limit };
  };
}
