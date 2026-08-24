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

  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  fetchUrl: z.string().default('http://localhost:7401'),
  extractUrl: z.string().default('http://localhost:7402'),

  respectRobots: bool(true),
  userAgent: z.string().default('HelixBot/0.1'),
  politeness: z.enum(['adaptive', 'fixed']).default('adaptive'),
  maxHostConcurrency: int(8),

  browserPoolSize: int(4),
  browserMaxContexts: int(20),
  /** Recycle a browser process after this many pages, to bound memory growth. */
  browserRecycleAfter: int(250),
  lightpandaEnabled: bool(false),
  lightpandaUrl: z.string().default('http://localhost:9222'),

  proxyUrl: z.string().optional(),
  searchProvider: z.enum(['serper', 'serpapi', 'none']).default('none'),

  resultTtlHours: int(168),

  /** Upload ceiling for `/parse`, enforced at the gateway before a byte reaches helix-extract. */
  parseMaxUploadMb: int(25),
  /** Parses held in memory at once; beyond this `/parse` answers 503 with Retry-After. */
  parseMaxInflight: int(8),

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
    databaseUrl: env.DATABASE_URL,
    fetchUrl: env.HELIX_FETCH_URL,
    extractUrl: env.HELIX_EXTRACT_URL,
    respectRobots: env.HELIX_RESPECT_ROBOTS,
    userAgent: env.HELIX_USER_AGENT,
    politeness: env.HELIX_DEFAULT_POLITENESS,
    maxHostConcurrency: env.HELIX_MAX_HOST_CONCURRENCY,
    browserPoolSize: env.HELIX_BROWSER_POOL_SIZE,
    browserMaxContexts: env.HELIX_BROWSER_MAX_CONTEXTS,
    browserRecycleAfter: env.HELIX_BROWSER_RECYCLE_AFTER,
    lightpandaEnabled: env.HELIX_LIGHTPANDA_ENABLED,
    lightpandaUrl: env.HELIX_LIGHTPANDA_URL,
    proxyUrl: env.HELIX_PROXY_URL || undefined,
    searchProvider: env.HELIX_SEARCH_PROVIDER,
    resultTtlHours: env.HELIX_RESULT_TTL_HOURS,
    parseMaxUploadMb: env.HELIX_PARSE_MAX_UPLOAD_MB,
    parseMaxInflight: env.HELIX_PARSE_MAX_INFLIGHT,
    corsOrigins: env.HELIX_CORS_ORIGINS,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return parsed.data;
}
