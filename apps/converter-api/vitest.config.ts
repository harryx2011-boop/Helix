import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ffmpeg jobs run for real; the default 5s timeout fails on a cold cache.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Job dirs and ports are shared state — one file at a time.
    fileParallelism: false,
  },
});
