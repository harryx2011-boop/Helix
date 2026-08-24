import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { NextConfig } from 'next';

const currentDir = dirname(fileURLToPath(import.meta.url));

// Static export: the Fastify API serves this build at `/`, API under `/v1`.
// One container, one port — see FRONTEND.md §3.
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // Without this, Next.js walks up to the pnpm-lock.yaml at the repo root and
  // misdetects the workspace root, which breaks file tracing on Windows.
  outputFileTracingRoot: currentDir,
};

export default nextConfig;
