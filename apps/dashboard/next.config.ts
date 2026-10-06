import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { NextConfig } from 'next';

const currentDir = dirname(fileURLToPath(import.meta.url));
const hosted = process.env.HELIX_HOSTED === '1';
// The public website carries marketing and docs only; the app ships in the
// desktop download (DESKTOP-PLAN.md Phase 2). Vercel sets VERCEL=1 at build.
const website = hosted && (process.env.VERCEL === '1' || process.env.HELIX_TARGET === 'web');
const APP_ROUTES = ['/app/:path*', '/sign-in/:path*', '/sign-up/:path*', '/onboarding/:path*', '/checks/:path*'];

// Self-host: static export served by the Fastify API at `/` (FRONTEND.md §3).
// Hosted: the public website on Vercel, server output so the redirects below run.
const nextConfig: NextConfig = {
  ...(hosted ? {} : { output: 'export' as const }),
  // Two dev servers on one checkout fight over `.next` — the second dies on a
  // locked `.next/trace`. Setting this lets a second instance build elsewhere:
  //   NEXT_DIST_DIR=.next-alt pnpm exec next dev -p 3401
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Self-host once took `.tsx` only, to drop the hosted `route.ts` handlers.
  // With that set, `next build` could not resolve a single `(app)/app` page
  // (measured 2026-09-25), and Phase 2b deleted those handlers anyway.
  // Route handlers must NOT use a dotted extension like `route.hosted.ts`:
  // Vercel's builder derives the client-reference-manifest name by stripping
  // only the last extension and fails the build on the file it cannot find.
  pageExtensions: ['tsx', 'ts'],
  // `pnpm build` has already type-checked with tsgo (seconds, against Next's
  // ~90 s tsc pass), so Next skips its own; a bare `next build` still checks.
  typescript: { ignoreBuildErrors: process.env.npm_lifecycle_event === 'build' },
  // Self-host serves the static export with no image-optimization server, so
  // next/image must fall back to plain <img>. Hosted has a server and gets
  // real optimization; the two next/image call sites (setup-prompt agent
  // marks) are .png, not SVG, so hosted needs no per-image unoptimized prop.
  images: hosted ? {} : { unoptimized: true },
  outputFileTracingRoot: resolve(currentDir, '..', '..'),
  env: { NEXT_PUBLIC_HELIX_HOSTED: hosted ? '1' : '0', NEXT_PUBLIC_HELIX_WEBSITE: website ? '1' : '0' },
  ...(website
    ? { redirects: async () => APP_ROUTES.map((source) => ({ source, destination: '/download', permanent: false })) }
    : {}),
  ...(hosted
    ? {}
    : {
        webpack: (webpackConfig: { cache?: unknown }, { dev }: { dev: boolean }) => {
          // E:\ is a USB flash volume with confirmed exFAT filesystem corruption
          // (chkdsk: bad volume bitmap). Webpack's persistent disk cache snapshots
          // node_modules into .next/cache and intermittently fails to read it back
          // ("Unable to snapshot resolve dependencies"), which then cascades into
          // spurious "Can't resolve" errors for real files. Memory cache in dev
          // avoids touching the unreliable disk cache entirely.
          if (dev) {
            webpackConfig.cache = false;
          }
          return webpackConfig;
        },
      }),
};

export default nextConfig;
