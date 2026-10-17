import { z } from 'zod';

/**
 * The catalogue of operator-editable settings.
 *
 * Every entry declares how a change takes effect, because that is what an
 * operator most needs to know and what a settings screen most easily lies
 * about:
 *
 * - `live`    — applied immediately through a setter on a running object.
 * - `restart` — persisted, but the process reads it only at boot.
 * - `guarded` — as `restart`, and refused unless the caller confirms it
 *               explicitly. These change the instance's security posture.
 *
 * A setting absent from this registry cannot be written at all. That is
 * deliberate: the database URL, the listen port and the internal admin token
 * have no business being reachable from an HTTP surface, so they are not here.
 */

export type Effect = 'live' | 'restart' | 'guarded';

export interface SettingDef {
  key: string;
  env: string;
  effect: Effect;
  schema: z.ZodTypeAny;
  /** Shown beside the field. Says what the setting does, not what type it is. */
  description: string;
  /** Why a guarded setting is dangerous. Required for `guarded`. */
  warning?: string;
}

const positiveInt = (max: number) => z.number().int().min(1).max(max);

export const SETTINGS: readonly SettingDef[] = [
  {
    key: 'browserMaxContexts',
    env: 'HELIX_BROWSER_MAX_CONTEXTS',
    effect: 'live',
    schema: positiveInt(200),
    description: 'Contexts one pooled browser may hold before the pool passes work to another.',
  },
  {
    key: 'browserRecycleAfter',
    env: 'HELIX_BROWSER_RECYCLE_AFTER',
    effect: 'live',
    schema: positiveInt(10_000),
    description: 'Pages a browser serves before it is recycled, bounding memory growth.',
  },
  {
    key: 'interactMaxSessions',
    env: 'HELIX_INTERACT_MAX_SESSIONS',
    effect: 'live',
    schema: positiveInt(64),
    description: 'Concurrent interactive sessions. New sessions past this are refused.',
  },
  {
    key: 'interactIdleTimeoutSeconds',
    env: 'HELIX_INTERACT_IDLE_TIMEOUT_SECONDS',
    effect: 'live',
    schema: positiveInt(86_400),
    description: 'Idle time before an interactive session is swept.',
  },
  {
    key: 'interactHardTimeoutSeconds',
    env: 'HELIX_INTERACT_HARD_TIMEOUT_SECONDS',
    effect: 'live',
    schema: positiveInt(86_400),
    description: 'Total lifetime of an interactive session. Open sessions keep their original deadline.',
  },

  {
    key: 'respectRobots',
    env: 'HELIX_RESPECT_ROBOTS',
    effect: 'restart',
    schema: z.boolean(),
    description: 'Default for a crawl that does not say. A request may still override it.',
  },
  {
    key: 'maxHostConcurrency',
    env: 'HELIX_MAX_HOST_CONCURRENCY',
    effect: 'restart',
    schema: positiveInt(64),
    description: 'Ceiling for adaptive per-host crawl concurrency.',
  },
  {
    key: 'minHostConcurrency',
    env: 'HELIX_MIN_HOST_CONCURRENCY',
    effect: 'restart',
    schema: positiveInt(64),
    description: 'Floor the adaptive controller may not back off below, however hard a host pushes.',
  },
  {
    key: 'crawlSessionPoolSize',
    env: 'HELIX_CRAWL_SESSION_POOL_SIZE',
    effect: 'restart',
    schema: positiveInt(64),
    description: 'Identities a crawl rotates between. Each pairs one browser profile with one proxy exit.',
  },
  {
    key: 'crawlSessionMaxBlocks',
    env: 'HELIX_CRAWL_SESSION_MAX_BLOCKS',
    effect: 'restart',
    schema: positiveInt(20),
    description: 'Blocks one identity absorbs before it is retired and replaced.',
  },
  {
    key: 'crawlDefaultLimit',
    env: 'HELIX_CRAWL_DEFAULT_LIMIT',
    effect: 'restart',
    schema: positiveInt(1_000_000),
    description: 'Pages a crawl fetches when the request omits a limit.',
  },
  {
    key: 'crawlMaxLimit',
    env: 'HELIX_CRAWL_MAX_LIMIT',
    effect: 'restart',
    schema: positiveInt(1_000_000),
    description: 'Largest limit a crawl may ask for. A larger one is rejected, not clamped.',
  },
  {
    key: 'crawlMaxDepth',
    env: 'HELIX_CRAWL_MAX_DEPTH',
    effect: 'restart',
    schema: z.number().int().min(0).max(1_000),
    description: 'Deepest link level a crawl will follow.',
  },
  {
    key: 'searchMaxResults',
    env: 'HELIX_SEARCH_MAX_RESULTS',
    effect: 'restart',
    schema: positiveInt(200),
    description: 'Results one search may return.',
  },
  {
    key: 'searchScrapeConcurrency',
    env: 'HELIX_SEARCH_SCRAPE_CONCURRENCY',
    effect: 'restart',
    schema: positiveInt(64),
    description: 'Result pages read at once while a search runs.',
  },
  {
    key: 'searchCacheTtlMs',
    env: 'HELIX_SEARCH_CACHE_TTL_MS',
    effect: 'restart',
    schema: z.number().int().min(0).max(86_400_000),
    description: 'How long an identical query reuses a cached provider hit. 0 disables the cache.',
  },
  {
    key: 'searchMaxDurationMs',
    env: 'HELIX_SEARCH_MAX_DURATION_MS',
    effect: 'restart',
    schema: positiveInt(600_000),
    description: 'Wall-clock budget for one search, page reads included.',
  },
  {
    key: 'parseMaxUploadMb',
    env: 'HELIX_PARSE_MAX_UPLOAD_MB',
    effect: 'restart',
    schema: positiveInt(1_024),
    description: 'Largest upload /parse accepts.',
  },
  {
    key: 'parseMaxInflight',
    env: 'HELIX_PARSE_MAX_INFLIGHT',
    effect: 'restart',
    schema: positiveInt(256),
    description: 'Parses held in memory at once. Beyond this /parse answers 503.',
  },
  {
    key: 'monitorMinIntervalSeconds',
    env: 'HELIX_MONITOR_MIN_INTERVAL',
    effect: 'restart',
    schema: positiveInt(2_592_000),
    description: 'Shortest gap between two checks of one monitor.',
  },
  {
    key: 'monitorConcurrency',
    env: 'HELIX_MONITOR_CONCURRENCY',
    effect: 'restart',
    schema: positiveInt(64),
    description: 'Monitor checks running at once across the instance.',
  },
  {
    key: 'monitorRetainSnapshots',
    env: 'HELIX_MONITOR_RETAIN_SNAPSHOTS',
    effect: 'restart',
    schema: positiveInt(1_000),
    description: 'Snapshots kept per monitor.',
  },
  {
    key: 'monitorRetainDays',
    env: 'HELIX_MONITOR_RETAIN_DAYS',
    effect: 'restart',
    schema: positiveInt(3_650),
    description: 'Days of monitor history kept.',
  },
  {
    key: 'monitorRetainChecks',
    env: 'HELIX_MONITOR_RETAIN_CHECKS',
    effect: 'restart',
    schema: positiveInt(100_000),
    description: 'History rows kept per monitor.',
  },
  {
    key: 'resultTtlHours',
    env: 'HELIX_RESULT_TTL_HOURS',
    effect: 'restart',
    schema: positiveInt(8_760),
    description: 'How long crawl results stay readable.',
  },
  {
    key: 'webhookMaxAttempts',
    env: 'HELIX_WEBHOOK_MAX_ATTEMPTS',
    effect: 'restart',
    schema: positiveInt(100),
    description: 'Delivery attempts before a webhook is abandoned.',
  },
  {
    key: 'userAgent',
    env: 'HELIX_USER_AGENT',
    effect: 'restart',
    schema: z.string().min(1).max(200),
    description: 'User-Agent sent on every outbound request.',
  },
  {
    key: 'logLevel',
    env: 'HELIX_LOG_LEVEL',
    effect: 'restart',
    schema: z.enum(['trace', 'debug', 'info', 'warn', 'error']),
    description: 'Log verbosity.',
  },
  {
    key: 'corsOrigins',
    env: 'HELIX_CORS_ORIGINS',
    effect: 'restart',
    schema: z.array(z.string().min(1)).max(50),
    description: 'Origins the dashboard may call this API from.',
  },

  {
    key: 'allowPrivateUrls',
    env: 'HELIX_ALLOW_PRIVATE_URLS',
    effect: 'guarded',
    schema: z.boolean(),
    description: 'Allow callers to target loopback, link-local and private-range addresses.',
    warning:
      'Turning this on makes every API key a door to this instance network and its cloud metadata. Enable it only on an instance that scrapes its own intranet and trusts every key it issues.',
  },
  {
    key: 'lightpandaEnabled',
    env: 'HELIX_LIGHTPANDA_ENABLED',
    effect: 'guarded',
    schema: z.boolean(),
    description: 'Use a Lightpanda CDP endpoint for the light browser tier.',
    warning: 'Helix drives whatever answers on the configured CDP URL. Point it only at a runtime you control.',
  },
  {
    key: 'browserEngine',
    env: 'HELIX_BROWSER_ENGINE',
    effect: 'restart',
    schema: z.enum(['chromium', 'firefox', 'webkit']),
    description: 'Browser that drives the render tier when a request does not name one.',
  },
  {
    key: 'camoufoxEnabled',
    env: 'HELIX_CAMOUFOX_ENABLED',
    effect: 'guarded',
    schema: z.boolean(),
    description: 'Offer the Camoufox tier, a hardened Firefox reached over a configured endpoint.',
    warning:
      'Helix drives whatever answers on the configured Camoufox URL, and the tier is only reachable when a request asks for it. Point it only at a runtime you control.',
  },
  {
    key: 'remoteCdpUrl',
    env: 'HELIX_REMOTE_CDP_URL',
    effect: 'guarded',
    schema: z.string().min(1).max(2_000),
    description: 'Remote browser the render tier connects to over CDP instead of launching one locally.',
    warning:
      'Every page rendered and every header sent, credentials included, passes through that endpoint, and the private-address guard then covers the remote host network rather than this one. Set it only to a browser service you control or trust with the traffic. The URL itself often carries a token, so treat it as a secret.',
  },
  {
    key: 'searxngUrl',
    env: 'SEARXNG_URL',
    effect: 'restart',
    schema: z
      .string()
      .url()
      .max(2_000)
      .refine((value) => /^https?:\/\//i.test(value), 'must be an http(s) URL'),
    description:
      'SearXNG instance that answers search, image search and enrich. Nothing is bundled: run your own and point this at it.',
  },
] as const;

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

export function settingDef(key: string): SettingDef | undefined {
  return BY_KEY.get(key);
}

export function isEditable(key: string): boolean {
  return BY_KEY.has(key);
}
