import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The recorder and its aggregates against a fake pool. What matters here is
 * that a request is attributed to the right bucket, that a flush failure is
 * survivable, and that the aggregates are computed by the query rather than in
 * JS, so the assertions are mostly about the SQL that goes out.
 */

interface Call {
  text: string;
  values: unknown[];
}

const db = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    fail: false,
    totals: { total: '0', rate_limited: '0', errors: '0' } as Record<string, string>,
    series: [] as Record<string, unknown>[],
    byEndpoint: [] as Record<string, unknown>[],
  };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    if (state.fail) throw new Error('request_usage is missing');
    if (text.includes('AS total')) return { rows: [state.totals], rowCount: 1 };
    if (text.includes('GROUP BY bucket_start')) return { rows: state.series, rowCount: state.series.length };
    if (text.includes('GROUP BY endpoint')) return { rows: state.byEndpoint, rowCount: state.byEndpoint.length };
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));

const { UsageRecorder, hourBucket, normaliseEndpoint, pruneUsage, statusClass, summariseUsage } = await import(
  './usage.js'
);

const KEY = '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const KEY_2 = '1f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

beforeEach(() => {
  db.state.calls = [];
  db.state.fail = false;
  db.state.totals = { total: '0', rate_limited: '0', errors: '0' };
  db.state.series = [];
  db.state.byEndpoint = [];
  db.query.mockClear();
});

describe('statusClass', () => {
  it('separates 429 from other client errors', () => {
    expect(statusClass(429)).toBe('429');
    expect(statusClass(400)).toBe('4xx');
    expect(statusClass(404)).toBe('4xx');
  });

  it('buckets success and server errors', () => {
    expect(statusClass(200)).toBe('2xx');
    expect(statusClass(204)).toBe('2xx');
    expect(statusClass(302)).toBe('2xx');
    expect(statusClass(500)).toBe('5xx');
    expect(statusClass(503)).toBe('5xx');
  });
});

describe('normaliseEndpoint', () => {
  it('strips the version prefix', () => {
    expect(normaliseEndpoint('/v1/scrape')).toBe('/scrape');
  });

  it('collapses uuid and numeric segments so cardinality tracks routes, not traffic', () => {
    expect(normaliseEndpoint(`/v1/jobs/${KEY}`)).toBe('/jobs/:id');
    expect(normaliseEndpoint(`/v1/jobs/${KEY_2}`)).toBe('/jobs/:id');
    expect(normaliseEndpoint('/v1/jobs/12345')).toBe('/jobs/:id');
  });

  it('drops the query string', () => {
    expect(normaliseEndpoint('/v1/search?q=secret')).toBe('/search');
  });

  it('keeps two segments of a nested route', () => {
    expect(normaliseEndpoint('/v1/metadata/scrub')).toBe('/metadata/scrub');
  });

  it('never returns more than two segments', () => {
    expect(normaliseEndpoint('/v1/a/b/c/d/e')).toBe('/a/b');
  });

  it('handles the root', () => {
    expect(normaliseEndpoint('/v1')).toBe('/');
    expect(normaliseEndpoint('/')).toBe('/');
  });
});

describe('hourBucket', () => {
  it('truncates to the hour in UTC', () => {
    expect(hourBucket(new Date('2026-09-04T13:47:12.500Z')).toISOString()).toBe('2026-09-04T13:00:00.000Z');
  });
});

describe('UsageRecorder', () => {
  it('coalesces repeat requests into one row', async () => {
    const recorder = new UsageRecorder();
    const at = new Date('2026-09-04T13:10:00.000Z');
    recorder.record(KEY, '/v1/scrape', 200, at);
    recorder.record(KEY, '/v1/scrape', 200, at);
    recorder.record(KEY, '/v1/scrape', 200, new Date('2026-09-04T13:59:00.000Z'));

    expect(recorder.pendingSize).toBe(1);
    await recorder.flush();

    const insert = db.state.calls.find((c) => c.text.includes('INSERT INTO request_usage'));
    expect(insert).toBeDefined();
    expect(insert?.values).toEqual([KEY, '2026-09-04T13:00:00.000Z', '/scrape', '2xx', 3]);
  });

  it('keeps different status classes apart so 429s stay visible', async () => {
    const recorder = new UsageRecorder();
    const at = new Date('2026-09-04T13:10:00.000Z');
    recorder.record(KEY, '/v1/scrape', 200, at);
    recorder.record(KEY, '/v1/scrape', 429, at);

    expect(recorder.pendingSize).toBe(2);
    await recorder.flush();

    const insert = db.state.calls.find((c) => c.text.includes('INSERT INTO request_usage'));
    expect(insert?.values).toContain('429');
    expect(insert?.values).toContain('2xx');
  });

  it('crosses an hour boundary into a second bucket', () => {
    const recorder = new UsageRecorder();
    recorder.record(KEY, '/v1/scrape', 200, new Date('2026-09-04T13:59:59.000Z'));
    recorder.record(KEY, '/v1/scrape', 200, new Date('2026-09-04T14:00:00.000Z'));
    expect(recorder.pendingSize).toBe(2);
  });

  it('adds to the existing count rather than replacing it', async () => {
    const recorder = new UsageRecorder();
    recorder.record(KEY, '/v1/scrape', 200);
    await recorder.flush();

    const insert = db.state.calls.find((c) => c.text.includes('INSERT INTO request_usage'));
    expect(insert?.text).toContain('request_usage.requests + EXCLUDED.requests');
  });

  it('drains the buffer even when the write fails, so a broken table cannot grow it without limit', async () => {
    const onError = vi.fn();
    const recorder = new UsageRecorder({ onError });
    db.state.fail = true;

    recorder.record(KEY, '/v1/scrape', 200);
    await recorder.flush();

    expect(onError).toHaveBeenCalledOnce();
    expect(recorder.pendingSize).toBe(0);
  });

  it('writes nothing when there is nothing pending', async () => {
    const recorder = new UsageRecorder();
    await recorder.flush();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('flushes early once maxPending is reached', async () => {
    const recorder = new UsageRecorder({ maxPending: 2 });
    recorder.record(KEY, '/v1/scrape', 200);
    recorder.record(KEY, '/v1/search', 200);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(db.state.calls.some((c) => c.text.includes('INSERT INTO request_usage'))).toBe(true);
  });
});

describe('summariseUsage', () => {
  it('queries nothing when the profile owns no keys', async () => {
    const summary = await summariseUsage([], new Date('2026-09-01T00:00:00Z'), new Date('2026-09-04T00:00:00Z'));
    expect(db.query).not.toHaveBeenCalled();
    expect(summary.total).toBe(0);
    expect(summary.series).toEqual([]);
  });

  it('aggregates in the database rather than in JS', async () => {
    db.state.totals = { total: '120', rate_limited: '7', errors: '11' };
    db.state.series = [{ bucket_start: new Date('2026-09-04T13:00:00.000Z'), requests: '120' }];
    db.state.byEndpoint = [{ endpoint: '/scrape', requests: '100' }];

    const summary = await summariseUsage(
      [KEY, KEY_2],
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-09-04T00:00:00Z'),
    );

    expect(summary.total).toBe(120);
    expect(summary.rateLimited).toBe(7);
    expect(summary.errors).toBe(11);
    expect(summary.series).toEqual([{ bucketStart: '2026-09-04T13:00:00.000Z', requests: 120 }]);
    expect(summary.byEndpoint).toEqual([{ endpoint: '/scrape', requests: 100 }]);

    for (const call of db.state.calls) expect(call.text).toContain('SUM(requests)');
  });

  it('scopes every query to the given keys and window', async () => {
    const since = new Date('2026-09-01T00:00:00.000Z');
    const until = new Date('2026-09-04T00:00:00.000Z');
    await summariseUsage([KEY], since, until);

    expect(db.state.calls).toHaveLength(3);
    for (const call of db.state.calls) {
      expect(call.text).toContain('api_key_id = ANY($1::uuid[])');
      expect(call.values).toEqual([[KEY], since.toISOString(), until.toISOString()]);
    }
  });

  it('bounds the per-endpoint breakdown', async () => {
    await summariseUsage([KEY], new Date('2026-09-01T00:00:00Z'), new Date('2026-09-04T00:00:00Z'));
    const breakdown = db.state.calls.find((c) => c.text.includes('GROUP BY endpoint'));
    expect(breakdown?.text).toContain('LIMIT 50');
  });
});

describe('pruneUsage', () => {
  it('deletes only buckets older than the cutoff', async () => {
    const cutoff = new Date('2026-06-06T00:00:00.000Z');
    await pruneUsage(cutoff);
    const call = db.state.calls[0];
    expect(call?.text).toContain('DELETE FROM request_usage WHERE bucket_start < $1');
    expect(call?.values).toEqual([cutoff.toISOString()]);
  });
});
