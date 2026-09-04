import { cpus } from 'node:os';

/** Wall clock per job; a wedged encode must not hold a queue slot forever. */
export const JOB_TIMEOUT_MS = Number(process.env.CONVERT_TIMEOUT_MS ?? 30 * 60 * 1000);

/**
 * A crafted file can expand enormously, so the writer is watched and killed
 * once it passes this ceiling rather than filling the disk.
 */
export const MAX_OUTPUT_BYTES = Number(
  process.env.CONVERT_MAX_OUTPUT_BYTES ?? 6 * 1024 * 1024 * 1024,
);

/**
 * ffmpeg takes every core it is offered, which starves the other queue slots.
 */
export const MAX_THREADS = Number(
  process.env.CONVERT_MAX_THREADS ?? Math.max(2, Math.floor(cpus().length / 2)),
);
