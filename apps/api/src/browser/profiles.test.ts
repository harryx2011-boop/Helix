import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fingerprintScript,
  getProfile,
  loadProfiles,
  resetInstanceSecret,
  resetProfileCache,
  userAgentOverride,
  type BrowserIdentity,
  type BrowserProfile,
} from './profiles.js';


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
  resetInstanceSecret();
  delete process.env['HELIX_ENCRYPTION_KEY'];
  delete process.env['HELIX_BOOTSTRAP_KEY'];
});

function seedOf(script: string): string | undefined {
  return /"seed":(\d+)/.exec(script)?.[1];
}

function scriptWithSecret(secret: string, profile: BrowserProfile): string {
  process.env['HELIX_ENCRYPTION_KEY'] = secret;
  resetInstanceSecret();
  return fingerprintScript(profile);
}

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

describe('the canvas seed', () => {
  it('differs between two instances running the same public profile', () => {
    const profile = profileFixture();

    const a = scriptWithSecret('a'.repeat(64), profile);
    const b = scriptWithSecret('b'.repeat(64), profile);

    expect(seedOf(a)).toBeDefined();
    expect(seedOf(a)).not.toBe(seedOf(b));
  });

  it('is identical across calls on one instance, so the hash does not vary between reads', () => {
    const profile = profileFixture();

    const first = scriptWithSecret('c'.repeat(64), profile);
    const second = fingerprintScript(profile);

    expect(seedOf(first)).toBe(seedOf(second));
  });

  it('still separates two identities on the same instance', () => {
    process.env['HELIX_ENCRYPTION_KEY'] = 'd'.repeat(64);
    resetInstanceSecret();

    const a = fingerprintScript(profileFixture({ id: 'chrome-a' }));
    const b = fingerprintScript(profileFixture({ id: 'chrome-b' }));

    expect(seedOf(a)).not.toBe(seedOf(b));
  });

  it('falls back to random rather than to a guessable value', () => {
    const profile = profileFixture();
    resetInstanceSecret();
    const first = fingerprintScript(profile);
    resetInstanceSecret();
    const second = fingerprintScript(profile);

    expect(seedOf(first)).not.toBe(seedOf(second));
  });

  it('perturbs every profile, with no seed value that is a silent no-op', () => {
    for (const id of ['chrome-a', 'chrome-b', 'chrome-c', 'chrome-d']) {
      const script = scriptWithSecret('e'.repeat(64), profileFixture({ id }));
      expect(script).not.toContain('seed & 1');
      expect(Number(seedOf(script))).toBeGreaterThan(0);
    }
  });
});

describe('fingerprintScript', () => {
  it('carries the values a fingerprinter actually reads', () => {
    const script = fingerprintScript(profileFixture());

    expect(script).toContain('Google Inc. (Apple)');
    expect(script).toContain('37445');
    expect(script).toContain('37446');
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
    expect(() => new Function(fingerprintScript(profileFixture()))).not.toThrow();
  });

  it('builds a profile-free script for a default chromium render', () => {
    const script = fingerprintScript(undefined);
    expect(seedOf(script)).toBeUndefined();
    expect(() => new Function(script)).not.toThrow();
  });
});

const SHELL: BrowserIdentity = {
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.7922.34 Safari/537.36',
  brands: [
    { brand: 'Not=A?Brand', version: '99' },
    { brand: 'HeadlessChrome', version: '151' },
    { brand: 'Chromium', version: '151' },
  ],
  fullVersionList: [
    { brand: 'Not=A?Brand', version: '99.0.0.0' },
    { brand: 'HeadlessChrome', version: '151.0.7922.34' },
    { brand: 'Chromium', version: '151.0.7922.34' },
  ],
  platform: 'Windows',
  platformVersion: '19.0.0',
  architecture: 'x86',
  bitness: '64',
};

describe('userAgentOverride', () => {
  it('drops HeadlessChrome from the UA and the client hints of a default render', () => {
    const override = userAgentOverride(SHELL, undefined, false);

    expect(override.userAgent).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    );
    expect(JSON.stringify(override)).not.toContain('Headless');
    expect(override.userAgentMetadata.brands.map((b) => b.brand)).toEqual(['Not=A?Brand', 'Google Chrome', 'Chromium']);
    expect(override.acceptLanguage).toBeTruthy();
  });

  it('presents the profile UA, language and platform, with brand versions to match', () => {
    const override = userAgentOverride(
      SHELL,
      profileFixture({
        headers: {
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
          acceptLanguage: 'en-GB,en-US;q=0.9,en;q=0.8',
        },
      }),
      false,
    );

    expect(override.userAgent).toContain('Chrome/137.0.0.0');
    expect(override.acceptLanguage).toBe('en-GB,en-US,en');
    expect(override.userAgentMetadata.platform).toBe('macOS');
    expect(override.userAgentMetadata.brands).toContainEqual({ brand: 'Google Chrome', version: '137' });
    expect(override.userAgentMetadata.fullVersionList).toContainEqual({ brand: 'Chromium', version: '137.0.0.0' });
    expect(override.userAgentMetadata.brands).toContainEqual({ brand: 'Not=A?Brand', version: '99' });
  });
});
