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

  it('releases monitors left claimed by a crash, but not claims still fresh enough to be running', async () => {
    const store = new MemoryMonitorStore();
    const now = new Date('2026-08-24T12:30:00Z');
    const stuck = await monitor(store, new Date('2026-08-24T11:00:00Z'));
    const running = await monitor(store, new Date('2026-08-24T11:00:00Z'));
    await store.claim(stuck.id, new Date('2026-08-24T11:30:00Z'));
    await store.claim(running.id, new Date('2026-08-24T12:25:00Z'));
    const legacy = await monitor(store, null);

    const scheduler = new MonitorScheduler({
      store,
      check: async () => undefined,
      stuckAfterMs: 30 * 60_000,
      now: () => now,
    });

    expect(await scheduler.releaseStuck()).toBe(2);
    expect((await store.get(stuck.id))?.nextCheckAt?.toISOString()).toBe('2026-08-24T13:00:00.000Z');
    expect((await store.get(legacy.id))?.nextCheckAt?.toISOString()).toBe('2026-08-24T13:00:00.000Z');
    expect((await store.get(running.id))?.nextCheckAt).toBeNull();
  });

  it('runs a check now under the claim and the concurrency budget', async () => {
    const store = new MemoryMonitorStore();
    const now = new Date('2026-08-24T12:30:00Z');
    const m = await monitor(store, new Date('2026-08-24T13:00:00Z'));

    let release!: () => void;
    const gate = new Promise<string>((resolve) => {
      release = () => resolve('done');
    });
    const scheduler = new MonitorScheduler({ store, concurrency: 1, check: () => gate, now: () => now });

    const first = scheduler.runNow(m.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scheduler.inFlight).toBe(1);
    expect((await store.get(m.id))?.nextCheckAt).toBeNull();

    // The same monitor is claimed; a second one finds no slot.
    const other = await monitor(store, new Date('2026-08-24T13:00:00Z'));
    expect(await scheduler.runNow(other.id)).toEqual({ ok: false, reason: 'busy' });

    release();
    expect(await first).toEqual({ ok: true, outcome: 'done' });
    expect(scheduler.inFlight).toBe(0);
    expect((await store.get(m.id))?.nextCheckAt?.toISOString()).toBe('2026-08-24T13:00:00.000Z');

    expect(await scheduler.runNow('00000000-0000-4000-8000-000000000099')).toEqual({ ok: false, reason: 'not_found' });
    await store.update(m.id, { status: 'paused', nextCheckAt: null });
    expect(await scheduler.runNow(m.id)).toEqual({ ok: false, reason: 'paused' });
  });

  it('refuses a second check of a monitor that is already claimed', async () => {
    const store = new MemoryMonitorStore();
    const m = await monitor(store, new Date('2026-08-24T12:00:00Z'));
    await store.claimDue(new Date('2026-08-24T12:30:00Z'), 1);
    const scheduler = new MonitorScheduler({ store, check: async () => undefined, now: () => new Date('2026-08-24T12:30:00Z') });
    expect(await scheduler.runNow(m.id)).toEqual({ ok: false, reason: 'in_progress' });
  });

  it('does not mark a monitor paused mid-check as errored when the check throws', async () => {
    const store = new MemoryMonitorStore();
    const m = await monitor(store, new Date('2026-08-24T12:00:00Z'));
    const scheduler = new MonitorScheduler({
      store,
      check: async (record) => {
        await store.update(record.id, { status: 'paused', nextCheckAt: null });
        throw new Error('boom');
      },
      now: () => new Date('2026-08-24T12:30:00Z'),
    });

    await scheduler.tick();
    const record = await store.get(m.id);
    expect(record?.status).toBe('paused');
    expect(record?.lastError).toBe('boom');
    expect(record?.nextCheckAt).toBeNull();
  });
});
