#!/usr/bin/env node
/**
 * Fails when supabase/schema.sql is older than the migrations it claims to contain.
 *
 * schema.sql is the fresh-project bootstrap, so drift is invisible until someone
 * provisions a new project and silently inherits whatever the missing migrations
 * would have done. That happened: 0006 revokes table-level grants on `profiles`,
 * and while schema.sql lagged, a new project would have exposed the encrypted
 * dashboard key columns to any signed-in user over PostgREST.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiMigrations = resolve(here, '..', 'apps', 'api', 'migrations');
const hostedMigrations = join(here, 'migrations');
const schemaPath = join(here, 'schema.sql');

const sqlFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const expected = [...sqlFiles(apiMigrations), ...sqlFiles(hostedMigrations)];

const header = readFileSync(schemaPath, 'utf8').split('\n').find((l) => l.startsWith('-- Sources:'));
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

console.log(`schema.sql is current (${expected.length} migrations).`);
