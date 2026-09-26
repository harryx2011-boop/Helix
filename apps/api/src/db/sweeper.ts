import type { Log } from '../core/logger.js';
import { getPool } from './pool.js';

/**
 * Deletes results older than the result TTL (`HELIX_RESULT_TTL_HOURS`), judged
 * by each row's own timestamp: `jobs.created_at`, `documents.fetched_at`. The
 * `expires_at` column is not read: nothing sets it, and its 7-day default
 * would ignore the configured TTL.
 *
 * Documents go first so standalone scrapes (no job) are covered; deleting a
 * job then cascades to its tasks, failures, deliveries and remaining documents.
 * A job a worker still holds on a live lease is spared, and so are its
 * documents, so a long crawl is never pulled out from under the worker.
 */

export interface SweepOptions {
  ttlHours: number;
  /** PGlite has no autovacuum, so space freed by a delete is never reused unless this runs. */
  vacuum?: boolean;
  batchSize?: number;
  now?: Date;
}

export interface SweepResult {
  jobs: number;
  documents: number;
  vacuumed: boolean;
}

const HELD_JOBS = `SELECT id FROM jobs WHERE status = 'running' AND lease_expires_at >= $1`;

const DELETE_DOCUMENTS = `
  DELETE FROM documents WHERE id IN (
    SELECT id FROM documents
     WHERE fetched_at < $2
       AND (job_id IS NULL OR job_id NOT IN (${HELD_JOBS}))
     LIMIT $3)`;

const DELETE_JOBS = `
  DELETE FROM jobs WHERE id IN (
    SELECT id FROM jobs
     WHERE created_at < $2
       AND NOT (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at >= $1)
     LIMIT $3)`;

// Every table a sweep shrinks, directly or through the jobs cascade, plus the
// ones other retention jobs prune.
const VACUUM = `VACUUM documents, jobs, job_tasks, fetch_failures, webhook_deliveries,
  uptime_samples, request_usage, monitor_snapshots, monitor_checks`;

// Bounded batches keep each statement's locks short on a shared Postgres.
async function deleteInBatches(text: string, now: Date, cutoff: Date, batchSize: number): Promise<number> {
  let total = 0;
  for (;;) {
    const { rowCount } = await getPool().query(text, [now, cutoff, batchSize]);
    const deleted = rowCount ?? 0;
    total += deleted;
    if (deleted === 0) return total;
  }
}

export async function sweepExpired(options: SweepOptions): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - options.ttlHours * 60 * 60 * 1000);
  const batchSize = options.batchSize ?? 5000;

  const documents = await deleteInBatches(DELETE_DOCUMENTS, now, cutoff, batchSize);
  const jobs = await deleteInBatches(DELETE_JOBS, now, cutoff, batchSize);

  const vacuumed = Boolean(options.vacuum) && jobs + documents > 0;
  if (vacuumed) await getPool().query(VACUUM);
  return { jobs, documents, vacuumed };
}

export function startSweeper(options: {
  ttlHours: number;
  vacuum?: boolean;
  logger?: Log;
  intervalMs?: number;
  firstDelayMs?: number;
}): () => void {
  const sweep = (): void => {
    void sweepExpired({ ttlHours: options.ttlHours, vacuum: options.vacuum ?? false }).then(
      (result) => {
        if (result.jobs > 0 || result.documents > 0) options.logger?.info(result, 'expired results swept');
      },
      (error: unknown) => options.logger?.warn({ error }, 'expired results sweep failed'),
    );
  };
  // A desktop app that is opened for minutes at a time might never reach the first hourly tick.
  const first = setTimeout(sweep, options.firstDelayMs ?? 60_000);
  first.unref();
  const timer = setInterval(sweep, options.intervalMs ?? 60 * 60 * 1000);
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
