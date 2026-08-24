import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { NextConfig } from 'next';

const currentDir = dirname(fileURLToPath(import.meta.url));
const hosted = process.env.HELIX_HOSTED === '1';

// Self-host: static export served by the Fastify API at `/` (FRONTEND.md §3).
// Hosted: server output, because Clerk middleware and the route handlers need it (WEBSITE.md §1).
const nextConfig: NextConfig = {
  ...(hosted ? {} : { output: 'export' as const }),
  images: { unoptimized: true },
  outputFileTracingRoot: currentDir,
  env: { NEXT_PUBLIC_HELIX_HOSTED: hosted ? '1' : '0' },
};

export default nextConfig;
