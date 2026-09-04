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
