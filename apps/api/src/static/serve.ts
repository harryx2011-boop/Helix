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

/**
 * Who may show the UI in a frame: this origin, and a VS Code webview (the
 * Helix extension hosts `/app` in one). `vscode-file:` is the workbench the
 * webview sits in, and frame-ancestors checks every ancestor, not only the
 * parent. The API's own replies keep helmet's SAMEORIGIN.
 *
 * Accepted surface: the scheme admits any extension's webview, not only
 * Helix's (an origin per webview is random, so it cannot be pinned). No web
 * page can frame the UI, and an installed extension already runs with this
 * user's full access, so it gains nothing a frame would add.
 */
export const UI_FRAME_ANCESTORS = "frame-ancestors 'self' vscode-webview: vscode-file:";

/**
 * The UI's content policy. The renderer holds the API key and admin token, so
 * script may come only from this origin, with no string evaluation (WebAssembly
 * stays allowed for the syntax highlighter), and plugins, base rewrites and
 * foreign form targets are refused.
 *
 * ponytail: 'unsafe-inline' stays because the static export inlines its
 * bootstrap scripts; hashing them at export time would close inline injection too.
 * There is no default-src: images and API calls may point at other hosts
 * (thumbnails, another instance), and a connect-src allow-list would break that.
 */
export const UI_CONTENT_SECURITY_POLICY = [
  // blob: carries the dictation mic's AudioWorklet (lib/voice-core/react/capture.ts),
  // built from the page's own source; only script already on the page can mint one.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  UI_FRAME_ANCESTORS,
].join('; ');

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
  if (path.endsWith('/')) return [`${path}index.html`, `${path.slice(0, -1)}.html`];
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
      // A colon names an NTFS alternate data stream (`app.html::$DATA`), which resolves inside the root.
      if (path === undefined || isApiPath(path) || path.includes('\0') || path.includes(':')) {
        return reply.callNotFound();
      }

      // X-Frame-Options has no allow-list, so it gives way to the CSP form.
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
