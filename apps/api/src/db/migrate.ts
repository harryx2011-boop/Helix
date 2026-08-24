import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Log } from '../core/logger.js';
import { getPool } from './pool.js';

/**
 * Migrations.
 *
 * Applied in filename order inside a transaction, each recorded with a checksum.
 * An already-applied file whose contents changed is an error rather than a
 * silent re-run: editing shipped migrations is how environments drift apart
 * without anyone noticing.
 *
 * Compose also mounts `migrations/` into the Postgres init directory, so a fresh
 * volume is set up before the API starts. This runner handles every case after
 * that — upgrades, and any deployment not using compose.
 */

const TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    text PRIMARY KEY,
  checksum    text        NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
)`;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function migrate(dir: string, logger?: Log): Promise<MigrationResult> {
  const pool = getPool();
  await pool.query(TABLE);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ filename: string; checksum: string }>(
    'SELECT filename, checksum FROM schema_migrations',
  );
  const already = new Map(rows.map((r) => [r.filename, r.checksum]));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const filename of files) {
    const sql = await readFile(join(dir, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = already.get(filename);

    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${filename} has changed since it was applied. ` +
            `Applied migrations are immutable — add a new file instead.`,
        );
      }
      skipped.push(filename);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum],
      );
      await client.query('COMMIT');
      applied.push(filename);
      logger?.info({ filename }, 'migration applied');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(
        `Migration ${filename} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      client.release();
    }
  }

  return { applied, skipped };
}
