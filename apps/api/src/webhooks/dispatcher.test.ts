import { describe, expect, it, vi } from 'vitest';
import { WebhookDispatcher, type DeliveryRow } from './dispatcher.js';
import { retryDelayMs, type Queryable } from './deliveries.js';
import { verifySignature } from './signature.js';

function row(over: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    id: 7,
    job_id: 'job-1',
    monitor_id: null,
    url: 'https://h.example/hook',
    event_type: 'page',
    payload: {
      event: 'page',
      jobId: 'job-1',
      monitorId: null,
      data: { url: 'https://s.com/a', markdown: '# A' },
      metadata: { tenant: 'a' },
      headers: { 'x-tenant': 'a' },
    },
    attempts: 0,
    created_at: new Date('2026-08-24T00:00:00Z'),
    ...over,
  };
}

function fakeDb(
  claimed: DeliveryRow[],
  documents: Record<string, string> = {},
): Queryable & { updates: { text: string; values: unknown[] }[]; reads: unknown[][] } {
  const updates: { text: string; values: unknown[] }[] = [];
  const reads: unknown[][] = [];
  return {
    updates,
    reads,
    query: vi.fn(async (text: string, values?: unknown[]) => {
      if (text.includes('RETURNING id, job_id')) return { rows: claimed as never[], rowCount: claimed.length };
      if (text.includes('FROM documents')) {
        reads.push(values ?? []);
        const markdown = documents[String(values?.[1])];
        return { rows: markdown === undefined ? [] : ([{ markdown }] as never[]), rowCount: 1 };
      }
      if (text.startsWith('DELETE FROM webhook_deliveries')) {
        updates.push({ text, values: values ?? [] });
        return { rows: [], rowCount: 3 };
      }
      updates.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 1 };
    }) as Queryable['query'],
  };
}

/** Every test target resolves publicly; DNS is not what is under test. */
const resolve = async () => ['93.184.216.34'];

function fakeFetch(status: number | Error): typeof fetch & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (status instanceof Error) throw status;
    return new Response('', { status });
  }) as unknown as typeof fetch & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

describe('WebhookDispatcher', () => {
  // An unread body holds its socket open until the stream is collected.
  it('drains the response body so the connection is released', async () => {
    const db = fakeDb([row()]);
    let cancelled = false;
    const body = new ReadableStream({ cancel: () => void (cancelled = true) });
    const fetchFn = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve });

    await dispatcher.runOnce();

    expect(cancelled).toBe(true);
  });

  it('posts the payload with event headers and marks a 2xx delivered', async () => {
    const db = fakeDb([row()]);
    const fetchFn = fakeFetch(200);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve, now: () => 1_700_000_000_000 });

    const outcomes = await dispatcher.runOnce();

    expect(outcomes).toEqual([{ id: 7, status: 'delivered', attempts: 1, statusCode: 200 }]);
    const call = fetchFn.calls[0]!;
    expect(call.url).toBe('https://h.example/hook');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['helix-event']).toBe('page');
    expect(headers['helix-delivery-id']).toBe('7');
    expect(headers['x-tenant']).toBe('a');
    expect(headers['helix-signature']).toBeUndefined();

    const body = JSON.parse(String(call.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: '7',
      event: 'page',
      jobId: 'job-1',
      timestamp: '2023-11-14T22:13:20.000Z',
      data: { url: 'https://s.com/a' },
      metadata: { tenant: 'a' },
    });

    expect(db.updates[0]!.text).toContain("status = 'delivered'");
  });

  it('signs deliveries when a secret is configured', async () => {
    const db = fakeDb([row()]);
    const fetchFn = fakeFetch(204);
    const now = 1_700_000_000_000;
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, secret: 'whsec_x', resolve, now: () => now });

    await dispatcher.runOnce();

    const call = fetchFn.calls[0]!;
    const headers = call.init.headers as Record<string, string>;
    expect(verifySignature('whsec_x', headers['helix-signature']!, String(call.init.body), { now: now / 1000 })).toBe(true);
  });

  it('schedules a retry with backoff on a non-2xx', async () => {
    const db = fakeDb([row({ attempts: 2 })]);
    const dispatcher = new WebhookDispatcher({ db, fetch: fakeFetch(503), resolve });

    const [outcome] = await dispatcher.runOnce();

    expect(outcome).toMatchObject({ status: 'retry', attempts: 3, statusCode: 503, error: 'HTTP 503' });
    const update = db.updates[0]!;
    expect(update.text).toContain('next_retry_at');
    expect(update.values).toEqual([7, 3, 'HTTP 503', retryDelayMs(3)]);
  });

  it('treats a network failure like a failed attempt', async () => {
    const db = fakeDb([row()]);
    const refused = new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) });
    const dispatcher = new WebhookDispatcher({ db, fetch: fakeFetch(refused), resolve });

    const [outcome] = await dispatcher.runOnce();

    expect(outcome).toMatchObject({ status: 'retry', attempts: 1, error: 'fetch failed' });
  });

  it('dead-letters a request fetch refuses to send instead of retrying it twenty times', async () => {
    const db = fakeDb([row({ payload: { ...row().payload, headers: { 'bad header': 'x' } } })]);
    const dispatcher = new WebhookDispatcher({ db, fetch: fakeFetch(new TypeError('invalid header name')), resolve });

    const [outcome] = await dispatcher.runOnce();

    expect(outcome).toMatchObject({ status: 'dead', attempts: 1, error: 'invalid header name' });
    expect(db.updates[0]!.text).toContain("status = 'dead'");
  });

  it('dead-letters a 4xx on the first attempt but retries a 429', async () => {
    const gone = new WebhookDispatcher({ db: fakeDb([row()]), fetch: fakeFetch(410), resolve });
    expect((await gone.runOnce())[0]).toMatchObject({ status: 'dead', attempts: 1, statusCode: 410 });

    const throttled = new WebhookDispatcher({ db: fakeDb([row()]), fetch: fakeFetch(429), resolve });
    expect((await throttled.runOnce())[0]).toMatchObject({ status: 'retry', attempts: 1, statusCode: 429 });
  });

  it('does not follow a redirect, and dead-letters it', async () => {
    const db = fakeDb([row()]);
    const fetchFn = fakeFetch(302);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve });

    const [outcome] = await dispatcher.runOnce();

    expect(fetchFn.calls[0]!.init.redirect).toBe('manual');
    expect(outcome).toMatchObject({ status: 'dead', statusCode: 302 });
  });

  it('names the redirect target in the dead-letter error so the receiver knows what to fix', async () => {
    const db = fakeDb([row()]);
    const fetchFn = vi.fn(async () => new Response('', { status: 302, headers: { location: 'https://h.example/hook/new' } })) as unknown as typeof fetch;
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve });

    const [outcome] = await dispatcher.runOnce();

    expect(outcome).toMatchObject({
      status: 'dead',
      statusCode: 302,
      error: 'HTTP 302 redirect to https://h.example/hook/new not followed; update the webhook URL',
    });
  });

  it('refuses a target that resolves to a private address without sending', async () => {
    const db = fakeDb([row()]);
    const fetchFn = fakeFetch(200);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve: async () => ['10.0.0.5'] });

    const [outcome] = await dispatcher.runOnce();

    expect(fetchFn.calls).toHaveLength(0);
    expect(outcome).toMatchObject({ status: 'dead', attempts: 1, error: 'target resolves to a private or loopback address' });
  });

  it('never lets a caller header replace the ones Helix sets', async () => {
    const db = fakeDb([
      row({ payload: { ...row().payload, headers: { 'content-type': 'text/plain', 'helix-event': 'completed', host: 'x' } } }),
    ]);
    const fetchFn = fakeFetch(200);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve });

    await dispatcher.runOnce();

    const headers = fetchFn.calls[0]!.init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['helix-event']).toBe('page');
  });

  it('reads the page markdown from documents at send time', async () => {
    const queued = row({ payload: { ...row().payload, data: { url: 'https://s.com/a', metadata: { title: 'A' } } } });
    const db = fakeDb([queued], { 'https://s.com/a': '# A from documents' });
    const fetchFn = fakeFetch(200);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve });

    await dispatcher.runOnce();

    expect(db.reads[0]).toEqual(['job-1', 'https://s.com/a']);
    const body = JSON.parse(String(fetchFn.calls[0]!.init.body)) as { data: Record<string, unknown> };
    expect(body.data).toEqual({ url: 'https://s.com/a', markdown: '# A from documents', metadata: { title: 'A' } });
  });

  it('lets the hydrated markdown win over a stale null already on the page', async () => {
    const queued = row({ payload: { ...row().payload, data: { url: 'https://s.com/a', markdown: null } } });
    const db = fakeDb([queued], { 'https://s.com/a': '# A from documents' });
    const fetchFn = fakeFetch(200);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve });

    await dispatcher.runOnce();

    const body = JSON.parse(String(fetchFn.calls[0]!.init.body)) as { data: Record<string, unknown> };
    expect(body.data['markdown']).toBe('# A from documents');
  });

  it('sends null markdown for a page that is no longer stored', async () => {
    const queued = row({ payload: { ...row().payload, data: { url: 'https://s.com/gone' } } });
    const db = fakeDb([queued]);
    const fetchFn = fakeFetch(200);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve });

    await dispatcher.runOnce();

    const body = JSON.parse(String(fetchFn.calls[0]!.init.body)) as { data: Record<string, unknown> };
    expect(body.data['markdown']).toBeNull();
  });

  it('purges settled rows past retention, at most once an hour', async () => {
    const db = fakeDb([]);
    let now = 1_700_000_000_000;
    const dispatcher = new WebhookDispatcher({ db, fetch: fakeFetch(200), resolve, retentionHours: 168, now: () => now });

    expect(await dispatcher.purgeIfDue()).toBe(3);
    expect(db.updates[0]!.text).toContain('DELETE FROM webhook_deliveries');
    expect(db.updates[0]!.values).toEqual([168]);

    now += 30 * 60 * 1000;
    expect(await dispatcher.purgeIfDue()).toBe(0);
    now += 31 * 60 * 1000;
    expect(await dispatcher.purgeIfDue()).toBe(3);
  });

  it('never purges when no retention is configured', async () => {
    const db = fakeDb([]);
    const dispatcher = new WebhookDispatcher({ db, fetch: fakeFetch(200), resolve });

    expect(await dispatcher.purgeIfDue()).toBe(0);
    expect(db.updates).toHaveLength(0);
  });

  it('dead-letters after the attempt ceiling instead of retrying forever', async () => {
    const db = fakeDb([row({ attempts: 4 })]);
    const dispatcher = new WebhookDispatcher({ db, fetch: fakeFetch(500), maxAttempts: 5, resolve });

    const [outcome] = await dispatcher.runOnce();

    expect(outcome).toMatchObject({ status: 'dead', attempts: 5 });
    expect(db.updates[0]!.text).toContain("status = 'dead'");
  });

  it('does nothing when nothing is due', async () => {
    const db = fakeDb([]);
    const fetchFn = fakeFetch(200);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, resolve });

    expect(await dispatcher.runOnce()).toEqual([]);
    expect(fetchFn.calls).toHaveLength(0);
  });
});
