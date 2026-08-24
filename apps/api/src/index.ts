import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { loadConfig } from './config.js';
import { RateLimiter, rateLimitHeaders } from './core/rate-limit.js';
import { ensureBootstrapKey, verifyApiKey, type ApiKey } from './core/api-keys.js';
import { closePool, createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { FetchClient } from './fetch/client.js';
import { ExtractClient } from './extract/client.js';
import { BrowserPool } from './browser/pool.js';
import { registerHealth } from './routes/health.js';
import { registerScrape } from './routes/scrape.js';
import { registerKeys } from './routes/keys.js';
import { registerMap } from './routes/map.js';
import { registerCrawl } from './routes/crawl.js';
import { registerJobs } from './routes/jobs.js';
import { CrawlWorker } from './crawl/worker.js';
import { registerSearch } from './routes/search.js';
import { registerInternal } from './routes/internal.js';
import { createSearchProvider } from './search/providers.js';
import { WebhookDispatcher } from './webhooks/dispatcher.js';

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKey;
  }
}

const config = loadConfig();

const app = Fastify({
  logger: {
    level: config.logLevel,
    redact: {
      // Provider credentials must never reach a log line.
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        '*.apiKey',
        '*.api_key',
        '*.proxy',
      ],
      censor: '[redacted]',
    },
  },
  trustProxy: true,
  bodyLimit: 5 * 1024 * 1024,
});

const pool = createPool(config.databaseUrl, app.log);

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

const searchProvider = createSearchProvider(config.searchProvider, process.env, app.log);

const crawlWorker = new CrawlWorker({
  fetchClient,
  extractClient,
  browserPool,
  userAgent: config.userAgent,
  logger: app.log,
});

const webhookDispatcher = new WebhookDispatcher({
  db: pool,
  secret: config.webhookSecret,
  maxAttempts: config.webhookMaxAttempts,
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

await app.register(helmet, { contentSecurityPolicy: false });
// Scoped to the dashboard origin(s). The dashboard authenticates with a
// bearer key rather than cookies, so credentials mode stays off.
await app.register(cors, { origin: config.corsOrigins });

/**
 * Auth and rate limiting.
 *
 * `/health` stays open: an unauthenticated liveness probe is what orchestrators
 * need, and it reveals only whether providers are configured, never key material.
 */
app.addHook('onRequest', async (request, reply) => {
  if (request.url.startsWith('/v1/health')) return;

  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

  if (!token) {
    return reply.code(401).send({
      error: 'unauthorized',
      message: 'Missing API key. Send `Authorization: Bearer helix-...`.',
      requestId: request.id,
    });
  }

  let apiKey: ApiKey | undefined;
  try {
    apiKey = await verifyApiKey(token);
  } catch (error) {
    // The key store being unreachable is our fault, not the caller's. Say so
    // plainly rather than implying their credentials are wrong.
    app.log.error({ error }, 'api key lookup failed');
    return reply.code(503).send({
      error: 'service_unavailable',
      message: 'Unable to verify credentials right now. Retry shortly.',
      requestId: request.id,
    });
  }

  if (!apiKey) {
    // Unknown and revoked are deliberately indistinguishable.
    return reply.code(401).send({
      error: 'unauthorized',
      message: 'Invalid API key.',
      requestId: request.id,
    });
  }

  request.apiKey = apiKey;

  const decision = limiter.check(apiKey.id, apiKey.rateLimit);
  for (const [name, value] of Object.entries(rateLimitHeaders(decision))) {
    void reply.header(name, value);
  }

  if (!decision.allowed) {
    return reply.code(429).send({
      error: 'rate_limited',
      message: `Rate limit exceeded. Retry in ${decision.retryAfterSeconds ?? 60}s.`,
      requestId: request.id,
    });
  }
});

await app.register(
  async (instance) => {
    await registerHealth(instance, { fetchClient, extractClient, browserPool });
    await registerScrape(instance, { fetchClient, extractClient, browserPool });
    await registerKeys(instance);
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
      },
    });
    await registerJobs(instance);
    await registerSearch(instance, {
      provider: searchProvider,
      fetchClient,
      extractClient,
      browserPool,
    });
  },
  { prefix: '/v1' },
);

await registerInternal(app, { adminToken: config.internalAdminToken });

// TODO(M7+): /monitor, /parse, /interact

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
    void webhookDispatcher.start();

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
      webhookDispatcher.stop();
      await app.close().catch(() => undefined);
      await browserPool.close().catch(() => undefined);
      await closePool().catch(() => undefined);
      process.exit(0);
    })();
  });
}

await start();
