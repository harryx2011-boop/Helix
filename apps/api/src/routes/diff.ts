import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { boundedDiff, diffJson, diffText } from '../monitor/diff.js';
import { runPipeline } from '../core/pipeline.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';
import { checkUrl, type HostResolver } from '../core/url-guard.js';
import { tierMemory } from '../core/tier-memory.js';
import { cookieJar } from '../core/cookie-jar.js';

/**
 * One-shot diff, with no monitor and nothing stored.
 *
 * `/monitor` keeps a schedule and a baseline snapshot; this is for a caller
 * that already has two things to compare right now — two pages, or two texts
 * it read itself — and wants the same Myers diff `/monitor` uses, without
 * creating anything that outlives the request.
 */

const MAX_DIFF_BYTES = 128 * 1024;

const TextInputSchema = z.object({ text: z.string() });
const UrlInputSchema = z.object({ url: z.string().url() });
const TextSourceSchema = z.union([TextInputSchema, UrlInputSchema]);

const DiffRequestSchema = z.preprocess(
  (value) => (typeof value === 'object' && value !== null && !('mode' in value) ? { ...value, mode: 'text' } : value),
  z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('text'),
      before: TextSourceSchema,
      after: TextSourceSchema,
      granularity: z.enum(['word', 'line', 'character']).default('word'),
    }),
    z.object({
      mode: z.literal('json'),
      before: z.unknown(),
      after: z.unknown(),
    }),
  ]),
);

export interface DiffRouteDeps {
  fetchClient: FetchClient;
  extractClient: ExtractClient;
  browserPool?: BrowserPool | undefined;
  allowPrivateUrls?: boolean | undefined;
  resolveHost?: HostResolver | undefined;
}

type ResolvedText = { ok: true; text: string } | { ok: false; field: string; message: string };

async function resolveText(
  input: z.infer<typeof TextSourceSchema>,
  field: string,
  deps: DiffRouteDeps,
): Promise<ResolvedText> {
  if ('text' in input) return { ok: true, text: input.text };

  const verdict = await checkUrl(input.url, { allowPrivate: deps.allowPrivateUrls, resolve: deps.resolveHost });
  if (!verdict.ok) return { ok: false, field: `${field}.url`, message: verdict.reason };

  const result = await runPipeline(
    { url: input.url, formats: ['markdown'], allowPrivate: deps.allowPrivateUrls },
    { fetchClient: deps.fetchClient, extractClient: deps.extractClient, browserPool: deps.browserPool, tierMemory, cookieJar },
  );

  if (!result.success) {
    return {
      ok: false,
      field,
      message: `could not read ${input.url}: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`,
    };
  }

  return { ok: true, text: result.content.markdown };
}

export async function registerDiff(app: FastifyInstance, deps: DiffRouteDeps): Promise<void> {
  app.post('/diff', async (request, reply) => {
    const parsed = DiffRequestSchema.safeParse(request.body);

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

    if (body.mode === 'json') {
      const diff = diffJson(body.before, body.after);
      return reply.send({ success: true, diff });
    }

    const [before, after] = await Promise.all([
      resolveText(body.before, 'before', deps),
      resolveText(body.after, 'after', deps),
    ]);

    if (!before.ok) {
      return reply.code(400).send({ error: 'invalid_request', message: before.message, field: before.field, requestId: request.id });
    }
    if (!after.ok) {
      return reply.code(400).send({ error: 'invalid_request', message: after.message, field: after.field, requestId: request.id });
    }

    const diff = diffText(before.text, after.text, body.granularity);
    return reply.send({ success: true, diff: boundedDiff(diff, MAX_DIFF_BYTES) });
  });
}
