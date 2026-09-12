#!/usr/bin/env node
// Bundles lib/engine/workers/*.worker.ts into standalone ESM files under
// public/workers/. These run entirely outside Next's own webpack/RSC
// pipeline: worker-loader and webpack 5's native `new Worker(new URL(...))`
// support both broke Next's client-reference-manifest plugin when the worker
// pulled in libheif-js and jsquash's lazy wasm loaders (see git history for
// the failure modes). A plain esbuild pass, run before dev/build, sidesteps
// the conflict entirely — the app loads the result via a runtime string path.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const engineDir = join(here, '..', 'lib', 'converter', 'engine');
const workersDir = join(engineDir, 'workers');
const outDir = join(here, '..', 'public', 'workers');
const nodeModules = join(here, '..', '..', '..', 'node_modules');
const ffmpegWorkerSrc = join(nodeModules, '@ffmpeg', 'ffmpeg', 'dist', 'esm', 'worker.js');

const entries = readdirSync(workersDir).filter((f) => f.endsWith('.worker.ts'));

function findWasmFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (entry === '.bin') continue;
      findWasmFiles(full, out);
    } else if (entry.endsWith('.wasm')) {
      out.push(full);
    }
  }
  return out;
}

const wasmSources = ['@jsquash', 'libheif-js'].flatMap((pkg) => {
  const pkgDir = join(nodeModules, pkg);
  try {
    statSync(pkgDir);
  } catch {
    return [];
  }
  return findWasmFiles(pkgDir);
});

// Every output this script produces is either an esbuild bundle or a copy of
// a wasm source. A copy keeps the source's own mtime (Windows copyFileSync
// does not stamp "now"), so an output is stale only when it is strictly
// older than the input that produces it — never when the two are equal.
function isStale(outputPath, inputMtime) {
  try {
    return statSync(outputPath).mtimeMs < inputMtime;
  } catch {
    return true;
  }
}

if (!process.env.FORCE_WORKERS && !process.argv.includes('--force')) {
  const scriptMtime = statSync(fileURLToPath(import.meta.url)).mtimeMs;
  const sharedInputMtime = Math.max(
    scriptMtime,
    ...readdirSync(engineDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => statSync(join(engineDir, f)).mtimeMs),
  );

  const stale =
    entries.some((f) =>
      isStale(
        join(outDir, f.replace(/\.ts$/, '.js')),
        Math.max(sharedInputMtime, statSync(join(workersDir, f)).mtimeMs),
      ),
    ) ||
    isStale(join(outDir, 'worker.js'), Math.max(scriptMtime, statSync(ffmpegWorkerSrc).mtimeMs)) ||
    // The wasm copy itself never advances past its source's own mtime, so an
    // edit to this script cannot make a copy "stale" the way it does a
    // bundle — only a newer wasm source can.
    wasmSources.some((p) => isStale(join(outDir, basename(p)), statSync(p).mtimeMs));

  if (!stale) {
    console.log('workers up to date');
    process.exit(0);
  }
}

await build({
  entryPoints: entries.map((f) => join(workersDir, f)),
  outdir: outDir,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: process.env.NODE_ENV !== 'production',
  logLevel: 'info',
});

// @ffmpeg/ffmpeg spawns its own nested worker (classWorkerURL, default
// `./worker.js` relative to its own module) once FFmpeg.load() runs. That
// file needs to land at the same served path our worker resolves it from
// — a separate build() call with its own outdir, so esbuild doesn't infer a
// shared outbase across two unrelated source trees and preserve their full
// relative paths instead of flattening — or load() hangs forever waiting on
// a worker that never started.
await build({
  entryPoints: [ffmpegWorkerSrc],
  outfile: join(outDir, 'worker.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: process.env.NODE_ENV !== 'production',
  logLevel: 'info',
});

// The jsquash and libheif-js Emscripten modules fetch their .wasm binary at
// runtime relative to the worker script's own URL (`locateFile`), so esbuild
// never sees the reference — the files have to be copied alongside the
// bundled JS by hand, flattened to the bare names those modules expect.
mkdirSync(outDir, { recursive: true });
let copied = 0;
for (const wasmPath of wasmSources) {
  const dest = join(outDir, basename(wasmPath));
  copyFileSync(wasmPath, dest);
  copied++;
}

console.log(`Built ${entries.length} worker(s) into ${outDir}, copied ${copied} wasm binaries`);
