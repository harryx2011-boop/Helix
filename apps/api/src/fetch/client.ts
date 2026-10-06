import type { Log } from '../core/logger.js';
import type { Tier } from '../core/escalation.js';

/**
 * Client for helix-fetch (tiers 0 and 1).
 *
 * This service reports what happened at the transport layer and applies no
 * policy of its own. Block classification lives in the core, so the rules stay
 * in one place and are testable without a network.
 */

export interface FetchOptions {
  url: string;
  /** false selects tier 0 (plain); true selects tier 1 (TLS-impersonating). */
  impersonate: boolean;
  profile?: string | undefined;
  proxy?: string | undefined;
  headers?: Record<string, string> | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  /** Operator opt-in: follow redirects onto private addresses. */
  allowPrivate?: boolean | undefined;
}

export interface FetchResult {
  success: boolean;
  status?: number | undefined;
  headers: Record<string, string>;
  /** Every `Set-Cookie` line; `headers` keeps only one of them. */
  setCookies?: string[] | undefined;
  body?: string | undefined;
  profileUsed?: string | undefined;
  timingMs: number;
  error?: string | undefined;
}

export class FetchClient {
  readonly #baseUrl: string;
  readonly #logger: Log | undefined;

  constructor(baseUrl: string, logger?: Log) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#logger = logger;
  }

  async fetch(options: FetchOptions): Promise<FetchResult> {
    const started = Date.now();
    const timeoutMs = options.timeoutMs ?? 30_000;
    // A little headroom over the inner timeout, so the service can report
    // its own failure rather than being cut off mid-answer.
    const timeout = AbortSignal.timeout(timeoutMs + 5_000);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;

    try {
      const response = await fetch(`${this.#baseUrl}/fetch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: options.url,
          impersonate: options.impersonate,
          profile: options.profile,
          proxy: options.proxy,
          headers: options.headers,
          timeout_ms: timeoutMs,
          allow_private: options.allowPrivate ?? false,
        }),
        signal,
      });

      if (!response.ok) {
        return {
          success: false,
          headers: {},
          timingMs: Date.now() - started,
          error: `helix-fetch returned HTTP ${response.status}`,
        };
      }

      const body = (await response.json()) as {
        success: boolean;
        status?: number;
        headers?: Record<string, string>;
        set_cookies?: string[];
        body?: string;
        profile_used?: string;
        timing_ms?: number;
        error?: string;
      };

      return {
        success: body.success,
        status: body.status,
        headers: body.headers ?? {},
        setCookies: body.set_cookies,
        body: body.body,
        profileUsed: body.profile_used,
        timingMs: body.timing_ms ?? Date.now() - started,
        error: body.error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'fetch service unreachable';
      this.#logger?.warn({ error, url: options.url }, 'helix-fetch call failed');
      return {
        success: false,
        headers: {},
        timingMs: Date.now() - started,
        error: message,
      };
    }
  }

  /** Map a tier onto the impersonation flag this service understands. */
  static tierToImpersonate(tier: Tier): boolean {
    return tier === 'tls';
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.#baseUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
