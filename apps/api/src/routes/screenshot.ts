import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline } from '../core/pipeline.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';
import { checkUrl, type HostResolver } from '../core/url-guard.js';

/**
 * Screenshot-only fast path.
 *
 * Same pipeline `/scrape` uses with `formats: [screenshot]`, minus every other
 * format field in the response. `screenshot` already forces the Chromium tier
 * inside the pipeline, so this saves a caller nothing on tier selection — only
 * on response size and, via `skipExtraction`, on the markdown extraction pass
 * neither this route nor its caller ever reads.
 */

const ScreenshotRequestSchema = z.object({
  url: z.string().url(),
  mobile: z.boolean().default(false),
  proxy: z.string().optional(),
  tier: z.enum(['auto', 'chromium', 'camoufox']).default('auto'),
  waitFor: z.number().int().min(0).max(30_000).optional(),
  timeout: z.number().int().min(1_000).max(300_000).default(30_000),
  actions: z.array(z.unknown()).max(50).optional(),
  profile: z.string().optional(),
});

export interface ScreenshotRouteDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool | undefined;
  proxyUrl?: string | undefined;
  allowPrivateUrls?: boolean | undefined;
  resolveHost?: HostResolver | undefined;
}

export async function registerScreenshot(app: FastifyInstance, deps: ScreenshotRouteDeps): Promise<void> {
  app.post('/screenshot', async (request, reply) => {
    const parsed = ScreenshotRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({
        error: 'invalid_request',
        message: first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
        field: first?.path.join('.'),
        requestId: request.id,
      });
    }

    const body = parsed.data;

    const urlVerdict = await checkUrl(body.url, { allowPrivate: deps.allowPrivateUrls, resolve: deps.resolveHost });
    if (!urlVerdict.ok) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `url: ${urlVerdict.reason}`,
        field: 'url',
        requestId: request.id,
      });
    }

    const result = await runPipeline(
      {
        url: body.url,
        formats: ['screenshot'],
        tier: body.tier,
        mobile: body.mobile,
        waitFor: body.waitFor,
        timeout: body.timeout,
        actions: body.actions,
        profile: body.profile,
        proxy: body.proxy ?? deps.proxyUrl,
        allowPrivate: deps.allowPrivateUrls,
        skipExtraction: true,
      },
      { fetchClient: deps.fetchClient, extractClient: deps.extractClient, browserPool: deps.browserPool, logger: request.log },
    );

    if (!result.success) {
      return reply.code(200).send({
        success: false,
        failure: {
          url: result.url,
          reason: result.reason,
          detail: result.detail,
          statusCode: result.statusCode,
          detectedBy: result.detectedBy,
          tier: result.tier,
          tiersAttempted: result.tiersAttempted,
          profile: result.profileUsed,
          escalationAvailable: result.escalationAvailable,
        },
      });
    }

    const warnings: string[] = result.warnings ? [...result.warnings] : [];
    if (!result.content.screenshot) {
      warnings.push('screenshot: no image was captured at the tier that succeeded.');
    }

    return reply.code(200).send({
      success: true,
      data: {
        screenshot: result.content.screenshot ? `data:image/png;base64,${result.content.screenshot}` : null,
        metadata: {
          sourceUrl: body.url,
          finalUrl: result.finalUrl ?? body.url,
          statusCode: result.statusCode,
          fetchedAt: new Date().toISOString(),
          tier: result.tier,
          tiersAttempted: result.tiersAttempted,
          profile: result.profileUsed,
          engine: result.engineUsed,
          mobile: body.mobile && result.tier === 'chromium' && result.engineUsed !== 'firefox',
          timingMs: result.timingMs,
        },
      },
      warnings,
    });
  });
}
