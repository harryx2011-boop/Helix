import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

/**
 * The multi-tenant flag decides whether the tenant boundary is enforced at all,
 * so its default and its parsing are the load-bearing part. A self-host
 * operator upgrading must not have to set anything to keep the flat model.
 */

const base = { DATABASE_URL: 'postgres://localhost/helix' } as NodeJS.ProcessEnv;

describe('multiTenant', () => {
  it('is off when the variable is unset, so an upgrade changes nothing for self-host', () => {
    expect(loadConfig({ ...base }).multiTenant).toBe(false);
  });

  it('is on for 1', () => {
    expect(loadConfig({ ...base, HELIX_MULTI_TENANT: '1' }).multiTenant).toBe(true);
  });

  it('is on for true', () => {
    expect(loadConfig({ ...base, HELIX_MULTI_TENANT: 'true' }).multiTenant).toBe(true);
  });

  it('is off for anything else, rather than treating a typo as enabled', () => {
    expect(loadConfig({ ...base, HELIX_MULTI_TENANT: 'yes' }).multiTenant).toBe(false);
    expect(loadConfig({ ...base, HELIX_MULTI_TENANT: '' }).multiTenant).toBe(false);
    expect(loadConfig({ ...base, HELIX_MULTI_TENANT: 'false' }).multiTenant).toBe(false);
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
