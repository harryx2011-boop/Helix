import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline } from '../core/pipeline.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';
import { checkProxyUrl, checkUrl, type HostResolver } from '../core/url-guard.js';

/**
 * Screenshot-only fast path.
 *
 * Same pipeline `/scrape` uses with `formats: [screenshot]`, minus every other
 * format field in the response. `screenshot` already forces the Chromium tier
 * inside the pipeline, so this saves a caller nothing on tier selection — only
 * on response size and, via `skipExtraction`, on the markdown extraction pass
 * neither this route nor its caller ever reads.
 */

const ScreenshotRequestSchema = z
  .object({
    url: z.string().url(),
    /** Everything below the fold, capped at `MAX_FULL_PAGE_HEIGHT` and said so when clipped. */
    fullPage: z.boolean().default(false),
    /** Capture one element. A selector matching nothing warns rather than silently framing the page. */
    selector: z.string().min(1).max(500).optional(),
    clip: z
      .object({
        x: z.number().int().min(0),
        y: z.number().int().min(0),
        width: z.number().int().min(1).max(10_000),
        height: z.number().int().min(1).max(10_000),
      })
      .optional(),
    format: z.enum(['png', 'jpeg', 'webp']).default('png'),
    /** JPEG and WebP only; ignored on PNG, which has no lossy setting. */
    quality: z.number().int().min(1).max(100).optional(),
    /** Transparent where the page paints nothing. Ignored on JPEG, which has no alpha. */
    omitBackground: z.boolean().default(false),
    viewport: z
      .object({
        width: z.number().int().min(200).max(3840),
        height: z.number().int().min(200).max(2160),
        dpr: z.number().min(1).max(3).optional(),
      })
      .optional(),
    /** Emulates the dark colour scheme, for pages that honour prefers-color-scheme. */
    darkMode: z.boolean().default(false),
    /** Keeps ad and consent-dialog chrome out of the frame. */
    blockAds: z.boolean().default(false),
    mobile: z.boolean().default(false),
    proxy: z.string().optional(),
    tier: z.enum(['auto', 'chromium', 'camoufox']).default('auto'),
    waitFor: z.number().int().min(0).max(30_000).optional(),
    timeout: z.number().int().min(1_000).max(300_000).default(30_000),
    actions: z.array(z.unknown()).max(50).optional(),
    profile: z.string().optional(),
  })
  .superRefine((body, ctx) => {
    // Both name a region; honouring one silently would return an image that
    // is not what either asked for.
    if (body.selector && body.clip) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clip'],
        message: 'cannot be combined with `selector`: both choose what to capture',
      });
    }
    if (body.viewport && body.mobile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viewport'],
        message: 'cannot be combined with `mobile`, which sets its own phone viewport',
      });
    }
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

    // A caller's proxy is a host this instance connects to; the operator's is trusted.
    if (body.proxy !== undefined) {
      const proxyVerdict = await checkProxyUrl(body.proxy, { allowPrivate: deps.allowPrivateUrls, resolve: deps.resolveHost });
      if (!proxyVerdict.ok) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: `proxy: ${proxyVerdict.reason}`,
          field: 'proxy',
          requestId: request.id,
        });
      }
    }

    const result = await runPipeline(
      {
        url: body.url,
        formats: ['screenshot'],
        tier: body.tier,
        mobile: body.mobile,
        screenshotOptions: {
          fullPage: body.fullPage,
          format: body.format,
          ...(body.quality !== undefined ? { quality: body.quality } : {}),
          ...(body.selector ? { selector: body.selector } : {}),
          ...(body.clip ? { clip: body.clip } : {}),
          omitBackground: body.omitBackground,
        },
        blockAds: body.blockAds,
        darkMode: body.darkMode,
        ...(body.viewport
          ? {
              viewport: {
                width: body.viewport.width,
                height: body.viewport.height,
                ...(body.viewport.dpr !== undefined ? { deviceScaleFactor: body.viewport.dpr } : {}),
              },
            }
          : {}),
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
    // A clipped full-page capture, or a selector that matched nothing, returns
    // an image that looks like what was asked for. The capture layer says so;
    // this is where the caller hears it.
    if (result.screenshotResult?.warning) warnings.push(result.screenshotResult.warning);

    const captured = result.screenshotResult;
    const format = captured?.format ?? body.format;

    return reply.code(200).send({
      success: true,
      data: {
        screenshot: result.content.screenshot
          ? `data:image/${format};base64,${result.content.screenshot}`
          : null,
        format,
        bytes: captured?.bytes ?? null,
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
