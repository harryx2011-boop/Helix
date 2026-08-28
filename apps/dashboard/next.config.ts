import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { NextConfig } from 'next';

const currentDir = dirname(fileURLToPath(import.meta.url));
const hosted = process.env.HELIX_HOSTED === '1';

// Self-host: static export served by the Fastify API at `/` (FRONTEND.md §3).
// Hosted: server output, because Clerk middleware and the route handlers need it (WEBSITE.md §1).
const nextConfig: NextConfig = {
  ...(hosted ? {} : { output: 'export' as const }),
  // Self-host has no dashboard server: the route handlers under app/api are
  // hosted-only, and `force-dynamic` is illegal under `output: export`. Hiding
  // them from the page scan is what keeps the static export buildable.
  pageExtensions: hosted ? ['hosted.ts', 'hosted.tsx', 'ts', 'tsx'] : ['ts', 'tsx'],
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
