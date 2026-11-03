#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiMigrations = resolve(here, '..', 'apps', 'api', 'migrations');
const hostedMigrations = join(here, 'migrations');
const schemaPath = join(here, 'schema.sql');

const sqlFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sourcesLine = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .find((l) => l.startsWith('-- Sources:'));

const expected = [...sqlFiles(apiMigrations), ...sqlFiles(hostedMigrations)];

const header = sourcesLine(schemaPath);
if (!header) {
  console.error('schema.sql has no "-- Sources:" line. Run: node supabase/build-schema.mjs');
  process.exit(1);
}

const listed = header
  .replace('-- Sources:', '')
  .split('|')
  .flatMap((part) => part.split(','))
  .map((s) => s.trim())
  .filter(Boolean);

const missing = expected.filter((f) => !listed.includes(f));
const extra = listed.filter((f) => !expected.includes(f));

if (missing.length || extra.length) {
  if (missing.length) console.error(`schema.sql is missing: ${missing.join(', ')}`);
  if (extra.length) console.error(`schema.sql lists files that no longer exist: ${extra.join(', ')}`);
  console.error('Run: node supabase/build-schema.mjs');
  process.exit(1);
}

const idem = join(here, 'schema-idempotent.sql');
if (!existsSync(idem)) {
  console.error('schema-idempotent.sql is missing. Run: node supabase/build-schema-idempotent.mjs');
  process.exit(1);
}
if (sourcesLine(idem) !== header) {
  console.error('schema-idempotent.sql is out of date. Run: node supabase/build-schema-idempotent.mjs');
  process.exit(1);
}

console.log(`schema.sql and schema-idempotent.sql are current (${expected.length} migrations).`);
