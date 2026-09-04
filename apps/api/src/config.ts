import { z } from 'zod';

/**
 * Configuration is read once, at boot, and validated.
 *
 * Provider credentials (LLM, embedding, proxy, vector store) belong to the
 * operator and arrive through the environment. They are never accepted over the
 * API and never stored in the database — Helix calls your models with your keys.
 */

const bool = (d: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? d : v === 'true' || v === '1'));

const int = (d: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? d : Number.parseInt(v, 10)))
    .pipe(z.number().int());

const ConfigSchema = z.object({
  port: int(7400),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  bootstrapKey: z.string().optional(),
  internalAdminToken: z.string().optional(),
  /** AES-256-GCM key for stored provider keys, as 32 bytes of hex or base64. Unset derives it from HELIX_BOOTSTRAP_KEY (SHA-256), so self-host stays zero-config. */
  encryptionKey: z.string().optional(),

  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  fetchUrl: z.string().default('http://localhost:7401'),
  extractUrl: z.string().default('http://localhost:7402'),

  respectRobots: bool(true),
  userAgent: z.string().default('HelixBot/0.1'),
  politeness: z.enum(['adaptive', 'fixed']).default('adaptive'),
  maxHostConcurrency: int(8),
  minHostConcurrency: int(1),
  crawlSessionPoolSize: int(8),
  crawlSessionMaxBlocks: int(2),

  // Guard rails for crawls. Without a billing layer nothing else bounds a
  // runaway job, so the operator sets the default and the ceiling.
  crawlDefaultLimit: int(1000),
  crawlMaxLimit: int(100_000),
  crawlMaxDepth: int(50),

  // Webhook deliveries are signed only when a secret is configured.
  webhookSecret: z.string().optional(),
  webhookMaxAttempts: int(20),

  browserPoolSize: int(4),
  browserMaxContexts: int(20),
  /** Recycle a browser process after this many pages, to bound memory growth. */
  browserRecycleAfter: int(250),
  lightpandaEnabled: bool(false),
  lightpandaUrl: z.string().default('http://localhost:9222'),
  /** Which browser drives the render tier when a request does not name one. */
  browserEngine: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  camoufoxEnabled: bool(false),
  camoufoxUrl: z.string().default('ws://localhost:9223'),
  /**
   * A remote browser the render tier connects to instead of launching locally.
   * Unset means launch locally, which is the only arrangement where the pages
   * fetched and the headers sent stay on the operator's own machine.
   */
  remoteCdpUrl: z.string().optional(),

  /** Where callers reach this instance from outside; live-view URLs are built on it. */
  publicUrl: z.string().default('http://localhost:7400'),
  interactMaxSessions: int(4),
  interactIdleTimeoutSeconds: int(300),
  interactHardTimeoutSeconds: int(900),

  proxyUrl: z.string().optional(),
  /**
   * Off by default: a caller-chosen URL must not reach loopback, link-local or
   * private-range addresses, or an API key becomes a door to the instance's
   * network and cloud metadata. Turn on only for an instance that scrapes its
   * own intranet and trusts every key it issues.
   */
  allowPrivateUrls: bool(false),

  /** `auto` picks SearXNG, then Serper, then SerpAPI, whichever has credentials. */
  searchProvider: z.enum(['auto', 'searxng', 'serper', 'serpapi', 'none']).default('auto'),
  searchMaxResults: int(50),
  searchScrapeConcurrency: int(5),
  /** Provider-hit cache lifetime for identical queries; 0 disables it. */
  searchCacheTtlMs: int(60_000),
  /** Wall-clock budget for one search call, backend query and page reads included. */
  searchMaxDurationMs: int(120_000),

  resultTtlHours: int(168),

  /** Upload ceiling for `/parse`, enforced at the gateway before a byte reaches helix-extract. */
  parseMaxUploadMb: int(25),
  /** Parses held in memory at once; beyond this `/parse` answers 503 with Retry-After. */
  parseMaxInflight: int(8),

  /** Shortest gap between two checks of one monitor, in seconds. Hourly by default. */
  monitorMinIntervalSeconds: int(3600),
  /** Checks running at once across all monitors on this instance. */
  monitorConcurrency: int(2),
  monitorRetainSnapshots: int(30),
  monitorRetainDays: int(90),
  /** History rows kept per monitor; older ones are pruned as checks run. */
  monitorRetainChecks: int(2000),
  /** A page whose text exceeds this many bytes fails the check instead of being stored. */
  monitorMaxContentBytes: int(1_048_576),

  /**
   * Many tenants share this instance, so one API key stands for one tenant and
   * must not reach another's jobs or keys. The API cannot infer this: the same
   * code serves a single-operator self-host, where every key on the instance is
   * the same person's and a flat model is correct. Off by default so upgrading
   * a self-host changes nothing.
   */
  multiTenant: bool(false),

  // Comma-separated allowed origins for the dashboard. Defaults to the dev
  // origins for the split-port setup (dashboard 3400 -> API 7400). Set
  // explicitly in production to the dashboard's real origin.
  corsOrigins: z
    .string()
    .optional()
    .transform((v) =>
      v === undefined
        ? ['http://localhost:3400', 'http://127.0.0.1:3400']
        : v.split(',').map((o) => o.trim()).filter(Boolean),
    ),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse({
    port: env.HELIX_PORT,
    logLevel: env.HELIX_LOG_LEVEL,
    bootstrapKey: env.HELIX_BOOTSTRAP_KEY,
    internalAdminToken: env.HELIX_INTERNAL_ADMIN_TOKEN,
    encryptionKey: env.HELIX_ENCRYPTION_KEY || undefined,
    databaseUrl: env.DATABASE_URL,
    fetchUrl: env.HELIX_FETCH_URL,
    extractUrl: env.HELIX_EXTRACT_URL,
    respectRobots: env.HELIX_RESPECT_ROBOTS,
    userAgent: env.HELIX_USER_AGENT,
    politeness: env.HELIX_DEFAULT_POLITENESS,
    maxHostConcurrency: env.HELIX_MAX_HOST_CONCURRENCY,
    minHostConcurrency: env.HELIX_MIN_HOST_CONCURRENCY,
    crawlSessionPoolSize: env.HELIX_CRAWL_SESSION_POOL_SIZE,
    crawlSessionMaxBlocks: env.HELIX_CRAWL_SESSION_MAX_BLOCKS,
    crawlDefaultLimit: env.HELIX_CRAWL_DEFAULT_LIMIT,
    crawlMaxLimit: env.HELIX_CRAWL_MAX_LIMIT,
    crawlMaxDepth: env.HELIX_CRAWL_MAX_DEPTH,
    webhookSecret: env.HELIX_WEBHOOK_SECRET || undefined,
    webhookMaxAttempts: env.HELIX_WEBHOOK_MAX_ATTEMPTS,
    browserPoolSize: env.HELIX_BROWSER_POOL_SIZE,
    browserMaxContexts: env.HELIX_BROWSER_MAX_CONTEXTS,
    browserRecycleAfter: env.HELIX_BROWSER_RECYCLE_AFTER,
    lightpandaEnabled: env.HELIX_LIGHTPANDA_ENABLED,
    lightpandaUrl: env.HELIX_LIGHTPANDA_URL,
    browserEngine: env.HELIX_BROWSER_ENGINE,
    camoufoxEnabled: env.HELIX_CAMOUFOX_ENABLED,
    camoufoxUrl: env.HELIX_CAMOUFOX_URL,
    remoteCdpUrl: env.HELIX_REMOTE_CDP_URL || undefined,
    publicUrl: env.HELIX_PUBLIC_URL,
    interactMaxSessions: env.HELIX_INTERACT_MAX_SESSIONS,
    interactIdleTimeoutSeconds: env.HELIX_INTERACT_IDLE_TIMEOUT_SECONDS,
    interactHardTimeoutSeconds: env.HELIX_INTERACT_HARD_TIMEOUT_SECONDS,
    proxyUrl: env.HELIX_PROXY_URL || undefined,
    allowPrivateUrls: env.HELIX_ALLOW_PRIVATE_URLS,
    searchProvider: env.HELIX_SEARCH_PROVIDER,
    searchMaxResults: env.HELIX_SEARCH_MAX_RESULTS,
    searchScrapeConcurrency: env.HELIX_SEARCH_SCRAPE_CONCURRENCY,
    searchCacheTtlMs: env.HELIX_SEARCH_CACHE_TTL_MS,
    searchMaxDurationMs: env.HELIX_SEARCH_MAX_DURATION_MS,
    resultTtlHours: env.HELIX_RESULT_TTL_HOURS,
    parseMaxUploadMb: env.HELIX_PARSE_MAX_UPLOAD_MB,
    parseMaxInflight: env.HELIX_PARSE_MAX_INFLIGHT,
    monitorMinIntervalSeconds: env.HELIX_MONITOR_MIN_INTERVAL,
    monitorConcurrency: env.HELIX_MONITOR_CONCURRENCY,
    monitorRetainSnapshots: env.HELIX_MONITOR_RETAIN_SNAPSHOTS,
    monitorRetainDays: env.HELIX_MONITOR_RETAIN_DAYS,
    monitorRetainChecks: env.HELIX_MONITOR_RETAIN_CHECKS,
    monitorMaxContentBytes: env.HELIX_MONITOR_MAX_CONTENT_BYTES,
    multiTenant: env.HELIX_MULTI_TENANT,
    corsOrigins: env.HELIX_CORS_ORIGINS,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return parsed.data;
}
