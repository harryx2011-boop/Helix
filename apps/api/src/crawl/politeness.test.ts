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
