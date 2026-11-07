// Next's own type pass is ~90 s; the tsgo typecheck run just before this is seconds.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const { status } = spawnSync(process.execPath, [next, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, HELIX_PRETYPECHECKED: '1' },
});
process.exit(status ?? 1);