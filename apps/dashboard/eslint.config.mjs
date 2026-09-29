import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  ...compat.extends('next/core-web-vitals'),
  { ignores: ['.next/**', '.next-*/**', 'out/**', 'node_modules/**', 'lib/voice-core/**'] },
];

export default config;
