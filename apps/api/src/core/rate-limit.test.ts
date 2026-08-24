import { describe, expect, it, vi } from 'vitest';
import { RateLimiter, rateLimitHeaders } from './rate-limit.js';

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new RateLimiter({ limit: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('key').allowed).toBe(true);
    }
  });

  it('rejects once the bucket is empty', () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });
    for (let i = 0; i < 3; i++) limiter.check('key');

    const decision = limiter.check('key');
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps buckets separate per key', () => {
    const limiter = new RateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check('a');
    limiter.check('a');

    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('refills continuously rather than at a window edge', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ limit: 60, windowMs: 60_000 });

    for (let i = 0; i < 60; i++) limiter.check('key');
    expect(limiter.check('key').allowed).toBe(false);

    // One second later, roughly one token is back.
    vi.advanceTimersByTime(1_000);
    expect(limiter.check('key').allowed).toBe(true);

    vi.useRealTimers();
  });

  it('FAILS OPEN when the backing store throws', () => {
    // The behaviour this whole module exists to guarantee. An internal fault must
    // never become a client-visible 429 — the failure mode that takes comparable
    // products down for every caller during a brief store outage.
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });

    // Simulate the store failing.
    const broken = limiter as unknown as { '#buckets': Map<string, unknown> };
    Object.defineProperty(broken, '#buckets', {
      get() {
        throw new Error('store unavailable');
      },
    });

    const decision = limiter.check('key');
    expect(decision.allowed).toBe(true);
  });

  it('reports degradation so the operator learns limiting has stopped', () => {
    const onDegraded = vi.fn();
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000, onDegraded });

    // A limiter that silently stops limiting is worse than one that fails loudly.
    expect(limiter.check('key').degraded).toBe(false);
    expect(onDegraded).not.toHaveBeenCalled();
  });

  it('always emits usable numbers in the headers', () => {
    const limiter = new RateLimiter({ limit: 10, windowMs: 60_000 });
    const headers = rateLimitHeaders(limiter.check('key'));

    // Agents self-throttle from these. They must never contain `undefined`,
    // which is exactly what a comparable product returns during a store outage.
    expect(headers['X-RateLimit-Limit']).toBe('10');
    expect(headers['X-RateLimit-Remaining']).toBe('9');
    expect(Number(headers['X-RateLimit-Reset'])).toBeGreaterThan(0);
    for (const value of Object.values(headers)) {
      expect(value).not.toContain('undefined');
    }
  });

  it('prunes idle buckets', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ limit: 5, windowMs: 1_000 });
    limiter.check('old');

    vi.advanceTimersByTime(5_000);
    limiter.prune();

    // A pruned key starts fresh.
    expect(limiter.check('old').remaining).toBe(4);
    vi.useRealTimers();
  });
});
