import { describe, expect, it } from 'vitest';
import { formatBytes, pickInstaller } from './latest-release';

const asset = (name: string, size = 120_000_000) => ({
  name,
  size,
  browser_download_url: `https://github.com/harryx2011-boop/helix-releases/releases/download/v1.2.0/${name}`,
});

describe('pickInstaller', () => {
  it('returns the NSIS installer with the tag as its version', () => {
    const release = { tag_name: 'v1.2.0', assets: [asset('latest.yml', 400), asset('Helix-Setup-1.2.0.exe')] };
    expect(pickInstaller(release)).toEqual({
      version: '1.2.0',
      url: 'https://github.com/harryx2011-boop/helix-releases/releases/download/v1.2.0/Helix-Setup-1.2.0.exe',
      bytes: 120_000_000,
    });
  });

  it('ignores the blockmap and update manifest that ship beside the installer', () => {
    const release = { tag_name: 'v1.2.0', assets: [asset('Helix-Setup-1.2.0.exe.blockmap'), asset('latest.yml')] };
    expect(pickInstaller(release)).toBeNull();
  });

  it('refuses drafts and prereleases', () => {
    expect(pickInstaller({ tag_name: 'v1.2.0', draft: true, assets: [asset('Helix-Setup-1.2.0.exe')] })).toBeNull();
    expect(pickInstaller({ tag_name: 'v1.2.0', prerelease: true, assets: [asset('Helix-Setup-1.2.0.exe')] })).toBeNull();
  });

  it('returns null for a malformed release rather than throwing', () => {
    expect(pickInstaller({})).toBeNull();
    expect(pickInstaller({ tag_name: 'v1', assets: 'nope' })).toBeNull();
  });
});

describe('formatBytes', () => {
  it('rounds to whole megabytes', () => {
    expect(formatBytes(125_829_120)).toBe('120 MB');
  });
});
