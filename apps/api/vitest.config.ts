import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        // PGlite compiles its 10 MB pglite.wasm in every test process. With the
        // default optimising tier, V8 holds the compile in a Zone that can reach
        // hundreds of MB per process; the run starts one process per core, so
        // when the machine is short on commit memory one of them dies with
        // "Fatal process out of memory: Zone" and the pool reports "Worker
        // exited unexpectedly". Baseline-only compilation (Liftoff) skips that
        // tier, and the suite finishes faster, not slower.
        execArgv: ['--liftoff-only'],
      },
    },
  },
});
