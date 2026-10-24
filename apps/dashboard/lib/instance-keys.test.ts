import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeysError, listInstanceKeys } from './instance-keys';

/** Key management on the instance answers only to the admin token, never to an API key. */

function fakeWindow(store: Record<string, string>): void {
  vi.stubGlobal('window', {
    location: { origin: 'http://127.0.0.1:7410', port: '7410' },
    localStorage: { getItem: (k: string) => store[k] ?? null },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('instance key calls', () => {
  it('authenticate with the admin token, not the saved API key', async () => {
    fakeWindow({ 'helix.apiKey': 'helix-stored', 'helix.adminToken': 'admin-stored' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await listInstanceKeys();

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer admin-stored');
  });

  it('refuse to call without an admin token, even when an API key is saved', async () => {
    fakeWindow({ 'helix.apiKey': 'helix-stored' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(listInstanceKeys()).rejects.toBeInstanceOf(KeysError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
