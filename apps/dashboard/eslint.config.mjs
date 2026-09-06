import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  ...compat.extends('next/core-web-vitals'),
  // public/workers/** is esbuild output from scripts/build-workers.mjs, not
  // source: linting a bundled wasm loader reports on its vendored code.
  { ignores: ['.next/**', '.next-*/**', 'out/**', 'node_modules/**', 'public/workers/**'] },
];

export default config;
