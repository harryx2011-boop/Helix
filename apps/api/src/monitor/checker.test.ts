import { describe, expect, it } from 'vitest';
import type { Diff, JsonDiff } from './diff.js';
import { includeSelectorsFor, MAX_DIFF_BYTES, runCheck, type CheckerDeps, type FetchOutcome } from './checker.js';
import { MemoryMonitorStore, type MonitorRecord, type NewMonitor } from './store.js';

const RETENTION = { keep: 3, maxAgeDays: 90, keepChecks: 4 };

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

async function check(
  store: MemoryMonitorStore,
  id: string,
  fetchPage: () => Promise<FetchOutcome>,
  maxContentBytes?: number,
  extra?: Partial<CheckerDeps>,
) {
  const monitor = (await store.get(id)) as MonitorRecord;
  return runCheck(monitor, { store, fetchPage, retention: RETENTION, maxContentBytes, ...extra });
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
    expect((outcome.check.diff as Diff | null)?.text).toBe('Standard [-$29/month-]{+$34/month+}');
    expect(store.snapshots).toHaveLength(2);
    expect(outcome.webhookQueued).toBe(true);

    const [delivery] = store.deliveries;
    expect(delivery?.eventType).toBe('changed');
    expect(delivery?.payload['diff']).toMatchObject({ granularity: 'word', added: 1, removed: 1, text: expect.any(String) });

    // The plain summary rides with the stored diff and the webhook alike.
    const summary = ['1 word added, 1 removed.', 'Removed: "$29/month"', 'Added: "$34/month"'].join('\n');
    expect((outcome.check.diff as Diff | null)?.summary).toBe(summary);
    expect(delivery?.payload['diff']).toMatchObject({ summary });
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
    // Counts only: the summary's quoted passages are diff text, which inline off withholds.
    expect(payload.diff).toEqual({
      granularity: 'line',
      added: 1,
      removed: 1,
      changeRatio: 1,
      summary: '1 line added, 1 removed.',
    });
  });

  it('reports a field-level JSON diff naming the changed field, not unchanged siblings', async () => {
    const jsonOptions = { schema: { type: 'object', properties: { price: { type: 'number' }, name: { type: 'string' } } } };
    const { store, monitor } = await setup({ jsonOptions });
    const fetchPage = pages('Standard $29/month', 'Standard $34/month');
    const structured: Record<string, unknown>[] = [
      { price: 29, name: 'Standard' },
      { price: 34, name: 'Standard' },
    ];
    let call = 0;
    const extractJson = async () => structured[Math.min(call++, structured.length - 1)]!;

    await check(store, monitor.id, fetchPage, undefined, { extractJson });
    const outcome = await check(store, monitor.id, fetchPage, undefined, { extractJson });

    expect(outcome.check.reason).toBe('changed');
    const diff = outcome.check.diff as JsonDiff;
    expect(diff.granularity).toBe('json');
    expect(diff.fields).toEqual([{ path: 'price', before: 29, after: 34 }]);

    expect(diff.summary).toBe('Changed: price.');

    const payload = store.deliveries[0]?.payload as { diff: JsonDiff };
    expect(payload.diff.fields).toEqual([{ path: 'price', before: 29, after: 34 }]);
    expect(payload.diff.summary).toBe('Changed: price.');
  });

  it('falls back to the text diff when JSON extraction fails', async () => {
    const jsonOptions = { schema: { type: 'object', properties: { price: { type: 'number' } } } };
    const { store, monitor } = await setup({ jsonOptions });
    const fetchPage = pages('Standard $29/month', 'Standard $34/month');
    const extractJson = async () => {
      throw new Error('model unavailable');
    };

    await check(store, monitor.id, fetchPage, undefined, { extractJson });
    const outcome = await check(store, monitor.id, fetchPage, undefined, { extractJson });

    expect(outcome.check.reason).toBe('changed');
    expect((outcome.check.diff as Diff).granularity).toBe('word');
  });

  it('never calls extractJson for a monitor with no jsonOptions', async () => {
    const { store, monitor } = await setup();
    const fetchPage = pages('Standard $29', 'Standard $34');
    let called = false;
    const extractJson = async () => {
      called = true;
      return {};
    };

    await check(store, monitor.id, fetchPage, undefined, { extractJson });
    await check(store, monitor.id, fetchPage, undefined, { extractJson });
    expect(called).toBe(false);
  });

  it('filters a whitespace-only edit at any sensitivity instead of firing on a zero-content diff', async () => {
    const { store, monitor } = await setup({ sensitivity: 'any' });
    const fetchPage = pages('a b', 'a  b');
    await check(store, monitor.id, fetchPage);
    const outcome = await check(store, monitor.id, fetchPage);

    expect(outcome.check.reason).toBe('filtered');
    expect(outcome.check.changed).toBe(false);
    expect(store.snapshots).toHaveLength(1);
    expect(store.deliveries).toHaveLength(0);
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

  it('prunes old snapshots and history rows but always keeps the newest of each', async () => {
    const { store, monitor } = await setup();
    const fetchPage = pages('v1', 'v2', 'v3', 'v4', 'v5');
    for (let i = 0; i < 5; i += 1) await check(store, monitor.id, fetchPage);

    expect(store.snapshots).toHaveLength(RETENTION.keep);
    expect((await store.latestSnapshot(monitor.id))?.content).toBe('v5');
    // History entries whose snapshot was pruned lose the pointer, not the row.
    expect(store.checks).toHaveLength(RETENTION.keepChecks);
    expect(store.checks[0]?.snapshotId).toBeNull();
    expect((await store.history(monitor.id, { limit: 1 }))[0]?.reason).toBe('changed');
  });

  it('sends `checked` on every check, including the one that changed', async () => {
    const { store, monitor } = await setup({ webhook: { url: 'https://hooks.test/x', events: ['checked'] } });
    const fetchPage = pages('Standard $29', 'Standard $29', 'Standard $34');
    await check(store, monitor.id, fetchPage);
    await check(store, monitor.id, fetchPage);
    const changed = await check(store, monitor.id, fetchPage);

    expect(changed.check.reason).toBe('changed');
    expect(changed.webhookQueued).toBe(true);
    expect(store.deliveries.map((d) => d.eventType)).toEqual(['checked', 'checked', 'checked']);
    expect(store.deliveries[2]?.payload['changed']).toBe(true);
    expect(store.deliveries[2]?.payload['event']).toBe('checked');
  });

  it('sends both `changed` and `checked` to a webhook on both, under separate dedupe keys', async () => {
    const { store, monitor } = await setup({ webhook: { url: 'https://hooks.test/x', events: ['changed', 'checked'] } });
    const fetchPage = pages('Standard $29', 'Standard $34');
    await check(store, monitor.id, fetchPage);
    await check(store, monitor.id, fetchPage);

    expect(store.deliveries.map((d) => d.eventType)).toEqual(['checked', 'changed', 'checked']);
    expect(new Set(store.deliveries.map((d) => d.dedupeKey)).size).toBe(3);
  });

  it('fails a page over the content cap instead of storing it', async () => {
    const { store, monitor } = await setup({ webhook: { url: 'https://hooks.test/x', events: ['failed'] } });
    const outcome = await check(store, monitor.id, pages('x'.repeat(2_000)), 1_000);

    expect(outcome.check.reason).toBe('error');
    expect(outcome.check.error).toContain('too_large');
    expect(store.snapshots).toHaveLength(0);
    expect(store.deliveries[0]?.eventType).toBe('failed');
    expect((await store.get(monitor.id))?.status).toBe('error');
  });

  it('keeps counts only when a diff is too large to store or deliver', async () => {
    const { store, monitor } = await setup({ diff: { granularity: 'word', inline: true } });
    const words = (seed: string) => Array.from({ length: MAX_DIFF_BYTES / 8 }, (_, i) => `${seed}${i}`).join(' ');
    const fetchPage = pages(words('a'), words('b'));
    await check(store, monitor.id, fetchPage);
    const outcome = await check(store, monitor.id, fetchPage);

    expect(outcome.check.diff).toMatchObject({ truncated: true, ops: [], text: '' });
    expect((outcome.check.diff as Diff | null)?.added).toBeGreaterThan(0);
    const payload = store.deliveries[0]?.payload as { diff: Record<string, unknown> };
    expect(payload.diff['truncated']).toBe(true);
    expect(payload.diff['text']).toBeUndefined();
  });

  it('does not undo a pause that landed while the check was running', async () => {
    const { store, monitor } = await setup();
    await check(store, monitor.id, pages('v1'));
    const outcome = await check(store, monitor.id, async () => {
      await store.update(monitor.id, { status: 'paused', nextCheckAt: null });
      return { ok: true, content: 'v2' };
    });

    expect(outcome.check.reason).toBe('changed');
    expect((await store.get(monitor.id))?.status).toBe('paused');
    expect((await store.get(monitor.id))?.nextCheckAt).toBeNull();

    // A failure during a pause does not flip it to error either.
    await check(store, monitor.id, pages({ ok: false, reason: 'blocked' }));
    expect((await store.get(monitor.id))?.status).toBe('paused');
  });
});

describe('includeSelectorsFor', () => {
  const base = (over: Partial<MonitorRecord>): MonitorRecord =>
    ({ scrapeOptions: {}, trigger: {}, ...over }) as MonitorRecord;

  it('reads the whole page by default and narrows to the trigger selector', () => {
    expect(includeSelectorsFor(base({}))).toEqual([]);
    expect(includeSelectorsFor(base({ trigger: { selector: 'main' } }))).toEqual(['main']);
    expect(includeSelectorsFor(base({ scrapeOptions: { includeSelectors: ['#price'] } }))).toEqual(['#price']);
  });
});
