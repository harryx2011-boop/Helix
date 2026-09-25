import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryMonitorStore, type MonitorRecord } from './store.js';
import { BlockedTargetError } from '../core/webhook-target.js';
import { retryDelayMs, WEBHOOK_MAX_ATTEMPTS } from '../webhooks/deliveries.js';
import { WebhookDispatcher, describeFailure, signPayload } from './webhooks.js';

async function monitorWith(store: MemoryMonitorStore, webhook: MonitorRecord['webhook']): Promise<MonitorRecord> {
  return store.create({
    apiKeyId: null,
    url: 'https://example.com/pricing',
    schedule: { cron: '0 * * * *', timezone: 'UTC' },
    scrapeOptions: {},
    diff: { granularity: 'word', inline: true },
    trigger: {},
    sensitivity: 'any',
    webhook,
    nextCheckAt: null,
  });
}

describe('signPayload', () => {
  it('produces the documented header shape over `{timestamp}.{body}`', () => {
    const expected = createHmac('sha256', 'shh').update('1700000000.{"a":1}').digest('hex');
    expect(signPayload('shh', 1_700_000_000, '{"a":1}')).toBe(`t=1700000000,v1=${expected}`);
  });
});

describe('WebhookDispatcher', () => {
  it('delivers a pending row and records the status', async () => {
    const store = new MemoryMonitorStore();
    const monitor = await monitorWith(store, { url: 'https://hooks.test/x', events: ['changed'], secret: 'shh' });
    await store.enqueueDelivery({
      monitorId: monitor.id,
      url: 'https://hooks.test/x',
      eventType: 'changed',
      payload: { hello: 'world' },
      dedupeKey: 'k1',
    });

    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const clock = Date.now() + 1_000;
    const dispatcher = new WebhookDispatcher({
      store,
      fetch: async (url, init) => {
        calls.push({ url, headers: init.headers, body: init.body });
        return { status: 200 };
      },
      now: () => new Date(clock),
    });

    const results = await dispatcher.tick();
    expect(results).toEqual([{ id: expect.any(Number), outcome: 'delivered', status: 200 }]);

    const call = calls[0]!;
    expect(call.headers['helix-event']).toBe('changed');
    expect(call.headers['helix-signature']).toBe(signPayload('shh', Math.floor(clock / 1000), call.body));

    const [row] = await store.listDeliveries(monitor.id, 10);
    expect(row?.status).toBe('delivered');
    expect(row?.attempts).toBe(1);
    expect(row?.responseStatus).toBe(200);
  });

  it('retries on the shared webhook schedule and dead-letters after attempt 20', async () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(20);
    const store = new MemoryMonitorStore();
    const monitor = await monitorWith(store, { url: 'https://hooks.test/x', events: ['changed'] });
    await store.enqueueDelivery({
      monitorId: monitor.id,
      url: 'https://hooks.test/x',
      eventType: 'changed',
      payload: {},
      dedupeKey: 'k2',
    });

    let clock = Date.now() + 1_000;
    const dispatcher = new WebhookDispatcher({
      store,
      fetch: async () => ({ status: 503 }),
      now: () => new Date(clock),
    });

    const first = await dispatcher.tick();
    expect(first[0]?.outcome).toBe('retry');
    let [row] = await store.listDeliveries(monitor.id, 10);
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe('HTTP 503');
    expect(row?.nextRetryAt.getTime()).toBe(clock + 60_000);

    // Not due yet: nothing happens.
    clock += 30_000;
    expect(await dispatcher.tick()).toEqual([]);

    // Walk the whole schedule.
    for (let attempt = 2; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
      [row] = await store.listDeliveries(monitor.id, 10);
      clock = row!.nextRetryAt.getTime();
      const result = await dispatcher.tick();
      expect(result[0]?.outcome).toBe(attempt === WEBHOOK_MAX_ATTEMPTS ? 'dead' : 'retry');
      if (attempt < WEBHOOK_MAX_ATTEMPTS) {
        [row] = await store.listDeliveries(monitor.id, 10);
        expect(row!.nextRetryAt.getTime() - clock).toBe(retryDelayMs(attempt));
      }
    }

    [row] = await store.listDeliveries(monitor.id, 10);
    expect(row?.status).toBe('dead');
    expect(row?.attempts).toBe(WEBHOOK_MAX_ATTEMPTS);
  });

  it('honours a configured attempt ceiling', async () => {
    const store = new MemoryMonitorStore();
    const monitor = await monitorWith(store, { url: 'https://hooks.test/x', events: ['changed'] });
    await store.enqueueDelivery({ monitorId: monitor.id, url: 'https://hooks.test/x', eventType: 'changed', payload: {}, dedupeKey: 'k6' });

    let clock = Date.now() + 1_000;
    const dispatcher = new WebhookDispatcher({ store, maxAttempts: 2, fetch: async () => ({ status: 503 }), now: () => new Date(clock) });
    expect((await dispatcher.tick())[0]?.outcome).toBe('retry');
    const [row] = await store.listDeliveries(monitor.id, 10);
    clock = row!.nextRetryAt.getTime();
    expect((await dispatcher.tick())[0]?.outcome).toBe('dead');
  });

  it('replays a dead letter from scratch', async () => {
    const store = new MemoryMonitorStore();
    const monitor = await monitorWith(store, { url: 'https://hooks.test/x', events: ['changed'] });
    const queued = await store.enqueueDelivery({
      monitorId: monitor.id,
      url: 'https://hooks.test/x',
      eventType: 'changed',
      payload: {},
      dedupeKey: 'k3',
    });
    await store.markDead(queued!.id, WEBHOOK_MAX_ATTEMPTS, 'HTTP 500', 500);

    expect(await store.replayDelivery(monitor.id, queued!.id)).toMatchObject({ status: 'pending', attempts: 0 });
    // A second replay of a now-pending row is refused.
    expect(await store.replayDelivery(monitor.id, queued!.id)).toBeUndefined();

    const dispatcher = new WebhookDispatcher({ store, fetch: async () => ({ status: 204 }) });
    expect((await dispatcher.tick())[0]?.outcome).toBe('delivered');
  });

  it('treats a thrown fetch as a retryable failure and records a category, not the socket error', async () => {
    const store = new MemoryMonitorStore();
    const monitor = await monitorWith(store, { url: 'https://hooks.test/x', events: ['changed'] });
    await store.enqueueDelivery({ monitorId: monitor.id, url: 'https://hooks.test/x', eventType: 'changed', payload: {}, dedupeKey: 'k4' });

    const dispatcher = new WebhookDispatcher({
      store,
      fetch: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:9200');
      },
    });
    expect((await dispatcher.tick())[0]?.outcome).toBe('retry');
    const [row] = await store.listDeliveries(monitor.id, 10);
    expect(row?.lastError).toBe('unreachable');

    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(describeFailure(abort)).toBe('timeout');
  });

  it('dead-letters a blocked target at once instead of retrying', async () => {
    const store = new MemoryMonitorStore();
    const monitor = await monitorWith(store, { url: 'https://internal.example/x', events: ['changed'] });
    await store.enqueueDelivery({ monitorId: monitor.id, url: 'https://internal.example/x', eventType: 'changed', payload: {}, dedupeKey: 'k5' });

    const dispatcher = new WebhookDispatcher({
      store,
      fetch: async () => {
        throw new BlockedTargetError('webhook host resolves to a private address');
      },
    });
    expect((await dispatcher.tick())[0]?.outcome).toBe('dead');
    const [row] = await store.listDeliveries(monitor.id, 10);
    expect(row?.status).toBe('dead');
    expect(row?.lastError).toBe('blocked: webhook host resolves to a private address');
  });

  it('leases a claimed batch for longer than the batch can take to send', async () => {
    const store = new MemoryMonitorStore();
    const monitor = await monitorWith(store, { url: 'https://hooks.test/x', events: ['changed'] });
    for (let i = 0; i < 3; i += 1) {
      await store.enqueueDelivery({ monitorId: monitor.id, url: 'https://hooks.test/x', eventType: 'changed', payload: {}, dedupeKey: `lease-${i}` });
    }

    const clock = Date.now() + 1_000;
    const leases: number[] = [];
    const dispatcher = new WebhookDispatcher({
      store,
      batch: 3,
      requestTimeoutMs: 15_000,
      fetch: async () => {
        // Rows not yet attempted must be leased past this whole batch.
        const pending = await store.listDeliveries(monitor.id, 10);
        leases.push(...pending.filter((d) => d.attempts === 0).map((d) => d.nextRetryAt.getTime() - clock));
        return { status: 200 };
      },
      now: () => new Date(clock),
    });

    expect((await dispatcher.tick()).every((r) => r.outcome === 'delivered')).toBe(true);
    expect(leases.length).toBeGreaterThan(0);
    expect(Math.min(...leases)).toBeGreaterThanOrEqual(3 * 15_000);
  });

  it('dedupes on the key so an at-least-once queue sends once', async () => {
    const store = new MemoryMonitorStore();
    const monitor = await monitorWith(store, { url: 'https://hooks.test/x', events: ['changed'] });
    const input = { monitorId: monitor.id, url: 'https://hooks.test/x', eventType: 'changed', payload: {}, dedupeKey: 'same' };
    expect(await store.enqueueDelivery(input)).toBeDefined();
    expect(await store.enqueueDelivery(input)).toBeUndefined();
  });
});
