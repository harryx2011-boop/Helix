// Next's own type pass is ~90 s; the tsgo typecheck run just before this is seconds.
// The env var tells next.config.ts that check already ran. Set here, not in the
// npm script, so it works on Windows and POSIX without cross-env.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const { status } = spawnSync(process.execPath, [next, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, HELIX_PRETYPECHECKED: '1' },
});
process.exit(status ?? 1);