import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { NextConfig } from 'next';

const currentDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(currentDir, '..', '..'),
  images: { unoptimized: true },
  // libheif-js's wasm bundle uses a require() pattern Next's flight-manifest
  // crawl cannot statically resolve, which corrupts the manifest for the
  // whole page even though the package is only ever reached from a client
  // component's Web Worker. Marking it external stops the server compiler
  // from touching it; the client bundle still resolves and runs it for real.
  serverExternalPackages: ['libheif-js'],
  // ffmpeg.wasm's multithreaded core needs SharedArrayBuffer, which browsers
  // only expose to a cross-origin-isolated page. Every response needs both
  // headers or isolation silently fails and the core falls back to the
  // single-threaded build. COEP additionally requires every subresource —
  // including same-origin worker chunks — to carry a CORP header.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
