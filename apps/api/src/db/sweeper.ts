import type { Log } from '../core/logger.js';
import { getPool } from './pool.js';

/**
 * Deletes results past `expires_at`. Both `jobs` and `documents` carry the
 * column (001_init.sql), and until this nothing read it, so a desktop data
 * folder grew with every scrape.
 *
 * Documents go first so standalone scrapes (no job) are covered; deleting a
 * job then cascades to its tasks, failures, deliveries and remaining documents.
 * A job a worker still holds on a live lease is spared, so a long crawl is
 * never pulled out from under the worker writing it.
 */

export interface SweepResult {
  jobs: number;
  documents: number;
}

export async function sweepExpired(now: Date = new Date()): Promise<SweepResult> {
  const pool = getPool();
  const documents = await pool.query('DELETE FROM documents WHERE expires_at < $1', [now]);
  const jobs = await pool.query(
    `DELETE FROM jobs
      WHERE expires_at < $1
        AND NOT (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at >= $1)`,
    [now],
  );
  return { jobs: jobs.rowCount ?? 0, documents: documents.rowCount ?? 0 };
}

export function startSweeper(options: { logger?: Log; intervalMs?: number } = {}): () => void {
  const sweep = (): void => {
    void sweepExpired().then(
      (result) => {
        if (result.jobs > 0 || result.documents > 0) options.logger?.info(result, 'expired results swept');
      },
      (error: unknown) => options.logger?.warn({ error }, 'expired results sweep failed'),
    );
  };
  const timer = setInterval(sweep, options.intervalMs ?? 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
