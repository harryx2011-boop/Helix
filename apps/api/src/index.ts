import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { loadConfig } from './config.js';
import { redactUrlToken } from './core/logger.js';
import { RateLimiter } from './core/rate-limit.js';
import { ensureBootstrapKey, verifyApiKey } from './core/api-keys.js';
import { InternalTickets, registerAuth } from './core/auth.js';
import { closePool, createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { FetchClient } from './fetch/client.js';
import { ExtractClient } from './extract/client.js';
import { BrowserPool } from './browser/pool.js';
import { SessionRegistry } from './browser/sessions.js';
import { registerHealth } from './routes/health.js';
import { registerScrape } from './routes/scrape.js';
import { registerParse } from './routes/parse.js';
import { registerKeys } from './routes/keys.js';
import { registerProviders } from './routes/providers.js';
import { deriveEncryptionKey } from './providers/crypto.js';
import type { Provider } from './providers/repository.js';
import { registerMap } from './routes/map.js';
import { registerCrawl } from './routes/crawl.js';
import { registerJobs } from './routes/jobs.js';
import { CrawlWorker } from './crawl/worker.js';
import { registerSearch } from './routes/search.js';
import { registerAgent } from './routes/agent.js';
import { registerInternal } from './routes/internal.js';
import { registerSettings } from './routes/settings.js';
import { readOverrides } from './settings/store.js';
import { registerInteract } from './routes/interact.js';
import { createSearchProvider } from './search/providers.js';
import { WebhookDispatcher as CrawlWebhookDispatcher } from './webhooks/dispatcher.js';
import { registerMcp } from './mcp/server.js';
import { registerMonitor } from './routes/monitor.js';
import { PgMonitorStore } from './monitor/store.js';
import { MonitorScheduler } from './monitor/scheduler.js';
import { WebhookDispatcher as MonitorWebhookDispatcher } from './monitor/webhooks.js';
import { includeSelectorsFor, runCheck, type FetchOutcome } from './monitor/checker.js';
import { runPipeline } from './core/pipeline.js';
import type { MonitorRecord } from './monitor/store.js';

const config = loadConfig();

const app = Fastify({
  logger: {
    level: config.logLevel,
    redact: {
      // Provider credentials must never reach a log line. Neither must the
      // live-view token, which rides in the query string of its own route.
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.url',
        '*.apiKey',
        '*.api_key',
        '*.proxy',
      ],
      censor: (value: unknown, path: string[]) =>
        path[path.length - 1] === 'url' && typeof value === 'string' ? redactUrlToken(value) : '[redacted]',
    },
  },
  trustProxy: true,
  bodyLimit: 5 * 1024 * 1024,
});

// A thrown error must not reach the caller as the database's or a library's
// own message. Fastify's own errors carry a status (413 for an oversized body,
// 400 for malformed JSON); anything else is a 500 with the request id to grep.
app.setErrorHandler((error: FastifyError, request, reply) => {
  const statusCode = error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500;
  if (statusCode >= 500) {
    request.log.error({ error }, 'request failed');
    return reply.code(statusCode).send({
      error: 'internal_error',
      message: 'The request could not be completed.',
      requestId: request.id,
    });
  }
  return reply.code(statusCode).send({
    error: 'invalid_request',
    message: error.message,
    requestId: request.id,
  });
});

const pool = createPool(config.databaseUrl, app.log);

// Stored overrides are merged before anything reads `config`, so a setting the
// screen reported as "restart required" genuinely takes effect on restart.
// Migrations have not run yet on a first boot, so a missing table is not an
// error here — there is nothing to override until one exists.
try {
  const stored = await readOverrides();
  for (const [key, value] of stored) {
    (config as Record<string, unknown>)[key] = value;
  }
  if (stored.size > 0) app.log.info({ count: stored.size }, 'instance setting overrides loaded');
} catch (error) {
  app.log.debug({ error }, 'no stored settings to load');
}

const fetchClient = new FetchClient(config.fetchUrl, app.log);
const extractClient = new ExtractClient(config.extractUrl, app.log);

const browserPool = new BrowserPool({
  size: config.browserPoolSize,
  maxContexts: config.browserMaxContexts,
  recycleAfter: config.browserRecycleAfter,
  lightpandaEnabled: config.lightpandaEnabled,
  lightpandaUrl: config.lightpandaUrl,
  logger: app.log,
});

const sessions = new SessionRegistry({
  lease: (options) => browserPool.lease(options),
  maxSessions: config.interactMaxSessions,
  idleTimeoutMs: config.interactIdleTimeoutSeconds * 1_000,
  hardTimeoutMs: config.interactHardTimeoutSeconds * 1_000,
  logger: app.log,
});

const searchProvider = createSearchProvider(config.searchProvider, process.env, app.log);

const providerEncryptionKey = deriveEncryptionKey(config.encryptionKey, config.bootstrapKey);
const instanceConfigured: Record<Provider, boolean> = {
  anthropic: Boolean(process.env['ANTHROPIC_API_KEY']),
  openai: Boolean(process.env['OPENAI_API_KEY']),
  gemini: Boolean(process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY']),
  openrouter: Boolean(process.env['OPENROUTER_API_KEY']),
};

const crawlWorker = new CrawlWorker({
  fetchClient,
  extractClient,
  browserPool,
  userAgent: config.userAgent,
  maxHostConcurrency: config.maxHostConcurrency,
  logger: app.log,
});

const crawlWebhookDispatcher = new CrawlWebhookDispatcher({
  db: pool,
  secret: config.webhookSecret,
  maxAttempts: config.webhookMaxAttempts,
  retentionHours: config.resultTtlHours,
  logger: app.log,
});

const monitorStore = new PgMonitorStore(pool);
const monitorRetention = {
  keep: config.monitorRetainSnapshots,
  maxAgeDays: config.monitorRetainDays,
  keepChecks: config.monitorRetainChecks,
};

/** A monitor check is a markdown-only scrape through the same ladder as /scrape. */
const fetchMonitorPage = async (monitor: MonitorRecord): Promise<FetchOutcome> => {
  const options = monitor.scrapeOptions;
  const result = await runPipeline(
    {
      url: monitor.url,
      formats: ['markdown'],
      tier: options.tier ?? 'auto',
      onlyMainContent: options.onlyMainContent ?? true,
      includeSelectors: includeSelectorsFor(monitor),
      excludeSelectors: options.excludeSelectors ?? [],
      extractor: options.extractor ?? 'trafilatura',
      waitFor: options.waitFor,
      timeout: options.timeout ?? 30_000,
      headers: options.headers,
      profile: options.profile,
      proxy: options.proxy?.url,
    },
    { fetchClient, extractClient, browserPool, logger: app.log },
  );
  if (!result.success) return { ok: false, reason: result.reason, detail: result.detail };
  const content = result.content.markdown || result.content.text || '';
  if (content.trim().length === 0) return { ok: false, reason: 'empty', detail: 'The page produced no readable text.' };
  return { ok: true, content, contentHash: result.content.contentHash };
};

const monitorScheduler = new MonitorScheduler({
  store: monitorStore,
  concurrency: config.monitorConcurrency,
  check: (monitor) =>
    runCheck(monitor, {
      store: monitorStore,
      fetchPage: fetchMonitorPage,
      retention: monitorRetention,
      maxContentBytes: config.monitorMaxContentBytes,
      logger: app.log,
    }),
  logger: app.log,
});

const monitorWebhookDispatcher = new MonitorWebhookDispatcher({
  store: monitorStore,
  defaultSecret: config.webhookSecret,
  logger: app.log,
});

const limiter = new RateLimiter({
  limit: 1000,
  windowMs: 60_000,
  onDegraded: (error) =>
    app.log.warn(
      { error },
      'rate limiter degraded — allowing request (fail open). Requests are NOT being limited right now.',
    ),
});

setInterval(() => limiter.prune(), 60_000).unref();

const tickets = new InternalTickets();

await app.register(helmet, { contentSecurityPolicy: false });
// Scoped to the dashboard origin(s). The dashboard authenticates with a
// bearer key rather than cookies, so credentials mode stays off.
await app.register(cors, { origin: config.corsOrigins });

registerAuth(app, { verifyApiKey, limiter, tickets, open: ['/v1/health', '/v1/interact/live/'] });

await app.register(
  async (instance) => {
    await registerHealth(instance, { fetchClient, extractClient, browserPool });
    await registerScrape(instance, {
      fetchClient,
      extractClient,
      browserPool,
      proxyUrl: config.proxyUrl,
      allowPrivateUrls: config.allowPrivateUrls,
      encryptionKey: providerEncryptionKey,
    });
    await registerParse(instance, {
      extractClient,
      maxUploadBytes: config.parseMaxUploadMb * 1024 * 1024,
      maxInFlight: config.parseMaxInflight,
      userAgent: config.userAgent,
      encryptionKey: providerEncryptionKey,
    });
    await registerKeys(instance);
    await registerProviders(instance, { encryptionKey: providerEncryptionKey, instanceConfigured });
    await registerMap(instance, { fetchClient, extractClient, userAgent: config.userAgent });
    await registerCrawl(instance, {
      fetchClient,
      extractClient,
      userAgent: config.userAgent,
      defaultModel: process.env['HELIX_LLM_MODEL'] ?? 'unset',
      limits: {
        defaultLimit: config.crawlDefaultLimit,
        maxLimit: config.crawlMaxLimit,
        maxDepth: config.crawlMaxDepth,
        respectRobots: config.respectRobots,
      },
    });
    await registerJobs(instance);
    await registerSearch(instance, {
      provider: searchProvider,
      fetchClient,
      extractClient,
      browserPool,
      maxResults: config.searchMaxResults,
      scrapeConcurrency: config.searchScrapeConcurrency,
      cacheTtlMs: config.searchCacheTtlMs,
      maxDurationMs: config.searchMaxDurationMs,
    });
    await registerMonitor(instance, {
      store: monitorStore,
      scheduler: monitorScheduler,
      minIntervalSeconds: config.monitorMinIntervalSeconds,
    });
    await registerInteract(instance, { sessions, extractClient, publicUrl: config.publicUrl });
    await registerAgent(instance, { extractClient, encryptionKey: providerEncryptionKey });
  },
  { prefix: '/v1' },
);

await registerInternal(app, { adminToken: config.internalAdminToken });

// The environment supplies the defaults; a stored override replaces one. Kept
// beside `config` so the settings screen can show what it overrode.
const settingsEnvValues: Record<string, unknown> = {
  browserMaxContexts: config.browserMaxContexts,
  browserRecycleAfter: config.browserRecycleAfter,
  interactMaxSessions: config.interactMaxSessions,
  interactIdleTimeoutSeconds: config.interactIdleTimeoutSeconds,
  interactHardTimeoutSeconds: config.interactHardTimeoutSeconds,
  respectRobots: config.respectRobots,
  maxHostConcurrency: config.maxHostConcurrency,
  crawlDefaultLimit: config.crawlDefaultLimit,
  crawlMaxLimit: config.crawlMaxLimit,
  crawlMaxDepth: config.crawlMaxDepth,
  searchMaxResults: config.searchMaxResults,
  searchScrapeConcurrency: config.searchScrapeConcurrency,
  searchCacheTtlMs: config.searchCacheTtlMs,
  searchMaxDurationMs: config.searchMaxDurationMs,
  parseMaxUploadMb: config.parseMaxUploadMb,
  parseMaxInflight: config.parseMaxInflight,
  monitorMinIntervalSeconds: config.monitorMinIntervalSeconds,
  monitorConcurrency: config.monitorConcurrency,
  monitorRetainSnapshots: config.monitorRetainSnapshots,
  monitorRetainDays: config.monitorRetainDays,
  monitorRetainChecks: config.monitorRetainChecks,
  resultTtlHours: config.resultTtlHours,
  webhookMaxAttempts: config.webhookMaxAttempts,
  userAgent: config.userAgent,
  logLevel: config.logLevel,
  corsOrigins: config.corsOrigins,
  allowPrivateUrls: config.allowPrivateUrls,
  lightpandaEnabled: config.lightpandaEnabled,
};

await registerSettings(app, {
  adminToken: config.internalAdminToken,
  envValues: settingsEnvValues,
  live: { browserPool, sessions },
  encryptionKey: providerEncryptionKey,
});

// Tools are generated from openapi.yaml for the routes registered above; the
// bearer key on the MCP request is the same key the HTTP API takes, verified
// and rate limited once on the way in; the replayed tool call rides a ticket.
await registerMcp(app, { prefix: '/v1', tickets });

const start = async (): Promise<void> => {
  try {
    const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
    const result = await migrate(migrationsDir, app.log);
    if (result.applied.length > 0) {
      app.log.info({ applied: result.applied }, 'migrations applied');
    }

    if (config.bootstrapKey) {
      await ensureBootstrapKey(config.bootstrapKey);
      app.log.info('bootstrap API key registered');
    } else {
      app.log.warn(
        'HELIX_BOOTSTRAP_KEY is not set — no API key exists yet, so every request will be rejected. ' +
          'Set it and restart, or insert a key directly.',
      );
    }

    // The pool warms lazily on first render: a browser that may never be used
    // should not add seconds to boot or hundreds of megabytes to idle memory.

    // Runs in-process. A separate worker deployment would scale further, but
    // one process is the right default for a self-hosted tool.
    void crawlWorker.start();
    void crawlWebhookDispatcher.start();
    await monitorScheduler.start();
    monitorWebhookDispatcher.start();
    sessions.startSweeper();

    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(
      { port: config.port },
      'Helix API listening. Provider credentials are read from the environment; Helix calls your models with your keys.',
    );
  } catch (error) {
    app.log.error(error, 'failed to start');
    await closePool().catch(() => undefined);
    process.exit(1);
  }
};

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');

    void (async () => {
      crawlWorker.stop();
      monitorScheduler.stop();
      monitorWebhookDispatcher.stop();
      crawlWebhookDispatcher.stop();
      await sessions.closeAll().catch(() => undefined);
      await app.close().catch(() => undefined);
      await browserPool.close().catch(() => undefined);
      await closePool().catch(() => undefined);
      process.exit(0);
    })();
  });
}

await start();
