/**
 * Per-key rate limiting, token bucket.
 *
 * The load-bearing property is that it FAILS OPEN. If the backing store is
 * unavailable, the request proceeds and a warning is logged. A limiter that
 * rejects traffic because its own infrastructure hiccuped has converted an
 * internal problem into a client-visible outage — which is precisely the bug
 * that makes comparable products return 429 to everyone during a brief Redis
 * blip, complete with `undefined` in the error message.
 *
 * Every decision also carries the numbers needed for `X-RateLimit-*` headers, so
 * autonomous clients can self-throttle without parsing error strings.
 */

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds. */
  resetAt: number;
  retryAfterSeconds?: number;
  /** True when the limiter could not consult its store and allowed by default. */
  degraded: boolean;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimiterOptions {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  onDegraded?: (error: unknown) => void;
}

/**
 * In-memory token bucket. Adequate for a single-node self-host, which is the
 * default deployment. A shared-store implementation can satisfy the same
 * interface for multi-node — and must keep the fail-open behaviour.
 */
export class RateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #onDegraded: ((error: unknown) => void) | undefined;

  constructor(options: RateLimiterOptions) {
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#onDegraded = options.onDegraded;
  }

  check(key: string, limitOverride?: number): RateLimitDecision {
    const limit = limitOverride ?? this.#limit;
    const now = Date.now();

    try {
      const bucket = this.#buckets.get(key) ?? { tokens: limit, lastRefill: now };

      // Continuous refill: no window edges to stampede against.
      const elapsed = now - bucket.lastRefill;
      const refilled = (elapsed / this.#windowMs) * limit;
      bucket.tokens = Math.min(limit, bucket.tokens + refilled);
      bucket.lastRefill = now;

      const resetAt = Math.ceil((now + this.#windowMs) / 1000);

      if (bucket.tokens < 1) {
        this.#buckets.set(key, bucket);
        const deficit = 1 - bucket.tokens;
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt,
          retryAfterSeconds: Math.ceil((deficit / limit) * (this.#windowMs / 1000)),
          degraded: false,
        };
      }

      bucket.tokens -= 1;
      this.#buckets.set(key, bucket);

      return {
        allowed: true,
        limit,
        remaining: Math.floor(bucket.tokens),
        resetAt,
        degraded: false,
      };
    } catch (error) {
      // Fail open. Never turn our own fault into the caller's 429.
      this.#onDegraded?.(error);
      return {
        allowed: true,
        limit,
        remaining: limit,
        resetAt: Math.ceil((now + this.#windowMs) / 1000),
        degraded: true,
      };
    }
  }

  /** Drop buckets untouched for a full window, so idle keys do not accumulate. */
  prune(): void {
    const cutoff = Date.now() - this.#windowMs;
    for (const [key, bucket] of this.#buckets) {
      if (bucket.lastRefill < cutoff) this.#buckets.delete(key);
    }
  }
}

export function rateLimitHeaders(d: RateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(d.limit),
    'X-RateLimit-Remaining': String(d.remaining),
    'X-RateLimit-Reset': String(d.resetAt),
  };
  if (d.retryAfterSeconds !== undefined) {
    headers['Retry-After'] = String(d.retryAfterSeconds);
  }
  return headers;
}
