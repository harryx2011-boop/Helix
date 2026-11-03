import type { Log } from '../core/logger.js';
import type { Tier } from '../core/escalation.js';
import { withServiceToken } from '../core/service-token.js';


export interface FetchOptions {
  url: string;
  impersonate: boolean;
  profile?: string | undefined;
  proxy?: string | undefined;
  headers?: Record<string, string> | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  allowPrivate?: boolean | undefined;
}

export interface FetchResult {
  success: boolean;
  status?: number | undefined;
  headers: Record<string, string>;
  setCookies?: string[] | undefined;
  body?: string | undefined;
  profileUsed?: string | undefined;
  timingMs: number;
  error?: string | undefined;
}

export class FetchClient {
  readonly #baseUrl: string;
  readonly #logger: Log | undefined;
  readonly #serviceToken: string | undefined;

  constructor(baseUrl: string, logger?: Log, serviceToken?: string) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#logger = logger;
    this.#serviceToken = serviceToken;
  }

  async fetch(options: FetchOptions): Promise<FetchResult> {
    const started = Date.now();
    const timeoutMs = options.timeoutMs ?? 30_000;
    const timeout = AbortSignal.timeout(timeoutMs + 5_000);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;

    try {
      const response = await fetch(`${this.#baseUrl}/fetch`, {
        method: 'POST',
        headers: withServiceToken(this.#serviceToken, { 'content-type': 'application/json' }),
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
