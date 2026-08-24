import { describe, expect, it, vi } from 'vitest';
import { dedupeKey, enqueueDelivery, purgeSettledDeliveries, retryDelayMs, wantsEvent, type Queryable } from './deliveries.js';

const HOUR = 60 * 60 * 1000;

function fakeDb(rowCount: number): Queryable & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    query: vi.fn(async (text: string, values?: unknown[]) => {
      calls.push([text, values]);
      return { rows: [], rowCount };
    }) as Queryable['query'],
  };
}

describe('retryDelayMs', () => {
  it('doubles from one minute and caps at six hours', () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(5)).toBe(16 * 60_000);
    expect(retryDelayMs(12)).toBe(6 * HOUR);
    expect(retryDelayMs(40)).toBe(6 * HOUR);
  });

  it('spans about three days over twenty attempts', () => {
    let total = 0;
    for (let attempt = 1; attempt < 20; attempt++) total += retryDelayMs(attempt);
    expect(total).toBeGreaterThan(60 * HOUR);
    expect(total).toBeLessThan(96 * HOUR);
  });
});

describe('wantsEvent', () => {
  it('subscribes to everything when no events are listed', () => {
    expect(wantsEvent({ url: 'https://h.example' }, 'page')).toBe(true);
    expect(wantsEvent({ url: 'https://h.example', events: [] }, 'failed')).toBe(true);
  });

  it('filters to the listed events', () => {
    const config = { url: 'https://h.example', events: ['completed'] };
    expect(wantsEvent(config, 'completed')).toBe(true);
    expect(wantsEvent(config, 'page')).toBe(false);
  });
});

describe('enqueueDelivery', () => {
  const config = { url: 'https://h.example/hook', events: ['page', 'completed'], metadata: { tenant: 'a' } };

  it('skips events the config did not ask for without touching the database', async () => {
    const db = fakeDb(1);
    const queued = await enqueueDelivery(db, { config, event: 'started', jobId: 'job-1', data: {} });
    expect(queued).toBe(false);
    expect(db.calls).toHaveLength(0);
  });

  it('inserts a row keyed so the same event is never queued twice', async () => {
    const db = fakeDb(1);
    const input = { config, event: 'page' as const, jobId: 'job-1', key: 'https://s.com/a', data: { url: 'https://s.com/a' } };
    expect(await enqueueDelivery(db, input)).toBe(true);

    const [text, values] = db.calls[0]!;
    expect(text).toContain('ON CONFLICT (dedupe_key) DO NOTHING');
    expect(values).toEqual([
      'job-1',
      null,
      'https://h.example/hook',
      'page',
      expect.stringContaining('"tenant":"a"'),
      dedupeKey(input),
    ]);
    expect(dedupeKey(input)).toBe('job-1|page|https://s.com/a|https://h.example/hook');
  });

  it('reports false when the row already existed', async () => {
    const db = fakeDb(0);
    expect(await enqueueDelivery(db, { config, event: 'completed', jobId: 'job-1', data: {} })).toBe(false);
  });
});

describe('purgeSettledDeliveries', () => {
  it('deletes only delivered and dead rows older than the window', async () => {
    const db = fakeDb(12);
    expect(await purgeSettledDeliveries(db, 168)).toBe(12);

    const [text, values] = db.calls[0]!;
    expect(text).toContain("status IN ('delivered', 'dead')");
    expect(text).toContain('created_at <');
    expect(values).toEqual([168]);
  });
});
