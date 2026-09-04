import type { FastifyInstance } from 'fastify';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';
import { API_VERSION, runServiceChecks } from '../status/checks.js';

export interface HealthDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool;
  lightpandaEnabled?: boolean;
}

/**
 * Health, including each dependency's latency and which BYOK providers are configured.
 *
 * Provider status reports only whether a credential is present and which model
 * is selected. Key material is never returned — a health endpoint is often the
 * least-guarded route in a deployment.
 */
export async function registerHealth(app: FastifyInstance, deps: HealthDeps): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const services = await runServiceChecks(deps);

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
      },
      embedding: {
        configured: true, // the local model needs no key
        model: env['HELIX_EMBEDDING_MODEL'] ?? 'local',
      },
      proxy: { configured: Boolean(env['HELIX_PROXY_URL']) },
      search: { configured: Boolean(env['SEARXNG_URL'] || env['SERPER_API_KEY'] || env['SERPAPI_KEY']) },
    };

    const statuses = Object.values(services).map((s) => s.status);
    const status = statuses.includes('unhealthy')
      ? 'unhealthy'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'ok';

    return reply.code(status === 'unhealthy' ? 503 : 200).send({
      status,
      version: API_VERSION,
      services,
      providers,
    });
  });
}
