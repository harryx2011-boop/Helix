import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerExtract } from './extract.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';

/**
 * One URL that throws ends the request; the URLs still in flight beside it must
 * be told to stop, or they hold browser contexts and gate slots until their
 * own timeout.
 */
it('aborts the URLs still in flight when one URL throws', async () => {
  let siblingSignal: AbortSignal | undefined;
  const fetchClient = {
    fetch: vi.fn(async (input: { url: string; signal?: AbortSignal }) => {
      if (input.url.includes('bad.example')) throw new Error('fetch service crashed');
      siblingSignal = input.signal;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { success: true, status: 200, headers: {}, body: '<html><body>slow</body></html>', timingMs: 300 };
    }),
    health: vi.fn(async () => true),
  } as unknown as FetchClient;

  const app = Fastify();
  await registerExtract(app, {
    fetchClient,
    extractClient: { extract: vi.fn(), structured: vi.fn(), health: vi.fn() } as unknown as ExtractClient,
    browserPool: {} as BrowserPool,
    resolveHost: async () => ['93.184.216.34'],
  });

  const response = await app.inject({
    method: 'POST',
    url: '/extract',
    payload: { urls: ['https://slow.example/a', 'https://bad.example/b'], prompt: 'x', tier: 'plain' },
  });

  expect(response.statusCode).toBe(500);
  expect(siblingSignal?.aborted).toBe(true);
  await app.close();
});
