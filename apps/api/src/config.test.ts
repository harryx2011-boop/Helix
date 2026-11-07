import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';


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

describe('searxngUrl', () => {
  it('reads SEARXNG_URL, so the settings row and the env var set one value', () => {
    expect(loadConfig({ ...base, SEARXNG_URL: 'http://searx.local:8888' }).searxngUrl).toBe(
      'http://searx.local:8888',
    );
  });

  it('is unset when the variable is empty', () => {
    expect(loadConfig({ ...base, SEARXNG_URL: '' }).searxngUrl).toBeUndefined();
  });
});

describe('serviceToken', () => {
  it('reads HELIX_SERVICE_TOKEN', () => {
    expect(loadConfig({ ...base, HELIX_SERVICE_TOKEN: 'svc' }).serviceToken).toBe('svc');
  });

  it('is unset when the variable is empty', () => {
    expect(loadConfig({ ...base, HELIX_SERVICE_TOKEN: '' }).serviceToken).toBeUndefined();
  });
});
