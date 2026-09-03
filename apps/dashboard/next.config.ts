import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { NextConfig } from 'next';

const currentDir = dirname(fileURLToPath(import.meta.url));
const hosted = process.env.HELIX_HOSTED === '1';

// Self-host: static export served by the Fastify API at `/` (FRONTEND.md §3).
// Hosted: server output, because Clerk middleware and the route handlers need it (WEBSITE.md §1).
const nextConfig: NextConfig = {
  ...(hosted ? {} : { output: 'export' as const }),
  // Two dev servers on one checkout fight over `.next` — the second dies on a
  // locked `.next/trace`. Setting this lets a second instance build elsewhere:
  //   NEXT_DIST_DIR=.next-alt pnpm exec next dev -p 3401
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Self-host has no dashboard server: the route handlers under app/api are
  // hosted-only, and `force-dynamic` is illegal under `output: export`. The
  // static export therefore accepts only `.tsx` special files, which drops every
  // `route.ts` handler and the `.hosted.tsx` Clerk pages in one rule; the
  // static handlers self-host does serve (llms.txt, md, SKILL.md) are `.tsx`.
  // Route handlers must NOT use a dotted extension like `route.hosted.ts`:
  // Vercel's builder derives the client-reference-manifest name by stripping
  // only the last extension and fails the build on the file it cannot find.
  pageExtensions: hosted ? ['hosted.tsx', 'tsx', 'ts'] : ['tsx'],
  images: { unoptimized: true },
  outputFileTracingRoot: resolve(currentDir, '..', '..'),
  env: { NEXT_PUBLIC_HELIX_HOSTED: hosted ? '1' : '0' },
  // Clerk ships Server Actions, which `output: export` refuses. A runtime
  // HOSTED branch is not enough — the static import alone pulls them in — so
  // the self-host build aliases the package to a stub instead.
  ...(hosted
    ? {}
    : {
        webpack: (webpackConfig: { resolve: { alias: Record<string, string> } }) => {
          webpackConfig.resolve.alias['@clerk/nextjs/server'] = resolve(currentDir, 'lib', 'clerk-stub', 'server.ts');
          webpackConfig.resolve.alias['@clerk/nextjs'] = resolve(currentDir, 'lib', 'clerk-stub', 'index.tsx');
          return webpackConfig;
        },
      }),
};

export default nextConfig;
