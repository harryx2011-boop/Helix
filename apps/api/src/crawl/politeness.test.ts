import { describe, expect, it } from 'vitest';
import { PolitenessController } from './politeness.js';

describe('PolitenessController', () => {
  it('allows requests up to the current concurrency', () => {
    const controller = new PolitenessController({ initialConcurrency: 3 });

    expect(controller.tryAcquire('a.com').allowed).toBe(true);
    expect(controller.tryAcquire('a.com').allowed).toBe(true);
    expect(controller.tryAcquire('a.com').allowed).toBe(true);
    expect(controller.tryAcquire('a.com').allowed).toBe(false);
  });

  it('keeps hosts independent', () => {
    const controller = new PolitenessController({ initialConcurrency: 1 });

    controller.tryAcquire('a.com');
    expect(controller.tryAcquire('a.com').allowed).toBe(false);
    // One slow host must not throttle a crawl across every other host.
    expect(controller.tryAcquire('b.com').allowed).toBe(true);
  });

  it('collapses to the floor on a 429 and honours Retry-After', () => {
    const controller = new PolitenessController({ initialConcurrency: 8, minConcurrency: 1 });
    const now = 1_000_000;

    controller.tryAcquire('a.com', now);
    controller.release('a.com', { statusCode: 429, latencyMs: 100, retryAfterSeconds: 30 }, now);

    expect(controller.concurrencyFor('a.com')).toBe(1);

    // An explicit rate-limit signal is obeyed, not interpreted.
    const blocked = controller.tryAcquire('a.com', now + 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.waitMs).toBeGreaterThan(25_000);

    expect(controller.tryAcquire('a.com', now + 31_000).allowed).toBe(true);
  });

  it('halves concurrency on a server error', () => {
    const controller = new PolitenessController({ initialConcurrency: 8 });

    controller.tryAcquire('a.com');
    controller.release('a.com', { statusCode: 500, latencyMs: 100 });

    expect(controller.concurrencyFor('a.com')).toBe(4);
  });

  it('ramps up only after sustained success', () => {
    const controller = new PolitenessController({ initialConcurrency: 2, maxConcurrency: 10 });

    for (let i = 0; i < 8; i++) {
      controller.tryAcquire('a.com');
      controller.release('a.com', { statusCode: 200, latencyMs: 100 });
    }

    // Additive increase: one extra slot, not a jump back to the ceiling.
    expect(controller.concurrencyFor('a.com')).toBe(3);
  });

  it('never exceeds the ceiling', () => {
    const controller = new PolitenessController({ initialConcurrency: 2, maxConcurrency: 3 });

    for (let i = 0; i < 100; i++) {
      controller.tryAcquire('a.com');
      controller.release('a.com', { statusCode: 200, latencyMs: 50 });
    }

    expect(controller.concurrencyFor('a.com')).toBeLessThanOrEqual(3);
  });

  it('backs off when latency degrades sharply', () => {
    const controller = new PolitenessController({ initialConcurrency: 8 });

    // Establish a baseline the spike can be measured against.
    for (let i = 0; i < 10; i++) {
      controller.tryAcquire('a.com');
      controller.release('a.com', { statusCode: 200, latencyMs: 100 });
    }
    const before = controller.concurrencyFor('a.com');

    controller.tryAcquire('a.com');
    controller.release('a.com', { statusCode: 200, latencyMs: 5_000 });

    expect(controller.concurrencyFor('a.com')).toBeLessThan(before);
  });

  it('does not mistake normal variance for degradation', () => {
    const controller = new PolitenessController({ initialConcurrency: 4 });

    for (let i = 0; i < 10; i++) {
      controller.tryAcquire('a.com');
      controller.release('a.com', { statusCode: 200, latencyMs: 100 + (i % 3) * 20 });
    }

    expect(controller.concurrencyFor('a.com')).toBeGreaterThanOrEqual(4);
  });

  it('serialises and paces a host that declares a crawl-delay', () => {
    const controller = new PolitenessController({ initialConcurrency: 8 });
    const now = 2_000_000;

    controller.setCrawlDelay('a.com', 2);

    // A site asking to be paced gets one request at a time, spaced as asked —
    // its stated wish outranks whatever adaptation would have chosen.
    expect(controller.concurrencyFor('a.com')).toBe(1);
    expect(controller.tryAcquire('a.com', now).allowed).toBe(true);

    controller.release('a.com', { statusCode: 200, latencyMs: 50 }, now);
    expect(controller.tryAcquire('a.com', now + 500).allowed).toBe(false);
    expect(controller.tryAcquire('a.com', now + 2_100).allowed).toBe(true);
  });

  it('does not ramp a host that declared a crawl-delay', () => {
    const controller = new PolitenessController({ initialConcurrency: 8, maxConcurrency: 16 });
    controller.setCrawlDelay('a.com', 1);

    let now = 3_000_000;
    for (let i = 0; i < 20; i++) {
      controller.tryAcquire('a.com', now);
      controller.release('a.com', { statusCode: 200, latencyMs: 50 }, now);
      now += 1_100;
    }

    expect(controller.concurrencyFor('a.com')).toBe(1);
  });
});

describe('PolitenessController — block evidence', () => {
  it('collapses to the floor on a block verdict served as 200', () => {
    const controller = new PolitenessController({ initialConcurrency: 8, minConcurrency: 1 });
    const now = 5_000_000;

    controller.tryAcquire('a.com', now);
    // A Cloudflare interstitial arrives as 200. Reading the status alone would
    // score this as a healthy fetch and ramp straight into the wall.
    controller.release('a.com', { statusCode: 200, latencyMs: 80, blocked: true }, now);

    expect(controller.concurrencyFor('a.com')).toBe(1);
    expect(controller.tryAcquire('a.com', now + 1_000).allowed).toBe(false);
  });

  it('pauses far longer for a block than for a 429', () => {
    const blocked = new PolitenessController({ initialConcurrency: 4 });
    const limited = new PolitenessController({ initialConcurrency: 4 });
    const now = 6_000_000;

    blocked.tryAcquire('a.com', now);
    blocked.release('a.com', { statusCode: 200, latencyMs: 50, blocked: true }, now);

    limited.tryAcquire('a.com', now);
    limited.release('a.com', { statusCode: 429, latencyMs: 50 }, now);

    expect(blocked.tryAcquire('a.com', now + 1).waitMs).toBeGreaterThan(
      limited.tryAcquire('a.com', now + 1).waitMs,
    );
  });

  it('obeys a Retry-After longer than the block backoff', () => {
    const controller = new PolitenessController({ initialConcurrency: 4 });
    const now = 7_000_000;

    controller.tryAcquire('a.com', now);
    controller.release(
      'a.com',
      { statusCode: 403, latencyMs: 50, blocked: true, retryAfterSeconds: 120 },
      now,
    );

    // The host stated a number. Guessing shorter than asked is what earns the
    // next block, so the stated value wins over our own default.
    expect(controller.tryAcquire('a.com', now + 60_000).allowed).toBe(false);
    expect(controller.tryAcquire('a.com', now + 121_000).allowed).toBe(true);
  });

  it('holds a blocked host down through a long run of successes', () => {
    const controller = new PolitenessController({ initialConcurrency: 8, maxConcurrency: 16 });
    let now = 8_000_000;

    controller.tryAcquire('a.com', now);
    controller.release('a.com', { statusCode: 200, latencyMs: 50, blocked: true }, now);
    now += 60_000;

    // Enough clean fetches to have ramped twice were this an ordinary recovery.
    for (let i = 0; i < 16; i++) {
      controller.tryAcquire('a.com', now);
      controller.release('a.com', { statusCode: 200, latencyMs: 50 }, now);
      now += 10;
    }

    expect(controller.onProbation('a.com')).toBe(true);
    expect(controller.concurrencyFor('a.com')).toBe(1);
  });

  it('ramps again once probation is served', () => {
    const controller = new PolitenessController({ initialConcurrency: 8, maxConcurrency: 16 });
    let now = 9_000_000;

    controller.tryAcquire('a.com', now);
    controller.release('a.com', { statusCode: 200, latencyMs: 50, blocked: true }, now);
    now += 60_000;

    for (let i = 0; i < 40; i++) {
      controller.tryAcquire('a.com', now);
      controller.release('a.com', { statusCode: 200, latencyMs: 50 }, now);
      now += 10;
    }

    // Recovery is real, not permanent punishment — a host that blocked once and
    // has behaved since should not be crawled at one request forever.
    expect(controller.onProbation('a.com')).toBe(false);
    expect(controller.concurrencyFor('a.com')).toBeGreaterThan(1);
  });

  it('counts blocks per host without punishing the rest', () => {
    const controller = new PolitenessController({ initialConcurrency: 4 });

    controller.tryAcquire('a.com');
    controller.release('a.com', { statusCode: 200, latencyMs: 50, blocked: true });

    expect(controller.concurrencyFor('b.com')).toBe(4);
    expect(controller.stats().blockedHosts).toBe(1);
    expect(controller.stats().blocks).toBe(1);
  });
});

describe('PolitenessController — clamps', () => {
  it('never backs off below the configured floor', () => {
    const controller = new PolitenessController({ initialConcurrency: 8, minConcurrency: 3 });

    for (let i = 0; i < 20; i++) {
      controller.tryAcquire('a.com');
      controller.release('a.com', { statusCode: 500, latencyMs: 50 });
    }

    expect(controller.concurrencyFor('a.com')).toBe(3);
  });

  it('holds the floor even against an explicit rate-limit signal', () => {
    const controller = new PolitenessController({ initialConcurrency: 8, minConcurrency: 2 });

    controller.tryAcquire('a.com');
    controller.release('a.com', { statusCode: 429, latencyMs: 50 });

    // The floor is the operator saying "never go slower than this". A 429
    // collapses to it, not through it.
    expect(controller.concurrencyFor('a.com')).toBe(2);
  });

  it('starts no higher than the ceiling when the initial value exceeds it', () => {
    // An operator lowering maxHostConcurrency below a default initial value
    // would otherwise run the whole crawl above the ceiling they just set.
    const controller = new PolitenessController({ initialConcurrency: 50, maxConcurrency: 4 });

    expect(controller.concurrencyFor('a.com')).toBe(4);
  });

  it('starts no lower than the floor when the initial value is under it', () => {
    const controller = new PolitenessController({ initialConcurrency: 1, minConcurrency: 5 });

    expect(controller.concurrencyFor('a.com')).toBe(5);
  });

  it('resolves an inverted floor and ceiling rather than running unbounded', () => {
    // Two settings written at different times can contradict each other. The
    // ceiling wins, because it is the one that bounds harm to the target host.
    const controller = new PolitenessController({ minConcurrency: 20, maxConcurrency: 3 });

    expect(controller.concurrencyFor('a.com')).toBe(3);

    for (let i = 0; i < 50; i++) {
      controller.tryAcquire('a.com');
      controller.release('a.com', { statusCode: 200, latencyMs: 20 });
    }
    expect(controller.concurrencyFor('a.com')).toBeLessThanOrEqual(3);
  });

  it('treats a zero or negative ceiling as one, never as no limit', () => {
    const controller = new PolitenessController({ maxConcurrency: 0 });

    expect(controller.concurrencyFor('a.com')).toBe(1);
    expect(controller.tryAcquire('a.com').allowed).toBe(true);
    expect(controller.tryAcquire('a.com').allowed).toBe(false);
  });
});
