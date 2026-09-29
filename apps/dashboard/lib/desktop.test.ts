import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopCredentials, desktopVoice, isDesktop, isDesktopKey } from './desktop';
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

describe('desktop voice bridge', () => {
  const voiceBridge = (connect: () => Promise<unknown>) => ({ ...BRIDGE, voice: { connect } });

  it('is absent in a browser and in a desktop build without dictation', () => {
    expect(desktopVoice()).toBeNull();
    fakeWindow();
    expect(desktopVoice()).toBeNull();
    fakeWindow(BRIDGE);
    expect(desktopVoice()).toBeNull();
  });

  it('passes on a loopback connection', async () => {
    const found = { baseUrl: 'http://127.0.0.1:9000', token: 'abc' };
    fakeWindow(voiceBridge(async () => found));
    await expect(desktopVoice()!.connect()).resolves.toEqual(found);
  });

  it.each([
    ['nothing', null],
    ['a string', 'http://127.0.0.1:9000'],
    ['a foreign host', { baseUrl: 'http://192.168.1.5:9000', token: 'abc' }],
    ['a localhost alias', { baseUrl: 'http://localhost:9000', token: 'abc' }],
    ['an empty token', { baseUrl: 'http://127.0.0.1:9000', token: '' }],
    ['a broken url', { baseUrl: 'not a url', token: 'abc' }],
  ])('turns %s into null', async (_label, reply) => {
    fakeWindow(voiceBridge(async () => reply));
    await expect(desktopVoice()!.connect()).resolves.toBeNull();
  });
});
