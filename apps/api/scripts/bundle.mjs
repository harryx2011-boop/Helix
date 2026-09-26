// Bundles apps/api into one ESM file that Electron's own Node runs without tsx
// (DESKTOP-PLAN.md Phase 4). Writes dist/helix-api.js plus two manifests the
// desktop stage script reads: externals.json (packages to install beside the
// bundle) and runtime-files.json (files the API reads from disk at runtime).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(apiDir, 'dist');
const pkg = JSON.parse(readFileSync(join(apiDir, 'package.json'), 'utf8'));

// Installed beside the bundle, never inlined: each ships a WASM or native
// payload, or loads its own files by path at runtime.
//   playwright, playwright-core: browser registry, driver scripts, native launchers.
//   @electric-sql/pglite(-pgvector): postgres.wasm, the data bundle and extension tarballs.
//   pino: fastify's logger; its transports spawn thread-stream workers by file path.
const EXTERNALS = ['playwright', 'playwright-core', '@electric-sql/pglite', '@electric-sql/pglite-pgvector', 'pino'];

// Optional peers that are required lazily and never installed: pg's native
// binding and ws's C accelerators. Left as runtime requires that fail softly.
const OPTIONAL = ['pg-native', 'bufferutil', 'utf-8-validate'];

// Paths the API resolves from its own location. `stagedAt` is relative to the
// staged api folder, whose layout mirrors apps/api with dist/helix-api.js as
// the entry.
const RUNTIME_FILES = [
  {
    source: 'apps/api/migrations',
    stagedAt: 'migrations',
    readBy: 'src/index.ts: join(dirname(entry), "..", "migrations")',
  },
  {
    source: 'openapi.yaml',
    stagedAt: 'openapi.yaml',
    readBy: 'src/mcp/spec.ts: walks upward from the entry for openapi.yaml (HELIX_OPENAPI_PATH overrides)',
  },
  {
    source: 'packages/profiles/definitions',
    stagedAt: 'packages/profiles/definitions',
    readBy: 'src/browser/profiles.ts: walks upward from the entry for packages/profiles/definitions',
  },
  {
    source: 'apps/api/package.json',
    stagedAt: 'package.json',
    readBy: 'Node: "type": "module" marks dist/helix-api.js as ESM; the version is inlined, not read',
  },
];

const result = await build({
  entryPoints: [join(apiDir, 'src', 'index.ts')],
  outfile: join(distDir, 'helix-api.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  external: [...EXTERNALS, ...OPTIONAL],
  define: { HELIX_API_VERSION: JSON.stringify(pkg.version) },
  // Bundled CommonJS calls require() for the externals and node builtins; an
  // ESM file has no require of its own, so give it one.
  banner: {
    js: [
      "import { createRequire as __helixCreateRequire } from 'node:module';",
      'const require = __helixCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  metafile: true,
  logLevel: 'warning',
});

const imported = new Set();
for (const output of Object.values(result.metafile.outputs)) {
  for (const entry of output.imports) {
    if (!entry.external || entry.path.startsWith('node:') || builtinModules.includes(entry.path)) continue;
    const parts = entry.path.split('/');
    imported.add(entry.path.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
  }
}
const unexpected = [...imported].filter((name) => !EXTERNALS.includes(name) && !OPTIONAL.includes(name));
if (unexpected.length > 0) {
  console.error(`bundle: unexpected external imports: ${unexpected.join(', ')}`);
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'externals.json'), `${JSON.stringify(EXTERNALS, null, 2)}\n`);
writeFileSync(join(distDir, 'runtime-files.json'), `${JSON.stringify(RUNTIME_FILES, null, 2)}\n`);

const bytes = result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].bytes;
console.log(`bundle: dist/helix-api.js ${(bytes / 1024 / 1024).toFixed(1)} MB, externals ${EXTERNALS.join(', ')}`);
