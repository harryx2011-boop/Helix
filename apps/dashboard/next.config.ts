import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { NextConfig } from 'next';
import { securityHeaders } from './security-headers';

const currentDir = dirname(fileURLToPath(import.meta.url));
const hosted = process.env.HELIX_HOSTED === '1';
const website = hosted && (process.env.VERCEL === '1' || process.env.HELIX_TARGET === 'web');
const APP_ROUTES = ['/app/:path*', '/sign-in/:path*', '/sign-up/:path*', '/onboarding/:path*', '/checks/:path*'];

const nextConfig: NextConfig = {
  ...(hosted ? {} : { output: 'export' as const }),
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  pageExtensions: ['tsx', 'ts'],
  typescript: { ignoreBuildErrors: process.env.HELIX_PRETYPECHECKED === '1' },
  images: hosted ? {} : { unoptimized: true },
  outputFileTracingRoot: resolve(currentDir, '..', '..'),
  env: { NEXT_PUBLIC_HELIX_HOSTED: hosted ? '1' : '0', NEXT_PUBLIC_HELIX_WEBSITE: website ? '1' : '0' },
  ...(hosted ? { headers: async () => [{ source: '/:path*', headers: securityHeaders }] } : {}),
  ...(website
    ? { redirects: async () => APP_ROUTES.map((source) => ({ source, destination: '/download', permanent: false })) }
    : {}),
  ...(hosted
    ? {}
    : {
        webpack: (webpackConfig: { cache?: unknown }, { dev }: { dev: boolean }) => {
          if (dev) {
            webpackConfig.cache = false;
          }
          return webpackConfig;
        },
      }),
};

export default nextConfig;
