import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck, type FetchOutcome } from '../monitor/checker.js';
import { MonitorScheduler } from '../monitor/scheduler.js';
import { MemoryMonitorStore } from '../monitor/store.js';
import { registerMonitor } from './monitor.js';

let app: FastifyInstance;
let store: MemoryMonitorStore;
let page: FetchOutcome | (() => Promise<FetchOutcome>);

const KEY_A = '11111111-1111-4111-8111-111111111111';
const KEY_B = '22222222-2222-4222-8222-222222222222';

const asKey = (id: string) => ({ id, name: id, keyPrefix: 'helix-test', rateLimit: 1000, createdAt: new Date(), lastUsedAt: null, revokedAt: null });

beforeEach(async () => {
  store = new MemoryMonitorStore();
  page = { ok: true, content: 'Standard $29/month' };
  app = Fastify();
  // Stands in for the API key hook: `x-test-key` names the calling key.
  app.addHook('onRequest', async (request) => {
    const key = request.headers['x-test-key'];
    if (typeof key === 'string') request.apiKey = asKey(key);
  });
  const scheduler = new MonitorScheduler({
    store,
    concurrency: 2,
    check: (monitor) =>
      runCheck(monitor, {
        store,
        fetchPage: async () => (typeof page === 'function' ? page() : page),
        retention: { keep: 30, maxAgeDays: 90, keepChecks: 100 },
      }),
  });
  await app.register(
    async (instance) => {
      await registerMonitor(instance, { store, scheduler, minIntervalSeconds: 3600 });
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
    expect(body.trigger).toEqual({ keywordDisappears: 'Out of stock', selector: 'main' });
    expect(body.scrapeOptions.includeSelectors).toBeUndefined();
    expect(body.webhook.signed).toBe(true);
    expect(body.webhook.headers).toEqual(['x-token']);
    expect(JSON.stringify(body)).not.toContain('supersecret');
    expect(JSON.stringify(body)).not.toContain('abc');
  });

  it('accepts a business-hours window and echoes it back', async () => {
    const response = await create({
      url: 'https://example.com',
      schedule: { cron: '0 * * * *', window: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 } },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.schedule).toEqual({
      cron: '0 * * * *',
      timezone: 'UTC',
      window: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
    });
    // The window pushed the next check to the following in-window instant, not
    // just the next cron tick.
    expect(typeof body.nextCheckAt).toBe('string');
  });

  it('rejects a window that never intersects the cron', async () => {
    const response = await create({
      url: 'https://example.com',
      schedule: { cron: '0 12 * * 0', window: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request', field: 'schedule.window' });
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

  it('rejects a trigger selector alongside includeSelectors', async () => {
    const response = await create({
      url: 'https://example.com',
      schedule: '0 * * * *',
      scrapeOptions: { includeSelectors: ['#price'] },
      trigger: { selector: 'main' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('trigger.selector');
  });

  it('accepts jsonOptions and echoes the schema back', async () => {
    const response = await create({
      url: 'https://example.com',
      schedule: '0 * * * *',
      jsonOptions: { schema: { type: 'object', properties: { price: { type: 'number' } } } },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().jsonOptions).toEqual({
      schema: { type: 'object', properties: { price: { type: 'number' } } },
    });
  });

  // Every other route validating a provider name uses this enum. Here it was a
  // bare string, so an unknown name was stored and only failed later, on a
  // scheduled check, where the caller sees it as lastError rather than a 400.
  it('rejects a jsonOptions provider outside the supported set', async () => {
    const response = await create({
      url: 'https://example.com',
      schedule: '0 * * * *',
      jsonOptions: { schema: { type: 'object' }, provider: 'not-a-provider' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request' });
    expect(response.json().field).toBe('jsonOptions.provider');
  });

  it('accepts a supported jsonOptions provider', async () => {
    const response = await create({
      url: 'https://example.com',
      schedule: '0 * * * *',
      jsonOptions: { schema: { type: 'object' }, provider: 'anthropic' },
    });
    expect(response.statusCode).toBe(201);
  });

  it('rejects a jsonOptions schema with fabrication-inviting length keywords', async () => {
    const response = await create({
      url: 'https://example.com',
      schedule: '0 * * * *',
      jsonOptions: { schema: { type: 'array', minItems: 3 } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('jsonOptions.schema.minItems');
  });

  it('refuses webhooks aimed inside the deployment', async () => {
    for (const url of [
      'http://127.0.0.1:7400/internal/keys',
      'http://localhost:7401/',
      'http://10.0.0.5:9200/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]:7400/',
      'http://[::ffff:192.168.1.1]/',
      'ftp://example.com/x',
    ]) {
      const response = await create({ url: 'https://example.com', schedule: '0 * * * *', webhook: url });
      expect(response.statusCode, url).toBe(400);
      expect(response.json().field).toBe('webhook.url');
    }
    const ok = await create({ url: 'https://example.com', schedule: '0 * * * *', webhook: { url: 'https://hooks.test/x' } });
    expect(ok.statusCode).toBe(201);
  });
});

describe('GET /v1/monitor and /v1/monitor/:id', () => {
  it('lists and reads monitors, including the latest snapshot once one exists', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *' })).json();

    const list = await app.inject({ method: 'GET', url: '/v1/monitor' });
    expect(list.json().monitors).toHaveLength(1);
    // The list is capped; a caller must be able to tell a short list from a cut one.
    expect(list.json().truncated).toBe(false);

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

  it('keeps a trigger selector when only scrapeOptions are patched', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *', trigger: { selector: 'main' } })).json();

    const patched = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { scrapeOptions: { tier: 'chromium' } } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().trigger).toEqual({ selector: 'main' });
    expect(patched.json().scrapeOptions).toEqual({ tier: 'chromium' });

    const conflict = await app.inject({
      method: 'PATCH',
      url: `/v1/monitor/${id}`,
      payload: { scrapeOptions: { includeSelectors: ['#price'] } },
    });
    expect(conflict.statusCode).toBe(400);
    expect(conflict.json().field).toBe('trigger.selector');

    const bad = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { webhook: 'http://192.168.0.1/' } });
    expect(bad.statusCode).toBe(400);
  });

  it('keeps the stored diff granularity when only inline is patched', async () => {
    const { id } = (
      await create({ url: 'https://example.com', schedule: '0 * * * *', diff: { granularity: 'line', inline: false } })
    ).json();

    const patched = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { diff: { inline: true } } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().diff).toEqual({ granularity: 'line', inline: true });
  });

  it('does not re-arm a monitor whose check is running when the schedule changes', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *' })).json();
    await store.claim(id, new Date());

    const patched = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { schedule: { every: '1d' } } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().schedule.cron).toBe('0 0 * * *');
    expect(patched.json().nextCheckAt).toBeNull();

    // Pausing during the run sticks; resuming sets a time again.
    const paused = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { status: 'paused' } });
    expect(paused.json().nextCheckAt).toBeNull();
    const resumed = await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { status: 'active' } });
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

describe('ownership', () => {
  it('hides every monitor route from a key that did not create it', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/monitor',
      headers: { 'x-test-key': KEY_A },
      payload: { url: 'https://example.com', schedule: '0 * * * *', webhook: 'https://hooks.test/x' },
    });
    const id = created.json().id as string;
    await app.inject({ method: 'POST', url: `/v1/monitor/${id}/check`, headers: { 'x-test-key': KEY_A } });
    const delivery = await store.enqueueDelivery({ monitorId: id, url: 'https://hooks.test/x', eventType: 'changed', payload: {}, dedupeKey: 'own' });
    const snapshotId = (await store.latestSnapshot(id))?.id;

    const mine = await app.inject({ method: 'GET', url: '/v1/monitor', headers: { 'x-test-key': KEY_B } });
    expect(mine.json().monitors).toHaveLength(0);

    const attempts: [string, string][] = [
      ['GET', `/v1/monitor/${id}`],
      ['PATCH', `/v1/monitor/${id}`],
      ['DELETE', `/v1/monitor/${id}`],
      ['GET', `/v1/monitor/${id}/history`],
      ['GET', `/v1/monitor/${id}/snapshots/${snapshotId}`],
      ['POST', `/v1/monitor/${id}/check`],
      ['GET', `/v1/monitor/${id}/deliveries`],
      ['POST', `/v1/monitor/${id}/deliveries/${delivery!.id}/replay`],
    ];
    for (const [method, url] of attempts) {
      const response = await app.inject({
        method: method as 'GET',
        url,
        headers: { 'x-test-key': KEY_B },
        ...(method === 'PATCH' ? { payload: { webhook: 'https://attacker.test/x' } } : {}),
      });
      expect(response.statusCode, `${method} ${url}`).toBe(404);
    }

    // Nothing changed for the owner.
    const still = await app.inject({ method: 'GET', url: `/v1/monitor/${id}`, headers: { 'x-test-key': KEY_A } });
    expect(still.statusCode).toBe(200);
    expect(still.json().webhook.url).toBe('https://hooks.test/x');
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

  it('validates the history limit instead of silently coercing a bad value', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *' })).json();

    for (const limit of ['0', 'abc', '1.9', '-5']) {
      const response = await app.inject({ method: 'GET', url: `/v1/monitor/${id}/history?limit=${limit}` });
      expect(response.statusCode, `limit=${limit}`).toBe(400);
      expect(response.json().field).toBe('limit');
    }

    const ten = await app.inject({ method: 'GET', url: `/v1/monitor/${id}/history?limit=10` });
    expect(ten.statusCode).toBe(200);

    const absent = await app.inject({ method: 'GET', url: `/v1/monitor/${id}/history` });
    expect(absent.statusCode).toBe(200);
  });

  it('refuses to check a paused monitor or one already mid-check', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *' })).json();

    await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { status: 'paused' } });
    const paused = await app.inject({ method: 'POST', url: `/v1/monitor/${id}/check` });
    expect(paused.statusCode).toBe(409);
    expect(paused.json().error).toBe('monitor_paused');
    expect(store.checks).toHaveLength(0);

    await app.inject({ method: 'PATCH', url: `/v1/monitor/${id}`, payload: { status: 'active' } });
    let release!: () => void;
    const gate = new Promise<FetchOutcome>((resolve) => {
      release = () => resolve({ ok: true, content: 'slow page' });
    });
    page = () => gate;

    const first = app.inject({ method: 'POST', url: `/v1/monitor/${id}/check` });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await app.inject({ method: 'POST', url: `/v1/monitor/${id}/check` });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('check_in_progress');

    release();
    expect((await first).statusCode).toBe(200);
    expect(store.checks).toHaveLength(1);
    expect(typeof (await app.inject({ method: 'GET', url: `/v1/monitor/${id}` })).json().nextCheckAt).toBe('string');
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

  it('answers 404 for a delivery that does not exist, not "only dead-lettered"', async () => {
    const { id } = (await create({ url: 'https://example.com', schedule: '0 * * * *', webhook: 'https://hooks.test/x' })).json();

    const unknown = await app.inject({ method: 'POST', url: `/v1/monitor/${id}/deliveries/999999/replay` });

    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: 'not_found' });
  });
});
