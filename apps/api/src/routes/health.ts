import type { FastifyInstance } from 'fastify';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';
import { API_VERSION, runServiceChecks } from '../status/checks.js';
import type { DetectLocal } from '../providers/detect.js';

export interface HealthDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool;
  remoteCdpConfigured?: boolean;
  detectLocal?: DetectLocal;
  searxngUrl?: string | undefined;
  now?: () => number;
}

const PROBE_CACHE_MS = 5_000;

interface HealthReport {
  code: number;
  body: Record<string, unknown>;
}

export async function registerHealth(app: FastifyInstance, deps: HealthDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  let cached: { at: number; report: Promise<HealthReport> } | undefined;

  app.get('/health', async (_request, reply) => {
    if (!cached || now() - cached.at >= PROBE_CACHE_MS) {
      const report = buildReport(deps);
      cached = { at: now(), report };
      report.catch(() => {
        if (cached?.report === report) cached = undefined;
      });
    }
    const { code, body } = await cached.report;
    return reply.code(code).send(body);
  });
}

async function buildReport(deps: HealthDeps): Promise<HealthReport> {
  const [services, detected] = await Promise.all([
    runServiceChecks(deps),
    deps.detectLocal ? deps.detectLocal() : Promise.resolve([]),
  ]);

  const env = process.env;
  const providers = {
    llm: {
      configured: Boolean(
        env['OPENAI_API_KEY'] ??
          env['ANTHROPIC_API_KEY'] ??
          env['GEMINI_API_KEY'] ??
          env['GOOGLE_API_KEY'] ??
          env['OPENROUTER_API_KEY'] ??
          env['OPENAI_COMPATIBLE_API_KEY'],
      ),
      model: env['HELIX_LLM_MODEL'] ?? 'unset',
      detected: detected.map((runtime) => runtime.provider),
    },
    embedding: {
      configured: true,
      model: env['HELIX_EMBEDDING_MODEL'] ?? 'local',
    },
    proxy: { configured: Boolean(env['HELIX_PROXY_URL']) },
    search: {
      configured: Boolean(
        deps.searxngUrl || env['SEARXNG_URL'] || env['SERPER_API_KEY'] || env['SERPAPI_KEY'],
      ),
    },
  };

  const statuses = Object.values(services).map((s) => s.status);
  const status = statuses.includes('unhealthy')
    ? 'unhealthy'
    : statuses.includes('degraded')
      ? 'degraded'
      : 'ok';

  return {
    code: status === 'unhealthy' ? 503 : 200,
    body: { status, version: API_VERSION, services, providers },
  };
}
