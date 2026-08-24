import { describe, expect, it } from 'vitest';
import { runCheck, type FetchOutcome } from './checker.js';
import { MemoryMonitorStore, type MonitorRecord, type NewMonitor } from './store.js';

const RETENTION = { keep: 3, maxAgeDays: 90 };

async function setup(over: Partial<NewMonitor> = {}) {
  const store = new MemoryMonitorStore();
  const monitor = await store.create({
    apiKeyId: null,
    url: 'https://example.com/pricing',
    schedule: { cron: '0 * * * *', timezone: 'UTC' },
    scrapeOptions: {},
    diff: { granularity: 'word', inline: true },
    trigger: {},
    sensitivity: 'any',
    webhook: { url: 'https://hooks.test/x', events: ['changed'] },
    nextCheckAt: null,
    ...over,
  });
  return { store, monitor };
}

const pages = (...contents: (string | FetchOutcome)[]) => {
  let index = 0;
  return async (): Promise<FetchOutcome> => {
    const next = contents[Math.min(index, contents.length - 1)]!;
    index += 1;
    return typeof next === 'string' ? { ok: true, content: next } : next;
  };
};

async function check(store: MemoryMonitorStore, id: string, fetchPage: () => Promise<FetchOutcome>) {
  const monitor = (await store.get(id)) as MonitorRecord;
  return runCheck(monitor, { store, fetchPage, retention: RETENTION });
}

describe('runCheck', () => {
  it('stores a baseline on the first check and sends nothing', async () => {
    const { store, monitor } = await setup();
    const outcome = await check(store, monitor.id, pages('Standard $29'));

    expect(outcome.check.reason).toBe('first');
    expect(outcome.check.changed).toBe(false);
    expect(outcome.snapshot?.content).toBe('Standard $29');
    expect(outcome.webhookQueued).toBe(false);
    expect((await store.get(monitor.id))?.checks).toBe(1);
  });

  it('records an unchanged check without a new snapshot or webhook', async () => {
    const { store, monitor } = await setup();
    const fetchPage = pages('Standard $29');
    await check(store, monitor.id, fetchPage);
    const outcome = await check(store, monitor.id, fetchPage);

    expect(outcome.check.reason).toBe('unchanged');
    expect(outcome.snapshot).toBeNull();
    expect(store.snapshots).toHaveLength(1);
    expect(store.deliveries).toHaveLength(0);
    const record = await store.get(monitor.id);
    expect(record?.pagesUnchanged).toBe(1);
    expect(record?.lastChangeAt).toBeNull();
  });

  it('diffs a real change, stores the snapshot and queues an inline webhook', async () => {
    const { store, monitor } = await setup();
    const fetchPage = pages('Standard $29/month', 'Standard $34/month');
    await check(store, monitor.id, fetchPage);
    const outcome = await check(store, monitor.id, fetchPage);

    expect(outcome.check.reason).toBe('changed');
    expect(outcome.check.changed).toBe(true);
    expect(outcome.check.diff?.text).toBe('Standard [-$29/month-]{+$34/month+}');
    expect(store.snapshots).toHaveLength(2);
    expect(outcome.webhookQueued).toBe(true);

    const [delivery] = store.deliveries;
    expect(delivery?.eventType).toBe('changed');
    expect(delivery?.payload['diff']).toMatchObject({ granularity: 'word', added: 1, removed: 1, text: expect.any(String) });
    const [older, newer] = store.snapshots;
    expect(delivery?.payload['snapshot']).toMatchObject({ snapshotUrl: `/v1/monitor/${monitor.id}/snapshots/${newer!.id}` });
    expect(delivery?.payload['previousSnapshot']).toMatchObject({ snapshotUrl: `/v1/monitor/${monitor.id}/snapshots/${older!.id}` });

    const record = await store.get(monitor.id);
    expect(record?.changes).toBe(1);
    expect(record?.lastChangeAt).not.toBeNull();
  });

  it('leaves the diff text out of the payload when inline is off', async () => {
    const { store, monitor } = await setup({ diff: { granularity: 'line', inline: false } });
    const fetchPage = pages('a\nb', 'a\nc');
    await check(store, monitor.id, fetchPage);
    await check(store, monitor.id, fetchPage);
    const payload = store.deliveries[0]?.payload as { diff: Record<string, unknown> };
    expect(payload.diff).toEqual({ granularity: 'line', added: 1, removed: 1, changeRatio: 1 });
  });

  it('filters timestamp noise at significant sensitivity', async () => {
    const { store, monitor } = await setup({ sensitivity: 'significant' });
    const fetchPage = pages('Updated 2 minutes ago. $29', 'Updated 9 minutes ago. $29');
    await check(store, monitor.id, fetchPage);
    const outcome = await check(store, monitor.id, fetchPage);

    expect(outcome.check.reason).toBe('filtered');
    expect(outcome.check.changed).toBe(false);
    expect(store.snapshots).toHaveLength(1);
    expect(store.deliveries).toHaveLength(0);
  });

  it('moves the baseline but stays quiet when a keyword trigger is not met', async () => {
    const { store, monitor } = await setup({ trigger: { keywordDisappears: 'Out of stock' } });
    const fetchPage = pages('Out of stock. $29', 'Out of stock. $34', 'Ships today. $34');
    await check(store, monitor.id, fetchPage);

    const quiet = await check(store, monitor.id, fetchPage);
    expect(quiet.check.reason).toBe('trigger_not_met');
    expect(quiet.check.changed).toBe(false);
    expect(store.deliveries).toHaveLength(0);

    const fired = await check(store, monitor.id, fetchPage);
    expect(fired.check.changed).toBe(true);
    expect(store.deliveries[0]?.payload['reason']).toBe('keyword_disappeared');
  });

  it('records a fetch failure, flags the monitor and fires `failed` only when asked', async () => {
    const { store, monitor } = await setup({ webhook: { url: 'https://hooks.test/x', events: ['changed', 'failed'] } });
    const outcome = await check(store, monitor.id, pages({ ok: false, reason: 'blocked', detail: 'WAF' }));

    expect(outcome.check.reason).toBe('error');
    expect(outcome.check.error).toBe('blocked: WAF');
    expect(outcome.webhookQueued).toBe(true);
    expect(store.deliveries[0]?.eventType).toBe('failed');

    const record = await store.get(monitor.id);
    expect(record?.status).toBe('error');
    expect(record?.lastError).toBe('blocked: WAF');

    // A later success clears the error state.
    await check(store, monitor.id, pages('fine now'));
    expect((await store.get(monitor.id))?.status).toBe('active');
    expect((await store.get(monitor.id))?.lastError).toBeNull();
  });

  it('prunes old snapshots but always keeps the newest baseline', async () => {
    const { store, monitor } = await setup();
    const fetchPage = pages('v1', 'v2', 'v3', 'v4', 'v5');
    for (let i = 0; i < 5; i += 1) await check(store, monitor.id, fetchPage);

    expect(store.snapshots).toHaveLength(RETENTION.keep);
    expect((await store.latestSnapshot(monitor.id))?.content).toBe('v5');
    // History entries whose snapshot was pruned lose the pointer, not the row.
    expect(store.checks).toHaveLength(5);
    expect(store.checks[0]?.snapshotId).toBeNull();
  });
});
