import { describe, expect, it } from 'vitest';
import { MonitorScheduler } from './scheduler.js';
import { MemoryMonitorStore, type MonitorRecord } from './store.js';

async function monitor(store: MemoryMonitorStore, nextCheckAt: Date | null, cron = '0 * * * *'): Promise<MonitorRecord> {
  return store.create({
    apiKeyId: null,
    url: 'https://example.com',
    schedule: { cron, timezone: 'UTC' },
    scrapeOptions: {},
    diff: { granularity: 'word', inline: true },
    trigger: {},
    sensitivity: 'any',
    webhook: null,
    nextCheckAt,
  });
}

describe('MonitorScheduler', () => {
  it('runs due monitors and reschedules them from the cron', async () => {
    const store = new MemoryMonitorStore();
    const now = new Date('2026-08-24T12:30:00Z');
    const due = await monitor(store, new Date('2026-08-24T12:00:00Z'));
    const later = await monitor(store, new Date('2026-08-24T13:00:00Z'));

    const ran: string[] = [];
    const scheduler = new MonitorScheduler({
      store,
      check: async (m) => {
        ran.push(m.id);
      },
      now: () => now,
    });

    expect(await scheduler.tick()).toBe(1);
    expect(ran).toEqual([due.id]);
    expect((await store.get(due.id))?.nextCheckAt?.toISOString()).toBe('2026-08-24T13:00:00.000Z');
    expect((await store.get(later.id))?.nextCheckAt?.toISOString()).toBe('2026-08-24T13:00:00.000Z');
    expect(scheduler.inFlight).toBe(0);
  });

  it('respects the concurrency cap across ticks', async () => {
    const store = new MemoryMonitorStore();
    const past = new Date('2026-08-24T12:00:00Z');
    for (let i = 0; i < 5; i += 1) await monitor(store, past);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const scheduler = new MonitorScheduler({
      store,
      concurrency: 2,
      check: () => gate,
      now: () => new Date('2026-08-24T12:30:00Z'),
    });

    const first = scheduler.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scheduler.inFlight).toBe(2);
    expect(await scheduler.tick()).toBe(0);

    release();
    expect(await first).toBe(2);
    expect(scheduler.inFlight).toBe(0);
    expect(await scheduler.tick()).toBe(2);
  });

  it('skips paused monitors and does not reschedule one paused mid-check', async () => {
    const store = new MemoryMonitorStore();
    const past = new Date('2026-08-24T12:00:00Z');
    const paused = await monitor(store, past);
    await store.update(paused.id, { status: 'paused' });
    const active = await monitor(store, past);

    const scheduler = new MonitorScheduler({
      store,
      check: async (m) => {
        await store.update(m.id, { status: 'paused' });
      },
      now: () => new Date('2026-08-24T12:30:00Z'),
    });

    expect(await scheduler.tick()).toBe(1);
    expect((await store.get(active.id))?.nextCheckAt).toBeNull();
    expect((await store.get(paused.id))?.nextCheckAt).toEqual(past);
  });

  it('marks a monitor whose check threw and still reschedules it', async () => {
    const store = new MemoryMonitorStore();
    const m = await monitor(store, new Date('2026-08-24T12:00:00Z'));
    const scheduler = new MonitorScheduler({
      store,
      check: async () => {
        throw new Error('boom');
      },
      now: () => new Date('2026-08-24T12:30:00Z'),
    });

    await scheduler.tick();
    const record = await store.get(m.id);
    expect(record?.status).toBe('error');
    expect(record?.lastError).toBe('boom');
    expect(record?.nextCheckAt?.toISOString()).toBe('2026-08-24T13:00:00.000Z');
  });

  it('releases monitors left claimed by a crash on start', async () => {
    const store = new MemoryMonitorStore();
    const stuck = await monitor(store, null);
    const scheduler = new MonitorScheduler({
      store,
      check: async () => undefined,
      now: () => new Date('2026-08-24T12:30:00Z'),
    });

    expect(await scheduler.releaseStuck()).toBe(1);
    expect((await store.get(stuck.id))?.nextCheckAt?.toISOString()).toBe('2026-08-24T13:00:00.000Z');
  });
});
