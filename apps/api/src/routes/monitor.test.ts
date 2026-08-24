import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FetchOutcome } from '../monitor/checker.js';
import { MemoryMonitorStore } from '../monitor/store.js';
import { registerMonitor } from './monitor.js';

let app: FastifyInstance;
let store: MemoryMonitorStore;
let page: FetchOutcome;

beforeEach(async () => {
  store = new MemoryMonitorStore();
  page = { ok: true, content: 'Standard $29/month' };
  app = Fastify();
  await app.register(
    async (instance) => {
      await registerMonitor(instance, {
        store,
        fetchPage: async () => page,
        minIntervalSeconds: 3600,
        retention: { keep: 30, maxAgeDays: 90 },
      });
    },
    { prefix: '/v1' },
  );
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const create = (body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/v1/monitor', payload: body });

describe('POST /v1/monitor', () => {
  it('creates a monitor from the spec-shaped request', async () => {
    const response = await create({
      url: 'https://example.com/pricing',
      schedule: '0 * * * *',
      sensitivity: 'significant',
      webhook: 'https://your.app/webhooks/helix',
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.monitorId).toBe(body.id);
    expect(body.status).toBe('active');
    expect(typeof body.nextCheckAt).toBe('string');
    expect(body.schedule).toEqual({ cron: '0 * * * *', timezone: 'UTC' });
    expect(body.sensitivity).toBe('significant');
    expect(body.diff).toEqual({ granularity: 'word', inline: true });
    expect(body.webhook).toEqual({
      url: 'https://your.app/webhooks/helix',
      events: ['changed'],
      metadata: null,
      headers: [],
      signed: false,
    });
    expect(body.stats).toEqual({ checks: 0, changes: 0, pagesUnchanged: 0 });
  });

  it('accepts the object schedule and webhook forms and never echoes the secret', async () => {
    const response = await create({
      url: 'https://example.com',
      schedule: { every: '6h', timezone: 'Europe/London' },
      diff: { granularity: 'line', inline: false },
      trigger: { keywordDisappears: 'Out of stock', selector: 'main' },
      webhook: { url: 'https://hooks.test/x', events: ['changed', 'failed'], secret: 'supersecret', headers: { 'x-token': 'abc' } },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.schedule).toEqual({ cron: '0 */6 * * *', timezone: 'Europe/London', every: '6h' });
    expect(body.trigger).toEqual({ keywordDisappears: 'Out of stock' });
    expect(body.scrapeOptions.includeSelectors).toEqual(['main']);
    expect(body.webhook.signed).toBe(true);
    expect(body.webhook.headers).toEqual(['x-token']);
    expect(JSON.stringify(body)).not.toContain('supersecret');
    expect(JSON.stringify(body)).not.toContain('abc');
  });

  it('rejects a schedule under the operator minimum with the field named', async () => {
    const response = await create({ url: 'https://example.com', schedule: '*/15 * * * *' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request', field: 'schedule' });
    expect(response.json().message).toContain('HELIX_MONITOR_MIN_INTERVAL');
  });

  it('rejects malformed input with the typed envelope', async () => {
    const response = await create({ url: 'not a url', schedule: '0 * * * *' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request', field: 'url' });
    expect(typeof response.json().requestId).toBe('string');

    const noSchedule = await create({ url: 'https://example.com' });
    expect(noSchedule.statusCode).toBe(400);
    expect(noSchedule.json().field).toBe('schedule');
  });
});

describe('GET /v1/monitor and /v1/monitor/:id', () => {
  it('lists and reads monitors, including the latest snapshot once one exists', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *' })).json();

    const list = await app.inject({ method: 'GET', url: '/v1/monitor' });
    expect(list.json().monitors).toHaveLength(1);

    const beforeCheck = await app.inject({ method: 'GET', url: `/v1/monitor/${id}` });
    expect(beforeCheck.json().latestSnapshot).toBeNull();

    await app.inject({ method: 'POST', url: `/v1/monitor/${id}/check` });

    const afterCheck = await app.inject({ method: 'GET', url: `/v1/monitor/${id}` });
    expect(afterCheck.json().latestSnapshot).toMatchObject({
      markdown: 'Standard $29/month',
      snapshotUrl: `/v1/monitor/${id}/snapshots/${afterCheck.json().latestSnapshot.id}`,
    });
    expect(afterCheck.json().stats.checks).toBe(1);
  });

  it('404s on an unknown id', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/monitor/00000000-0000-4000-8000-000000000099' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });
});

describe('PATCH /v1/monitor/:id', () => {
  it('pauses and resumes, clearing and restoring the next check', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *' })).json();

    const paused = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { status: 'paused' } });
    expect(paused.json().status).toBe('paused');
    expect(paused.json().nextCheckAt).toBeNull();

    const resumed = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { status: 'active' } });
    expect(resumed.json().status).toBe('active');
    expect(typeof resumed.json().nextCheckAt).toBe('string');
  });

  it('updates the schedule and sensitivity, and validates the new schedule', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *' })).json();

    const ok = await app.inject({
      method: 'PATCH',
      url: `/v1/monitor/${id}`,
      payload: { schedule: { every: '1d' }, sensitivity: 'significant', webhook: null },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().schedule.cron).toBe('0 0 * * *');
    expect(ok.json().sensitivity).toBe('significant');
    expect(ok.json().webhook).toBeNull();

    const tooFast = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { schedule: '* * * * *' } });
    expect(tooFast.statusCode).toBe(400);

    const empty = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: {} });
    expect(empty.statusCode).toBe(400);
  });
});

describe('DELETE /v1/monitor/:id', () => {
  it('removes the monitor', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *' })).json();
    expect((await app.inject({ method: 'DELETE', url: `/v1/monitor/${id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/v1/monitor/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/v1/monitor/${id}` })).statusCode).toBe(404);
  });
});

describe('history, snapshots, check and deliveries', () => {
  it('walks a first → unchanged → changed timeline with paginated history', async () => {
    const { id } = (await create({
      url: 'https://example.com/pricing',
      schedule: '0 * * * *',
      webhook: 'https://hooks.test/x',
    })).json();

    const first = await app.inject({ method: 'POST', url: `/v1/monitor/${id}/check` });
    expect(first.json().check).toMatchObject({ reason: 'first', changed: false });

    const same = await app.inject({ method: 'POST', url: `/v1/monitor/${id}/check` });
    expect(same.json().check).toMatchObject({ reason: 'unchanged', changed: false });

    page = { ok: true, content: 'Standard $34/month' };
    const changed = await app.inject({ method: 'POST', url: `/v1/monitor/${id}/check` });
    expect(changed.json().check).toMatchObject({ reason: 'changed', changed: true });
    expect(changed.json().check.diff.text).toBe('Standard [-$29/month-]{+$34/month+}');
    expect(changed.json().webhookQueued).toBe(true);

    const history = await app.inject({ method: 'GET', url: `/v1/monitor/${id}/history?limit=2` });
    expect(history.json().entries.map((e: { reason: string }) => e.reason)).toEqual(['changed', 'unchanged']);
    expect(history.json().next).toContain('cursor=');

    const rest = await app.inject({ method: 'GET', url: history.json().next });
    expect(rest.json().entries.map((e: { reason: string }) => e.reason)).toEqual(['first']);
    expect(rest.json().next).toBeNull();

    const snapshotUrl = changed.json().check.snapshotUrl as string;
    const snapshot = await app.inject({ method: 'GET', url: snapshotUrl });
    expect(snapshot.json().markdown).toBe('Standard $34/month');

    const deliveries = await app.inject({ method: 'GET', url: `/v1/monitor/${id}/deliveries` });
    expect(deliveries.json().deliveries).toHaveLength(1);
    expect(deliveries.json().deliveries[0]).toMatchObject({ event: 'changed', status: 'pending', attempts: 0 });
  });

  it('records a failed check as an error entry and flags the monitor', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *' })).json();
    page = { ok: false, reason: 'blocked', detail: 'WAF' };

    const response = await app.inject({ method: 'POST', url: `/v1/monitor/${id}/check` });
    expect(response.json().check).toMatchObject({ reason: 'error', error: 'blocked: WAF', changed: false });

    const monitor = await app.inject({ method: 'GET', url: `/v1/monitor/${id}` });
    expect(monitor.json().status).toBe('error');
    expect(monitor.json().lastError).toBe('blocked: WAF');
    expect(typeof monitor.json().nextCheckAt).toBe('string');
  });

  it('replays only dead deliveries', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *', webhook: 'https://hooks.test/x' })).json();
    const delivery = await store.enqueueDelivery({ monitorId: id, url: 'https://hooks.test/x', eventType: 'changed', payload: {}, dedupeKey: 'd1' });

    const pending = await app.inject({ method: 'POST', url: `/v1/monitor/${id}/deliveries/${delivery!.id}/replay` });
    expect(pending.statusCode).toBe(409);

    await store.markDead(delivery!.id, 10, 'HTTP 500', 500);
    const replayed = await app.inject({ method: 'POST', url: `/v1/monitor/${id}/deliveries/${delivery!.id}/replay` });
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json().delivery).toMatchObject({ status: 'pending', attempts: 0 });
  });
});
