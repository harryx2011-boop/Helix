import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopCredentials, isDesktop, isDesktopKey } from './desktop';
import { getApiKey } from './auth';
import { getAdminToken } from './instance-settings';

function fakeWindow(helixDesktop?: unknown): void {
  const store = new Map<string, string>([
    ['helix.apiKey', 'helix-stored'],
    ['helix.adminToken', 'admin-stored'],
  ]);
  vi.stubGlobal('window', {
    helixDesktop,
    localStorage: { getItem: (k: string) => store.get(k) ?? null },
  });
}

const BRIDGE = { apiKey: 'helix-desktop', adminToken: 'admin-desktop', version: '1.25.0', platform: 'win32' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop bridge', () => {
  it('is absent during static render, where there is no window', () => {
    expect(isDesktop()).toBe(false);
    expect(desktopCredentials()).toBeNull();
  });

  it('is absent in a plain browser', () => {
    fakeWindow();
    expect(isDesktop()).toBe(false);
    expect(desktopCredentials()).toBeNull();
    expect(getApiKey()).toBe('helix-stored');
    expect(getAdminToken()).toBe('admin-stored');
  });

  it('hands over the key and admin token inside the desktop app, ahead of anything stored', () => {
    fakeWindow(BRIDGE);
    expect(isDesktop()).toBe(true);
    expect(desktopCredentials()).toEqual({ apiKey: 'helix-desktop', adminToken: 'admin-desktop' });
    expect(getApiKey()).toBe('helix-desktop');
    expect(getAdminToken()).toBe('admin-desktop');
  });

  it('recognises the key the desktop app runs on by its listed prefix, and only inside the app', () => {
    expect(isDesktopKey('helix-desk')).toBe(false);
    fakeWindow({ ...BRIDGE, apiKey: 'helix-deskTopKey0000000' });
    expect(isDesktopKey('helix-desk')).toBe(true);
    expect(isDesktopKey('helix-abcd')).toBe(false);
    expect(isDesktopKey('')).toBe(false);
  });

  it('falls back to storage for a credential the bridge left empty', () => {
    fakeWindow({ ...BRIDGE, apiKey: '', adminToken: 42 });
    expect(desktopCredentials()).toEqual({ apiKey: null, adminToken: null });
    expect(getApiKey()).toBe('helix-stored');
    expect(getAdminToken()).toBe('admin-stored');
  });
});
