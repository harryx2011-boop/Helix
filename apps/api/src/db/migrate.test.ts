import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 001_init.sql shipped with a pgvector block that was unreachable everywhere
 * it ran (pgvector was never present), so every deployed database recorded it
 * under the checksum of the broken text. The fix must not brick those
 * upgrades — case (c) below is that tolerance path, exercised once.
 */

const db = vi.hoisted(() => {
  const state = {
    rows: [] as { filename: string; checksum: string }[],
    statements: [] as string[],
    updates: [] as unknown[][],
  };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.statements.push(text.trim().split('\n')[0]!.trim());
    if (text.includes('SELECT filename, checksum FROM schema_migrations')) {
      return { rows: state.rows, rowCount: state.rows.length };
    }
    if (text.startsWith('UPDATE schema_migrations')) {
      state.updates.push(values);
      const [filename, checksum] = values as [string, string];
      const row = state.rows.find((r) => r.filename === filename);
      if (row) row.checksum = checksum;
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('INSERT INTO schema_migrations')) {
      const [filename, checksum] = values as [string, string];
      state.rows.push({ filename, checksum });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  return { state, query, client };
});

vi.mock('./pool.js', () => ({
  getPool: () => ({ query: db.query, connect: async () => db.client }),
}));

const { migrate } = await import('./migrate.js');

function writeMigrations(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'helix-migrate-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

function checksumOf(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

afterEach(() => {
  db.state.rows = [];
  db.state.statements = [];
  db.state.updates = [];
  vi.clearAllMocks();
});

describe('migrate', () => {
  it('skips an applied file whose checksum is unchanged', async () => {
    const sql = 'CREATE TABLE a (id int);\n';
    const dir = writeMigrations({ '001_a.sql': sql });
    db.state.rows = [{ filename: '001_a.sql', checksum: checksumOf(sql) }];

    const result = await migrate(dir);

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['001_a.sql']);
  });

  it('throws when an applied file changed to an unrecognised checksum', async () => {
    const dir = writeMigrations({ '001_a.sql': 'CREATE TABLE a (id int);\n' });
    db.state.rows = [{ filename: '001_a.sql', checksum: 'deadbeef'.repeat(8) }];

    await expect(migrate(dir)).rejects.toThrow(/immutable/);
  });

  it('tolerates 001_init.sql stored under its prior checksum and updates it', async () => {
    // The real pre-fix checksum baked into migrate.ts's PRIOR_CHECKSUMS map —
    // every database that ran the old, syntactically-broken 001_init.sql
    // recorded exactly this value.
    const priorChecksum = 'fe5eba1b27c750c815064ca92d54234b7469f4071e3f42a5d6890e3a75342041';
    const fixedSql = 'CREATE TABLE chunks (id uuid);\n';

    const dir = writeMigrations({ '001_init.sql': fixedSql });
    db.state.rows = [{ filename: '001_init.sql', checksum: priorChecksum }];

    const result = await migrate(dir);

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['001_init.sql']);
    expect(db.state.rows).toEqual([
      { filename: '001_init.sql', checksum: checksumOf(fixedSql) },
    ]);
    expect(db.state.updates).toEqual([['001_init.sql', checksumOf(fixedSql)]]);
  });

  it('applies a new file inside BEGIN/COMMIT', async () => {
    const sql = 'CREATE TABLE b (id int);\n';
    const dir = writeMigrations({ '002_b.sql': sql });

    const result = await migrate(dir);

    expect(result.applied).toEqual(['002_b.sql']);
    expect(result.skipped).toEqual([]);
    expect(db.state.statements).toContain('BEGIN');
    expect(db.state.statements).toContain('COMMIT');
    expect(db.state.rows).toEqual([{ filename: '002_b.sql', checksum: checksumOf(sql) }]);
  });
});
