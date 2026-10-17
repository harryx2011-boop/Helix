import { describe, expect, it, vi } from 'vitest';
import { checkRow, fetchHistory, fetchMonitors, monitorRow } from '../src/monitors';
import type { FetchLike } from '../src/target';

const ORIGIN = 'http://127.0.0.1:7410';
const KEY = 'helix-0123456789abcdef';

function answering(body: unknown, status = 200): FetchLike {
  return vi.fn(async () => ({ status, json: async () => body }));
}

describe('fetchMonitors', () => {
  it('calls the list route with the key', async () => {
    const fetch = answering({ success: true, monitors: [{ id: 'm1', url: 'https://example.com/', status: 'active' }] });
    const monitors = await fetchMonitors(ORIGIN, KEY, fetch);
    expect(monitors).toEqual([{ id: 'm1', url: 'https://example.com/', status: 'active', lastChangeAt: null }]);
    expect(fetch).toHaveBeenCalledWith(`${ORIGIN}/v1/monitor`, expect.objectContaining({
      headers: { authorization: `Bearer ${KEY}` },
    }));
  });

  it('reads a body that is not an object as no monitors, not a crash', async () => {
    expect(await fetchMonitors(ORIGIN, KEY, answering(null))).toEqual([]);
    expect(await fetchHistory(ORIGIN, KEY, 'm1', answering(null))).toEqual([]);
  });

  it('says why when the key is refused', async () => {
    await expect(fetchMonitors(ORIGIN, KEY, answering({ error: 'unauthorized' }, 401))).rejects.toThrow(
      'Helix refused the API key (401). Run "Helix: Set API Key".',
    );
  });
});

describe('fetchHistory', () => {
  it('reads the latest checks of one monitor', async () => {
    const fetch = answering({
      entries: [{ id: 3, checkedAt: '2026-10-17T10:00:00Z', changed: true, reason: 'changed', diff: { summary: 'Changed: price.' } }],
      next: null,
    });
    const checks = await fetchHistory(ORIGIN, KEY, 'm1', fetch);
    expect(checks).toEqual([{ id: 3, checkedAt: '2026-10-17T10:00:00Z', changed: true, reason: 'changed', summary: 'Changed: price.' }]);
    expect(fetch).toHaveBeenCalledWith(`${ORIGIN}/v1/monitor/m1/history?limit=10`, expect.anything());
  });
});

describe('rows', () => {
  it('labels a monitor by its URL and status', () => {
    expect(monitorRow({ id: 'm1', url: 'https://example.com/pricing', status: 'paused', lastChangeAt: null })).toEqual({
      label: 'example.com/pricing',
      description: 'paused',
      tooltip: 'https://example.com/pricing (paused)',
    });
  });

  it('shows a change by the first line of its summary, the whole summary on hover', () => {
    const row = checkRow({
      id: 3,
      checkedAt: '2026-10-17T10:00:00Z',
      changed: true,
      reason: 'changed',
      summary: '1 word added, 1 removed.\nRemoved: "$29"\nAdded: "$35"',
    });
    expect(row.label).toBe('Changed');
    expect(row.description).toBe('1 word added, 1 removed.');
    expect(row.tooltip).toBe('2026-10-17T10:00:00Z\n1 word added, 1 removed.\nRemoved: "$29"\nAdded: "$35"');
  });

  it('shows an unchanged check by its reason', () => {
    const row = checkRow({ id: 2, checkedAt: '2026-10-17T09:00:00Z', changed: false, reason: 'unchanged', summary: null });
    expect(row).toEqual({ label: 'No change', description: 'unchanged', tooltip: '2026-10-17T09:00:00Z\nunchanged' });
  });
});
