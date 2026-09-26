import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

/**
 * The driver default decides whether an operator with nothing configured gets
 * a working instance. Unset HELIX_DB follows DATABASE_URL: present means the
 * existing Postgres keeps serving, absent means the in-process engine.
 */

const base = { DATABASE_URL: 'postgres://localhost/helix' } as NodeJS.ProcessEnv;

describe('db', () => {
  it('keeps pg when DATABASE_URL is set, so an upgrade changes nothing', () => {
    expect(loadConfig({ ...base }).db).toBe('pg');
  });

  it('falls back to pglite when nothing is configured', () => {
    const config = loadConfig({});
    expect(config.db).toBe('pglite');
    expect(config.databaseUrl).toBeUndefined();
  });

  it('honours an explicit HELIX_DB over the DATABASE_URL default', () => {
    expect(loadConfig({ ...base, HELIX_DB: 'pglite' }).db).toBe('pglite');
  });

  it('refuses pg without a DATABASE_URL rather than failing at the first query', () => {
    expect(() => loadConfig({ HELIX_DB: 'pg' })).toThrow(/DATABASE_URL/);
  });

  it('rejects an unknown driver', () => {
    expect(() => loadConfig({ HELIX_DB: 'sqlite' })).toThrow();
  });

  it('puts the data folder under the working directory unless HELIX_DATA_DIR says otherwise', () => {
    expect(loadConfig({}).dataDir).toBe(join(process.cwd(), 'data'));
    expect(loadConfig({ HELIX_DATA_DIR: 'D:/helix-data' }).dataDir).toBe('D:/helix-data');
  });
});

/**
 * `int()` backs every numeric setting, including pool sizes that a caller can
 * hang the whole instance with if a bad value is silently coerced to
 * something small. `Number.parseInt` stops at the first non-digit character
 * instead of rejecting the value, so "1e3" becomes 1, "0x10" becomes 0 and
 * "12abc" becomes 12 -- each one a config typo that should fail loudly.
 */
describe('int()', () => {
  it('rejects a value parseInt would silently truncate', () => {
    expect(() => loadConfig({ ...base, HELIX_PORT: '1e3' })).toThrow();
    expect(() => loadConfig({ ...base, HELIX_PORT: '0x10' })).toThrow();
    expect(() => loadConfig({ ...base, HELIX_PORT: '12abc' })).toThrow();
  });

  it('rejects a negative value for a limit that must be non-negative', () => {
    expect(() => loadConfig({ ...base, HELIX_BROWSER_POOL_SIZE: '-1' })).toThrow();
  });

  it('rejects a browser pool size of 0, which would launch nothing and hang every lease', () => {
    expect(() => loadConfig({ ...base, HELIX_BROWSER_POOL_SIZE: '0' })).toThrow();
  });

  it('rejects a browser max contexts of 0 for the same reason', () => {
    expect(() => loadConfig({ ...base, HELIX_BROWSER_MAX_CONTEXTS: '0' })).toThrow();
  });

  it('rejects surrounding whitespace rather than silently trimming it', () => {
    expect(() => loadConfig({ ...base, HELIX_PORT: ' 7 ' })).toThrow();
  });

  it('falls back to the default when unset', () => {
    expect(loadConfig({ ...base, HELIX_PORT: undefined }).port).toBe(7400);
  });

  it('falls back to the default when empty', () => {
    expect(loadConfig({ ...base, HELIX_PORT: '' }).port).toBe(7400);
  });
});
