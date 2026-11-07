
export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
  degraded: boolean;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  onDegraded?: (error: unknown) => void;
}

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
