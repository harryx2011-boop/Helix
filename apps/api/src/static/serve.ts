import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

export interface StaticOptions {
  /** The dashboard's static export (`apps/dashboard/out`). */
  dir: string;
}

/** Paths the API owns. The UI never answers for them, and they never skip auth. */
const API_PREFIXES = ['/v1', '/settings', '/internal', '/mcp'];

export function isApiPath(path: string): boolean {
  return API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function safeDecode(path: string): string | undefined {
  try {
    return decodeURIComponent(path);
  } catch {
    return undefined;
  }
}

/** A path the UI may answer without a key: anything outside the API's prefixes. */
export const isUiPath = (path: string): boolean => !isApiPath(path);

async function isFile(root: string, candidate: string): Promise<boolean> {
  const full = resolve(root, `.${candidate}`);
  const rel = relative(root, full);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return false;
  try {
    return (await stat(full)).isFile();
  } catch {
    return false;
  }
}

/** A Next.js static export writes `/app/keys` as `app/keys.html` or `app/keys/index.html` depending on `trailingSlash`. */
function candidatesFor(path: string): string[] {
  if (path.endsWith('/')) return [`${path}index.html`];
  return [path, `${path}.html`, `${path}/index.html`];
}

/**
 * Serves the dashboard's static export from the API's own origin, so the
 * desktop app is one process on one port and CORS never enters into it.
 */
export async function registerStatic(app: FastifyInstance, options: StaticOptions): Promise<void> {
  const root = resolve(options.dir);
  await app.register(fastifyStatic, { root, serve: false });

  app.get('/', { config: { public: isUiPath } }, async (_request, reply) => reply.redirect('/app', 302));

  app.route({
    method: ['GET', 'HEAD'],
    url: '/*',
    config: { public: isUiPath },
    handler: async (request, reply) => {
      const path = safeDecode(request.url.split(/[?#]/)[0] ?? '/');
      if (path === undefined || isApiPath(path) || path.includes('\0')) return reply.callNotFound();

      for (const candidate of candidatesFor(path)) {
        if (await isFile(root, candidate)) return reply.sendFile(candidate);
      }
      if (await isFile(root, '/404.html')) return reply.code(404).sendFile('/404.html');
      return reply.callNotFound();
    },
  });
}
