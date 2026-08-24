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

function fakeDb(claimed: DeliveryRow[]): Queryable & { updates: { text: string; values: unknown[] }[] } {
  const updates: { text: string; values: unknown[] }[] = [];
  return {
    updates,
    query: vi.fn(async (text: string, values?: unknown[]) => {
      if (text.includes('RETURNING id, job_id')) return { rows: claimed as never[], rowCount: claimed.length };
      updates.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 1 };
    }) as Queryable['query'],
  };
}

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
  it('posts the payload with event headers and marks a 2xx delivered', async () => {
    const db = fakeDb([row()]);
    const fetchFn = fakeFetch(200);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, now: () => 1_700_000_000_000 });

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
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn, secret: 'whsec_x', now: () => now });

    await dispatcher.runOnce();

    const call = fetchFn.calls[0]!;
    const headers = call.init.headers as Record<string, string>;
    expect(verifySignature('whsec_x', headers['helix-signature']!, String(call.init.body), { now: now / 1000 })).toBe(true);
  });

  it('schedules a retry with backoff on a non-2xx', async () => {
    const db = fakeDb([row({ attempts: 2 })]);
    const dispatcher = new WebhookDispatcher({ db, fetch: fakeFetch(503) });

    const [outcome] = await dispatcher.runOnce();

    expect(outcome).toMatchObject({ status: 'retry', attempts: 3, statusCode: 503, error: 'HTTP 503' });
    const update = db.updates[0]!;
    expect(update.text).toContain('next_retry_at');
    expect(update.values).toEqual([7, 3, 'HTTP 503', retryDelayMs(3)]);
  });

  it('treats a network failure like a failed attempt', async () => {
    const db = fakeDb([row()]);
    const dispatcher = new WebhookDispatcher({ db, fetch: fakeFetch(new Error('ECONNREFUSED')) });

    const [outcome] = await dispatcher.runOnce();

    expect(outcome).toMatchObject({ status: 'retry', attempts: 1, error: 'ECONNREFUSED' });
  });

  it('dead-letters after the attempt ceiling instead of retrying forever', async () => {
    const db = fakeDb([row({ attempts: 4 })]);
    const dispatcher = new WebhookDispatcher({ db, fetch: fakeFetch(500), maxAttempts: 5 });

    const [outcome] = await dispatcher.runOnce();

    expect(outcome).toMatchObject({ status: 'dead', attempts: 5 });
    expect(db.updates[0]!.text).toContain("status = 'dead'");
  });

  it('does nothing when nothing is due', async () => {
    const db = fakeDb([]);
    const fetchFn = fakeFetch(200);
    const dispatcher = new WebhookDispatcher({ db, fetch: fetchFn });

    expect(await dispatcher.runOnce()).toEqual([]);
    expect(fetchFn.calls).toHaveLength(0);
  });
});
