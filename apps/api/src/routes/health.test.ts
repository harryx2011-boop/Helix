import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Health roll-up.
 *
 * `/health` is unauthenticated (index.ts lists it under `open`), so it is the
 * least-guarded route in a deployment and the one most likely to be scraped.
 * Two things are asserted: that the worst service check decides the overall
 * status and the HTTP code, and that a configured provider is reported as a
 * boolean and a model name with no key material anywhere in the body.
 */

const pool = vi.hoisted(() => ({
  checkHealth: vi.fn(async () => ({ status: 'ok' as 'ok' | 'degraded' | 'unhealthy', latencyMs: 1 })),
}));

vi.mock('../db/pool.js', () => ({
  checkHealth: pool.checkHealth,
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })) }),
}));

import { registerHealth, type HealthDeps } from './health.js';
import type { ExtractClient } from '../extract/client.js';
import type { FetchClient } from '../fetch/client.js';
import type { BrowserPool } from '../browser/pool.js';

const PROVIDER_ENV = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  'HELIX_LLM_MODEL',
  'HELIX_EMBEDDING_MODEL',
  'HELIX_PROXY_URL',
  'SEARXNG_URL',
  'SERPER_API_KEY',
  'SERPAPI_KEY',
];

let app: FastifyInstance;
let savedEnv: Record<string, string | undefined>;

function deps(over: Partial<HealthDeps> & { fetchOk?: boolean; extractOk?: boolean } = {}): HealthDeps {
  const { fetchOk = true, extractOk = true, ...rest } = over;
  return {
    fetchClient: { health: vi.fn(async () => fetchOk) } as unknown as FetchClient,
    extractClient: { health: vi.fn(async () => extractOk) } as unknown as ExtractClient,
    ...rest,
  };
}

function browserPool(): BrowserPool {
  return {
    stats: () => ({ browsers: 1, activeContexts: 2, pagesServed: 30, engines: ['chromium'] }),
    defaultEngine: 'chromium',
  } as unknown as BrowserPool;
}

async function build(d: HealthDeps): Promise<FastifyInstance> {
  const built = Fastify();
  await built.register(
    async (instance) => {
      await registerHealth(instance, d);
    },
    { prefix: '/v1' },
  );
  await built.ready();
  return built;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(PROVIDER_ENV.map((k) => [k, process.env[k]]));
  for (const k of PROVIDER_ENV) delete process.env[k];
  pool.checkHealth.mockResolvedValue({ status: 'ok', latencyMs: 1 });
});

afterEach(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
  vi.clearAllMocks();
});

describe('status roll-up', () => {
  it('reports ok with 200 when every check passes', async () => {
    app = await build(deps());

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('reports degraded with 200 when postgres is degraded', async () => {
    pool.checkHealth.mockResolvedValue({ status: 'degraded', latencyMs: 900 });
    app = await build(deps());

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    // Degraded is still serving, so a load balancer must keep the instance in.
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('degraded');
  });

  it('reports unhealthy with 503 when postgres is down', async () => {
    pool.checkHealth.mockResolvedValue({ status: 'unhealthy', latencyMs: 0 });
    app = await build(deps());

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe('unhealthy');
  });

  it('reports unhealthy when the fetch service is unreachable', async () => {
    app = await build(deps({ fetchOk: false }));

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json().services.fetch).toMatchObject({ status: 'unhealthy', detail: 'unreachable' });
  });

  it('reports unhealthy when the extract service is unreachable', async () => {
    app = await build(deps({ extractOk: false }));

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json().services.extract).toMatchObject({ status: 'unhealthy' });
  });

  it('lets unhealthy win over degraded rather than averaging the two', async () => {
    pool.checkHealth.mockResolvedValue({ status: 'degraded', latencyMs: 900 });
    app = await build(deps({ fetchOk: false }));

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe('unhealthy');
  });

  it('reports each service with its own latency', async () => {
    app = await build(deps());

    const services = (await app.inject({ method: 'GET', url: '/v1/health' })).json().services;

    for (const name of ['postgres', 'fetch', 'extract']) {
      expect(services[name].latencyMs).toBeTypeOf('number');
    }
  });

  it('includes the api version', async () => {
    app = await build(deps());

    expect((await app.inject({ method: 'GET', url: '/v1/health' })).json().version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('optional tiers appear only when enabled', () => {
  it('omits browser, lightpanda, camoufox and remoteBrowser when none are configured', async () => {
    app = await build(deps());

    const services = (await app.inject({ method: 'GET', url: '/v1/health' })).json().services;

    expect(services.browser).toBeUndefined();
    expect(services.lightpanda).toBeUndefined();
    expect(services.camoufox).toBeUndefined();
    expect(services.remoteBrowser).toBeUndefined();
  });

  it('reports the browser pool counters when a pool is present', async () => {
    app = await build(deps({ browserPool: browserPool() }));

    const services = (await app.inject({ method: 'GET', url: '/v1/health' })).json().services;

    expect(services.browser.status).toBe('ok');
    expect(services.browser.detail).toContain('1 browsers');
    expect(services.browser.detail).toContain('chromium');
  });

  it('reports lightpanda as enabled when the tier is on', async () => {
    app = await build(deps({ lightpandaEnabled: true }));

    const services = (await app.inject({ method: 'GET', url: '/v1/health' })).json().services;

    expect(services.lightpanda).toEqual({ status: 'ok', detail: 'enabled', latencyMs: 0 });
  });

  it('reports camoufox as enabled when the tier is on', async () => {
    app = await build(deps({ camoufoxEnabled: true }));

    const services = (await app.inject({ method: 'GET', url: '/v1/health' })).json().services;

    expect(services.camoufox).toEqual({ status: 'ok', detail: 'enabled', latencyMs: 0 });
  });

  it('reports a remote browser when the render tier connects out', async () => {
    app = await build(deps({ remoteCdpConfigured: true }));

    const services = (await app.inject({ method: 'GET', url: '/v1/health' })).json().services;

    expect(services.remoteBrowser.status).toBe('ok');
  });

  it('does not let an enabled optional tier change the overall status', async () => {
    pool.checkHealth.mockResolvedValue({ status: 'unhealthy', latencyMs: 0 });
    app = await build(deps({ lightpandaEnabled: true, camoufoxEnabled: true }));

    expect((await app.inject({ method: 'GET', url: '/v1/health' })).json().status).toBe('unhealthy');
  });
});

describe('provider reporting', () => {
  it('reports the llm as unconfigured when no vendor key is present', async () => {
    app = await build(deps());

    const providers = (await app.inject({ method: 'GET', url: '/v1/health' })).json().providers;

    expect(providers.llm).toEqual({ configured: false, model: 'unset', detected: [] });
  });

  it.each([
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY',
    'OPENAI_COMPATIBLE_API_KEY',
  ])('reports the llm as configured from %s without echoing it', async (variable) => {
    process.env[variable] = 'sk-super-secret-value-1234567890';
    app = await build(deps());

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.json().providers.llm.configured).toBe(true);
    expect(response.body).not.toContain('sk-super-secret-value-1234567890');
  });

  it('reports the selected model name, which is not a secret', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-secret';
    process.env['HELIX_LLM_MODEL'] = 'gpt-4o-mini';
    app = await build(deps());

    expect((await app.inject({ method: 'GET', url: '/v1/health' })).json().providers.llm.model).toBe('gpt-4o-mini');
  });

  it('reports the embedding model as always configured, the local model needing no key', async () => {
    app = await build(deps());

    expect((await app.inject({ method: 'GET', url: '/v1/health' })).json().providers.embedding).toEqual({
      configured: true,
      model: 'local',
    });
  });

  it('reports the proxy as a boolean and never as its url, which carries credentials', async () => {
    process.env['HELIX_PROXY_URL'] = 'http://user:hunter2@proxy.internal:8080';
    app = await build(deps());

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.json().providers.proxy).toEqual({ configured: true });
    expect(response.body).not.toContain('hunter2');
    expect(response.body).not.toContain('proxy.internal');
  });

  it.each(['SEARXNG_URL', 'SERPER_API_KEY', 'SERPAPI_KEY'])(
    'reports search as configured from %s without echoing it',
    async (variable) => {
      process.env[variable] = 'search-secret-value-abcdef';
      app = await build(deps());

      const response = await app.inject({ method: 'GET', url: '/v1/health' });

      expect(response.json().providers.search).toEqual({ configured: true });
      expect(response.body).not.toContain('search-secret-value-abcdef');
    },
  );

  it('reports search as unconfigured when no provider is set', async () => {
    app = await build(deps());

    expect((await app.inject({ method: 'GET', url: '/v1/health' })).json().providers.search).toEqual({
      configured: false,
    });
  });

  /**
   * The blanket check. Every provider entry is a boolean plus at most a model
   * name, so no value from any credential variable may appear anywhere in the
   * body — including under a key nobody thought to assert on individually.
   */
  it('leaks no credential value anywhere in the response with every provider configured', async () => {
    const secrets: Record<string, string> = {
      OPENAI_API_KEY: 'sk-openai-AAAAAAAAAAAA',
      ANTHROPIC_API_KEY: 'sk-ant-BBBBBBBBBBBB',
      GEMINI_API_KEY: 'gem-CCCCCCCCCCCC',
      GOOGLE_API_KEY: 'goog-DDDDDDDDDDDD',
      OPENROUTER_API_KEY: 'or-EEEEEEEEEEEE',
      OPENAI_COMPATIBLE_API_KEY: 'oc-FFFFFFFFFFFF',
      HELIX_PROXY_URL: 'http://u:GGGGGGGGGGGG@proxy:8080',
      SEARXNG_URL: 'http://searx.internal:8888',
      SERPER_API_KEY: 'serper-HHHHHHHHHHHH',
      SERPAPI_KEY: 'serpapi-IIIIIIIIIIII',
    };
    for (const [k, v] of Object.entries(secrets)) process.env[k] = v;
    app = await build(deps({ browserPool: browserPool(), lightpandaEnabled: true, camoufoxEnabled: true }));

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    for (const value of Object.values(secrets)) {
      expect(response.body).not.toContain(value);
    }
    expect(response.json().providers).toEqual({
      llm: { configured: true, model: 'unset', detected: [] },
      embedding: { configured: true, model: 'local' },
      proxy: { configured: true },
      search: { configured: true },
    });
  });

  it('exposes no key beyond the four provider entries, so a new secret cannot be added silently', async () => {
    app = await build(deps());

    const providers = (await app.inject({ method: 'GET', url: '/v1/health' })).json().providers;

    expect(Object.keys(providers).sort()).toEqual(['embedding', 'llm', 'proxy', 'search']);
    // `detected` carries runtime names only, never an address or a model list.
    expect(Object.keys(providers.llm).sort()).toEqual(['configured', 'detected', 'model']);
    expect(Object.keys(providers.proxy)).toEqual(['configured']);
    expect(Object.keys(providers.search)).toEqual(['configured']);
  });
});

describe('local runtime detection', () => {
  it('names a detected runtime without calling the llm configured or exposing its address', async () => {
    const detectLocal = vi.fn(async () => [
      { provider: 'ollama' as const, baseUrl: 'http://127.0.0.1:11434/v1', models: ['gemma3:4b'] },
    ]);
    app = await build(deps({ detectLocal }));

    const llm = (await app.inject({ method: 'GET', url: '/v1/health' })).json().providers.llm;

    expect(llm).toEqual({ configured: false, model: 'unset', detected: ['ollama'] });
    expect(JSON.stringify(llm)).not.toContain('11434');
  });
});
