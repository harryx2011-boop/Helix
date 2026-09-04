import { describe, expect, it } from 'vitest';
import { SETTINGS, isEditable, settingDef } from './registry.js';

describe('settings registry — crawl policy knobs', () => {
  it('exposes the adaptive concurrency floor and ceiling as a pair', () => {
    // A ceiling without a floor lets an operator bound the damage but not the
    // slowness; the adaptive loop needs both ends declared to be clamped.
    expect(isEditable('maxHostConcurrency')).toBe(true);
    expect(isEditable('minHostConcurrency')).toBe(true);
  });

  it('exposes the session pool size and its block tolerance', () => {
    expect(isEditable('crawlSessionPoolSize')).toBe(true);
    expect(isEditable('crawlSessionMaxBlocks')).toBe(true);
  });

  it('refuses a floor of zero, which would stall a host permanently', () => {
    const def = settingDef('minHostConcurrency');
    expect(def?.schema.safeParse(0).success).toBe(false);
    expect(def?.schema.safeParse(1).success).toBe(true);
  });

  it('bounds the session pool so a crawl cannot open unlimited identities', () => {
    const def = settingDef('crawlSessionPoolSize');
    expect(def?.schema.safeParse(64).success).toBe(true);
    expect(def?.schema.safeParse(65).success).toBe(false);
  });

  it('keeps every new knob a restart setting, not a live one', () => {
    // These are read when a crawl worker is constructed. Advertising them as
    // live would tell an operator a running crawl had picked up a change it
    // never saw.
    for (const key of ['minHostConcurrency', 'crawlSessionPoolSize', 'crawlSessionMaxBlocks']) {
      expect(settingDef(key)?.effect).toBe('restart');
    }
  });

  it('refuses to write a key that is not in the registry', () => {
    // The registry is an allowlist: the database URL and the admin token have
    // no business being reachable from an HTTP surface.
    expect(isEditable('databaseUrl')).toBe(false);
    expect(isEditable('crawlSessionProxyUrl')).toBe(false);
  });

  it('gives every guarded setting a warning', () => {
    for (const setting of SETTINGS) {
      if (setting.effect === 'guarded') expect(setting.warning).toBeTruthy();
    }
  });
});
