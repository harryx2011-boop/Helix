import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fingerprintScript, getProfile, loadProfiles, resetProfileCache, type BrowserProfile } from './profiles.js';

/**
 * The JS layer is what a page can read about the machine it thinks it is on.
 * These tests hold two lines: a definition the loader cannot parse is skipped
 * rather than crashing a render, and the generated script is deterministic —
 * a value that varies between two reads is the tell the whole subsystem exists
 * to avoid.
 */

function profileFixture(overrides: Partial<BrowserProfile> = {}): BrowserProfile {
  return {
    id: 'chrome-test',
    browser: 'chrome',
    version: '137',
    platform: 'macos',
    capturedAt: null,
    verified: false,
    js: {
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, Apple M1 Pro)',
      hardwareConcurrency: 10,
      deviceMemory: 8,
      timezone: 'Europe/London',
      screen: { width: 1728, height: 1117, colorDepth: 30 },
    },
    ...overrides,
  };
}

function writeDefinitions(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'helix-profiles-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

afterEach(() => {
  resetProfileCache();
});

describe('loadProfiles', () => {
  it('loads every readable definition by id', () => {
    const dir = writeDefinitions({
      'a.json': JSON.stringify(profileFixture({ id: 'chrome-a' })),
      'b.json': JSON.stringify(profileFixture({ id: 'chrome-b' })),
    });

    const loaded = loadProfiles(undefined, dir);

    expect([...loaded.keys()].sort()).toEqual(['chrome-a', 'chrome-b']);
  });

  it('skips a definition it cannot parse instead of failing the load', () => {
    const dir = writeDefinitions({
      'good.json': JSON.stringify(profileFixture({ id: 'chrome-good' })),
      'broken.json': '{ not json',
    });

    const loaded = loadProfiles(undefined, dir);

    expect([...loaded.keys()]).toEqual(['chrome-good']);
  });

  it('skips a definition with no js layer', () => {
    const dir = writeDefinitions({ 'x.json': JSON.stringify({ id: 'chrome-x' }) });

    expect(loadProfiles(undefined, dir).size).toBe(0);
  });

  it('returns an empty map when no definitions directory exists', () => {
    expect(loadProfiles(undefined, join(tmpdir(), 'helix-does-not-exist-9f8e')).size).toBe(0);
  });
});

describe('getProfile', () => {
  it('is undefined for a name nothing defines, so a render proceeds unmasked', () => {
    const dir = writeDefinitions({ 'a.json': JSON.stringify(profileFixture({ id: 'chrome-a' })) });
    loadProfiles(undefined, dir);

    expect(getProfile('nope')).toBeUndefined();
    expect(getProfile(undefined)).toBeUndefined();
  });
});

describe('unverified profiles', () => {
  it('is applied, but says so every time', () => {
    const dir = writeDefinitions({ 'a.json': JSON.stringify(profileFixture({ id: 'chrome-guess' })) });
    loadProfiles(undefined, dir);
    const warn = vi.fn();

    const profile = getProfile('chrome-guess', { warn } as never);

    // Applied: a guessed identity still beats leaking the host's real one.
    expect(profile?.id).toBe('chrome-guess');
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls[0])).toContain('never captured');
  });

  it('says nothing for a recorded one', () => {
    const dir = writeDefinitions({
      'a.json': JSON.stringify(profileFixture({ id: 'chrome-real', verified: true, capturedAt: '2026-08-26T00:00:00Z' })),
    });
    loadProfiles(undefined, dir);
    const warn = vi.fn();

    expect(getProfile('chrome-real', { warn } as never)?.verified).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('fingerprintScript', () => {
  it('carries the values a fingerprinter actually reads', () => {
    const script = fingerprintScript(profileFixture());

    expect(script).toContain('Google Inc. (Apple)');
    expect(script).toContain('37445'); // UNMASKED_VENDOR_WEBGL
    expect(script).toContain('37446'); // UNMASKED_RENDERER_WEBGL
    expect(script).toContain('hardwareConcurrency');
    expect(script).toContain('deviceMemory');
  });

  it('is stable for one identity across calls', () => {
    const profile = profileFixture();

    expect(fingerprintScript(profile)).toBe(fingerprintScript(profile));
  });

  it('differs between identities, so two profiles are not one fingerprint', () => {
    const a = fingerprintScript(profileFixture({ id: 'chrome-a' }));
    const b = fingerprintScript(profileFixture({ id: 'chrome-b' }));

    expect(a).not.toBe(b);
  });

  it('omits an override the definition does not carry', () => {
    const script = fingerprintScript(profileFixture({ js: { webglVendor: 'Only Vendor' } }));

    expect(script).toContain('Only Vendor');
    expect(script).toContain('"hardwareConcurrency":null');
    expect(script).toContain('"screen":null');
  });

  it('is syntactically valid JavaScript', () => {
    // A script that throws on parse would break every render that used the
    // profile, and addInitScript reports it far from here.
    expect(() => new Function(fingerprintScript(profileFixture()))).not.toThrow();
  });
});
