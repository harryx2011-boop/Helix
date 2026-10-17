import { describe, expect, it } from 'vitest';
import { HostGate, gateOutcome } from './host-gate.js';
import type { PipelineFailure } from './pipeline.js';
import { PolitenessController } from '../crawl/politeness.js';

/** Resolves on the next macrotask, so queued work gets a chance to start. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Longer than the gate's 50 ms poll, so a freed slot is actually taken up. */
const poll = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 70));

describe('HostGate', () => {
  it('runs requests to one host up to its concurrency and queues the rest', async () => {
    const gate = new HostGate({
      politeness: new PolitenessController({ initialConcurrency: 2, maxConcurrency: 2 }),
    });

    let active = 0;
    let peak = 0;
    const release: (() => void)[] = [];

    const calls = [1, 2, 3, 4].map(() =>
      gate.run('https://example.com/page', async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => release.push(resolve));
        active--;
        return { statusCode: 200 };
      }),
    );

    await tick();
    expect(peak).toBe(2);

    // One release per call, waiting out the gate's poll each time so the next
    // queued call actually picks the freed slot up.
    for (let i = 0; i < calls.length; i++) {
      release.pop()?.();
      await poll();
    }
    await Promise.all(calls);

    // Four requests ran, never more than two at once.
    expect(peak).toBe(2);
  });

  it('does not make a request to one host wait behind a request to another', async () => {
    const gate = new HostGate({
      politeness: new PolitenessController({ initialConcurrency: 1, maxConcurrency: 1 }),
    });

    let active = 0;
    let peak = 0;
    const release: (() => void)[] = [];

    const busy = (url: string): Promise<unknown> =>
      gate.run(url, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => release.push(resolve));
        active--;
        return {};
      });

    const calls = [busy('https://one.example/a'), busy('https://two.example/b')];
    await tick();

    // One slot each, so both run: the limit is per host, not global.
    expect(peak).toBe(2);

    while (release.length > 0) {
      release.pop()?.();
      await tick();
    }
    await Promise.all(calls);
  });

  it('reports a 429 to the controller, so the next call to that host is slowed', async () => {
    const politeness = new PolitenessController({ initialConcurrency: 4, maxConcurrency: 8 });
    const gate = new HostGate({ politeness });

    await gate.run(
      'https://example.com/page',
      async () => ({ statusCode: 429 }),
      (value) => ({ statusCode: value.statusCode }),
    );

    expect(politeness.concurrencyFor('example.com')).toBe(1);
  });

  it('reports a block served as 200, which a status code alone would miss', async () => {
    const politeness = new PolitenessController();
    const gate = new HostGate({ politeness });

    await gate.run(
      'https://example.com/page',
      async () => ({ statusCode: 200, blocked: true }),
      (value) => ({ statusCode: value.statusCode, blocked: value.blocked }),
    );

    expect(politeness.stats().blockedHosts).toBe(1);
  });

  it('returns the slot when the request throws, so one failure does not wedge the host', async () => {
    const politeness = new PolitenessController({ initialConcurrency: 1, maxConcurrency: 1 });
    const gate = new HostGate({ politeness });

    await expect(
      gate.run('https://example.com/page', async () => {
        throw new Error('render failed');
      }),
    ).rejects.toThrow('render failed');

    expect(politeness.inFlightFor('example.com')).toBe(0);
  });

  it('goes ahead once the wait runs out, rather than failing a request the caller asked for', async () => {
    const politeness = new PolitenessController({ initialConcurrency: 1, maxConcurrency: 1 });
    const gate = new HostGate({ politeness, maxWaitMs: 30 });

    // Hold the only slot without ever releasing it.
    politeness.tryAcquire('example.com');

    await expect(gate.run('https://example.com/page', async () => 'served')).resolves.toBe('served');
  });

  it('goes ahead at once when the host asks for longer than the wait allows', async () => {
    const politeness = new PolitenessController();
    const gate = new HostGate({ politeness, maxWaitMs: 2_000 });

    // A stated Retry-After of a minute: no amount of waiting inside the ceiling helps.
    politeness.tryAcquire('example.com');
    politeness.release('example.com', { latencyMs: 1, statusCode: 429, retryAfterSeconds: 60 });

    const started = Date.now();
    await expect(gate.run('https://example.com/page', async () => 'served')).resolves.toBe('served');
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('scores a thrown request as a server error, so a flapping endpoint is not ramped up', async () => {
    const politeness = new PolitenessController({ initialConcurrency: 4, maxConcurrency: 8 });
    const gate = new HostGate({ politeness });

    await expect(
      gate.run('https://example.com/page', async () => {
        throw new Error('render failed');
      }),
    ).rejects.toThrow('render failed');

    expect(politeness.concurrencyFor('example.com')).toBe(2);
  });

  it('stops waiting and never runs the request when the caller goes away', async () => {
    const politeness = new PolitenessController({ initialConcurrency: 1, maxConcurrency: 1 });
    const gate = new HostGate({ politeness, maxWaitMs: 5_000 });
    politeness.tryAcquire('example.com');

    const controller = new AbortController();
    let ran = false;
    const call = gate.run(
      'https://example.com/page',
      async () => {
        ran = true;
        return 'served';
      },
      undefined,
      controller.signal,
    );

    const started = Date.now();
    controller.abort(new Error('client gone'));
    await expect(call).rejects.toThrow('client gone');
    expect(Date.now() - started).toBeLessThan(200);
    expect(ran).toBe(false);
  });

  it('tells the request how long it waited, so a timeout can be spent rather than extended', async () => {
    const politeness = new PolitenessController({ initialConcurrency: 1, maxConcurrency: 1 });
    const gate = new HostGate({ politeness });
    politeness.tryAcquire('example.com');
    setTimeout(() => politeness.release('example.com', { latencyMs: 1, statusCode: 200 }), 120);

    const waited = await gate.run('https://example.com/page', async (waitedMs) => waitedMs);

    expect(waited).toBeGreaterThanOrEqual(100);
  });

  it('runs a URL with no parseable host instead of pacing it under one key', async () => {
    const gate = new HostGate();
    await expect(gate.run('not a url', async () => 'served')).resolves.toBe('served');
  });
});

describe('gateOutcome', () => {
  const failure = (over: Partial<PipelineFailure>): PipelineFailure => ({
    success: false,
    url: 'https://example.com/',
    reason: 'timeout',
    detectedBy: [],
    tiersAttempted: ['plain'],
    escalationAvailable: false,
    timingMs: 1,
    ...over,
  });

  it('scores a failure with no response as a server error, so a host that times out is not ramped up', () => {
    expect(gateOutcome(failure({ reason: 'timeout' })).statusCode).toBe(500);
  });

  it('keeps the status the host actually sent', () => {
    expect(gateOutcome(failure({ reason: 'blocked', statusCode: 429, retryAfterSeconds: 5 }))).toEqual({
      statusCode: 429,
      blocked: true,
      retryAfterSeconds: 5,
    });
  });

  it('reads a challenge served as 200 as a block', () => {
    expect(gateOutcome(failure({ reason: 'challenge', statusCode: 200 })).blocked).toBe(true);
  });

  it('does not blame the host for a request the caller abandoned', () => {
    expect(gateOutcome(failure({ reason: 'aborted' })).statusCode).toBeUndefined();
  });
});
