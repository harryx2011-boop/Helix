import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { NextConfig } from 'next';

const currentDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(currentDir, '..', '..'),
  images: { unoptimized: true },
};

export default nextConfig;
