import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

export interface StaticOptions {
  dir: string;
}

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

export const UI_FRAME_ANCESTORS = "frame-ancestors 'self' vscode-webview: vscode-file:";

export const UI_CONTENT_SECURITY_POLICY = [
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  UI_FRAME_ANCESTORS,
].join('; ');

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

function candidatesFor(path: string): string[] {
  if (path.endsWith('/')) return [`${path}index.html`, `${path.slice(0, -1)}.html`];
  return [path, `${path}.html`, `${path}/index.html`];
}

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
      if (path === undefined || isApiPath(path) || path.includes('\0') || path.includes(':')) {
        return reply.callNotFound();
      }

      reply.removeHeader('x-frame-options');
      reply.header('content-security-policy', UI_CONTENT_SECURITY_POLICY);

      for (const candidate of candidatesFor(path)) {
        if (await isFile(root, candidate)) return reply.sendFile(candidate);
      }
      if (await isFile(root, '/404.html')) return reply.code(404).sendFile('/404.html');
      return reply.callNotFound();
    },
  });
}
