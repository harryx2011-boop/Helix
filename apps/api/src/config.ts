import { join } from 'node:path';
import { z } from 'zod';


const bool = (d: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? d : v === 'true' || v === '1'));

const INTEGER_PATTERN = /^-?\d+$/;

const int = (d: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return d;
      if (!INTEGER_PATTERN.test(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected an integer, received "${v}"` });
        return z.NEVER;
      }
      return Number(v);
    })
    .pipe(z.number().int());

const positiveInt = (d: number) => int(d).pipe(z.number().min(1));

const ConfigSchema = z.object({
  port: int(7400),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  bootstrapKey: z.string().optional(),
  internalAdminToken: z.string().optional(),
  encryptionKey: z.string().optional(),

  db: z.enum(['pg', 'pglite']),
  databaseUrl: z.string().optional(),
  dataDir: z.string().default(join(process.cwd(), 'data')),
  fetchUrl: z.string().default('http://localhost:7403'),
  extractUrl: z.string().default('http://localhost:7402'),
  serviceToken: z.string().optional(),

  respectRobots: bool(true),
  userAgent: z.string().default('HelixBot/0.1'),
  politeness: z.enum(['adaptive', 'fixed']).default('adaptive'),
  maxHostConcurrency: int(8),
  minHostConcurrency: int(1),
  crawlSessionPoolSize: int(8),
  crawlSessionMaxBlocks: int(2),

  crawlDefaultLimit: int(1000),
  crawlMaxLimit: int(100_000),
  crawlMaxDepth: int(50),

  webhookSecret: z.string().optional(),
  webhookMaxAttempts: int(20),

  browserPoolSize: positiveInt(4),
  browserMaxContexts: positiveInt(20),
  browserRecycleAfter: int(250),
  /** Which browser drives the render tier when a request does not name one. */
  browserEngine: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  browserChannel: z.string().default('chromium'),
  /**
   * A remote browser the render tier connects to instead of launching locally.
   * Unset means launch locally, which is the only arrangement where the pages
   * fetched and the headers sent stay on the operator's own machine.
   */
  remoteCdpUrl: z.string().optional(),

  publicUrl: z.string().default('http://localhost:7400'),
  interactMaxSessions: int(4),
  interactIdleTimeoutSeconds: int(300),
  interactHardTimeoutSeconds: int(900),

  proxyUrl: z.string().optional(),
  allowPrivateUrls: bool(false),

  searchProvider: z.enum(['auto', 'searxng', 'serper', 'serpapi', 'none']).default('auto'),
  searxngUrl: z.string().optional(),
  searchMaxResults: int(50),
  searchScrapeConcurrency: int(5),
  searchCacheTtlMs: int(60_000),
  searchMaxDurationMs: int(120_000),

  resultTtlHours: int(168),

  parseMaxUploadMb: int(25),
  parseMaxInflight: int(8),

  monitorMinIntervalSeconds: int(3600),
  monitorConcurrency: int(2),
  monitorRetainSnapshots: int(30),
  monitorRetainDays: int(90),
  monitorRetainChecks: int(2000),
  monitorMaxContentBytes: int(1_048_576),

  corsOrigins: z
    .string()
    .optional()
    .transform((v) =>
      v === undefined
        ? ['http://localhost:3400', 'http://127.0.0.1:3400']
        : v.split(',').map((o) => o.trim()).filter(Boolean),
    ),
  staticDir: z.string().optional(),
  mcpTools: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v.split(',').map((o) => o.trim()).filter(Boolean))),
}).refine((c) => c.db !== 'pg' || c.databaseUrl !== undefined, {
  message: 'DATABASE_URL is required when HELIX_DB=pg',
  path: ['databaseUrl'],
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse({
    port: env.HELIX_PORT,
    host: env.HELIX_HOST,
    logLevel: env.HELIX_LOG_LEVEL,
    bootstrapKey: env.HELIX_BOOTSTRAP_KEY,
    internalAdminToken: env.HELIX_INTERNAL_ADMIN_TOKEN,
    encryptionKey: env.HELIX_ENCRYPTION_KEY || undefined,
    db: env.HELIX_DB || (env.DATABASE_URL ? 'pg' : 'pglite'),
    databaseUrl: env.DATABASE_URL || undefined,
    dataDir: env.HELIX_DATA_DIR || undefined,
    fetchUrl: env.HELIX_FETCH_URL,
    extractUrl: env.HELIX_EXTRACT_URL,
    serviceToken: env.HELIX_SERVICE_TOKEN || undefined,
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
    browserEngine: env.HELIX_BROWSER_ENGINE,
    browserChannel: env.HELIX_BROWSER_CHANNEL,
    remoteCdpUrl: env.HELIX_REMOTE_CDP_URL || undefined,
    publicUrl: env.HELIX_PUBLIC_URL,
    interactMaxSessions: env.HELIX_INTERACT_MAX_SESSIONS,
    interactIdleTimeoutSeconds: env.HELIX_INTERACT_IDLE_TIMEOUT_SECONDS,
    interactHardTimeoutSeconds: env.HELIX_INTERACT_HARD_TIMEOUT_SECONDS,
    proxyUrl: env.HELIX_PROXY_URL || undefined,
    allowPrivateUrls: env.HELIX_ALLOW_PRIVATE_URLS,
    searchProvider: env.HELIX_SEARCH_PROVIDER,
    searxngUrl: env.SEARXNG_URL || undefined,
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
    corsOrigins: env.HELIX_CORS_ORIGINS,
    staticDir: env.HELIX_STATIC_DIR || undefined,
    mcpTools: env.HELIX_MCP_TOOLS,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return parsed.data;
}
