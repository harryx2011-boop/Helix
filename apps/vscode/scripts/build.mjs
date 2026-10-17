import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  minify: true,
  logLevel: 'info',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
});
