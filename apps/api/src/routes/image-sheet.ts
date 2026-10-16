import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SearchHit, SearchProvider } from '../search/providers.js';
import { mapWithLimit } from './search.js';
import {
  composeSheet,
  dHash,
  fetchImageBytes,
  hamming,
  MAX_CELLS,
  NEAR_DUPLICATE_BITS,
  type ImageFetcher,
} from '../images/visual.js';

/**
 * A contact sheet of image search results: several pages of the backend's
 * Images category, filtered by size and aspect, deduplicated, one JSON row per
 * image. By default nothing is downloaded, so the instance never connects to an
 * image host. `visualDedupe` and `render: "png"` fetch each image's thumbnail
 * (egress-guarded) to drop near-duplicates by perceptual hash and to draw one PNG.
 */

const DomainSchema = z
  .string()
  .max(253)
  .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i, 'expected a hostname such as example.com');

const ImageSheetRequestSchema = z
  .object({
    query: z.string().min(1).max(500),
    limit: z.number().int().min(1).default(24),
    pages: z.number().int().min(1).max(5).default(2),
    minWidth: z.number().int().min(1).optional(),
    minHeight: z.number().int().min(1).optional(),
    /** Width over height; 1 is square, above 1 is landscape. */
    minAspect: z.number().positive().optional(),
    maxAspect: z.number().positive().optional(),
    /** Exclude images the backend gave no pixel size for, instead of keeping them unfiltered. */
    dropUnsized: z.boolean().default(false),
    motionReference: z.boolean().default(false),
    /** `json` returns rows only; `png` also draws a contact sheet. Default json. */
    render: z.enum(['json', 'png']).default('json'),
    /** Fetch thumbnails and drop near-duplicates. Defaults to on when `render` is `png`. */
    visualDedupe: z.boolean().optional(),
    lang: z
      .string()
      .regex(/^[a-z]{2}$/i, 'expected a two-letter language code')
      .optional(),
    country: z
      .string()
      .regex(/^[a-z]{2}$/i, 'expected a two-letter country code')
      .optional(),
    // Domain filters reach the backend only as `site:` operators; the rows are not
    // post-filtered, so a backend that ignores operators drops them silently.
    includeDomains: z.array(DomainSchema).max(20).default([]),
    excludeDomains: z.array(DomainSchema).max(20).default([]),
  })
  .refine((b) => b.minAspect === undefined || b.maxAspect === undefined || b.minAspect <= b.maxAspect, {
    message: 'must not be above maxAspect',
    path: ['minAspect'],
  });

export interface ImageSheetRouteDeps {
  provider: SearchProvider | undefined;
  /** Operator ceiling on `limit`. */
  maxResults?: number | undefined;
  /** Wall-clock budget for one call. */
  maxDurationMs?: number | undefined;
  /** Test seam: how thumbnails are fetched. */
  fetchImage?: ImageFetcher | undefined;
}

export interface ImageSheetEntry {
  imageUrl: string;
  thumbnailUrl?: string | undefined;
  sourcePage?: string | undefined;
  title: string;
  width?: number | undefined;
  height?: number | undefined;
}

const MOTION_TERMS = 'storyboard frame keyframe';
const PAGE_CONCURRENCY = 3;
/** What one backend call may return; the sheet's own `limit` is applied after filtering. */
const PER_PAGE = 50;
/** Wall-clock budget for fetching every thumbnail of one call. */
const IMAGE_FETCH_BUDGET_MS = 20_000;
const IMAGE_CONCURRENCY = 6;

/** An http(s) URL without its fragment, host lowercased; anything else (a data: URI, a script URL) is undefined. */
function webUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.hash = '';
    return url.href;
  } catch {
    return undefined;
  }
}

export async function registerImageSheet(app: FastifyInstance, deps: ImageSheetRouteDeps): Promise<void> {
  const maxResults = deps.maxResults ?? 50;
  const maxDurationMs = deps.maxDurationMs ?? 60_000;
  const fetchImage = deps.fetchImage ?? fetchImageBytes;

  app.post('/image-sheet', async (request, reply) => {
    const parsed = ImageSheetRequestSchema.safeParse(request.body);

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

    if (body.limit > maxResults) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `limit: must be at most ${maxResults} on this instance`,
        field: 'limit',
        requestId: request.id,
      });
    }

    const provider = deps.provider;
    if (!provider?.configured()) {
      return reply.code(503).send({
        error: 'search_unavailable',
        message:
          'No search backend is configured. Set SEARXNG_URL for a self-hosted SearXNG ' +
          'instance, or SERPER_API_KEY / SERPAPI_KEY for a hosted SERP provider.',
        requestId: request.id,
      });
    }

    const query = body.motionReference ? `${body.query} ${MOTION_TERMS}` : body.query;
    const signal = AbortSignal.timeout(maxDurationMs);
    const warnings: string[] = [];
    const failureMessages: string[] = [];

    const pages = await mapWithLimit(
      Array.from({ length: body.pages }, (_, i) => i + 1),
      PAGE_CONCURRENCY,
      async (page): Promise<SearchHit[] | undefined> => {
        try {
          const outcome = await provider.search(
            {
              query,
              limit: PER_PAGE,
              sources: ['images'],
              page,
              lang: body.lang?.toLowerCase(),
              country: body.country?.toLowerCase(),
              includeDomains: body.includeDomains,
              excludeDomains: body.excludeDomains,
            },
            signal,
          );
          for (const failure of outcome.failures) {
            failureMessages.push(`page ${page}: ${failure.message}`);
          }
          return outcome.failures.length > 0 && outcome.hits.length === 0 ? undefined : outcome.hits;
        } catch (error) {
          failureMessages.push(`page ${page}: ${error instanceof Error ? error.message : 'the search backend failed'}`);
          return undefined;
        }
      },
    );

    const answered = pages.filter((p): p is SearchHit[] => p !== undefined);
    if (answered.length === 0) {
      return reply.code(502).send({
        error: 'search_failed',
        message: failureMessages.join('; ') || 'The search backend failed.',
        requestId: request.id,
      });
    }
    warnings.push(...failureMessages);

    const visual = body.visualDedupe ?? body.render === 'png';
    const fetching = visual || body.render === 'png';
    // With near-duplicates to drop, read past `limit` so the sheet can still fill.
    const take = fetching ? Math.min(body.limit * 2, maxResults * 2) : body.limit;
    const filtered = { size: 0, aspect: 0, duplicate: 0, nearDuplicate: 0, noImage: 0, unsized: 0 };
    let unsized = 0;
    let candidates = 0;
    const seen = new Set<string>();
    const survivors: ImageSheetEntry[] = [];

    for (const hit of answered.flat()) {
      candidates++;
      const key = webUrl(hit.imageUrl);
      if (!key) {
        filtered.noImage++;
        continue;
      }
      if (seen.has(key)) {
        filtered.duplicate++;
        continue;
      }
      seen.add(key);

      const { width, height } = hit;
      if (width && height) {
        if ((body.minWidth && width < body.minWidth) || (body.minHeight && height < body.minHeight)) {
          filtered.size++;
          continue;
        }
        const aspect = width / height;
        if ((body.minAspect && aspect < body.minAspect) || (body.maxAspect && aspect > body.maxAspect)) {
          filtered.aspect++;
          continue;
        }
      } else if (body.dropUnsized) {
        filtered.unsized++;
        continue;
      } else {
        // A backend that does not report pixels cannot be judged; keep the image and say so.
        unsized++;
      }

      if (survivors.length >= take) continue;
      survivors.push({
        imageUrl: hit.imageUrl as string,
        thumbnailUrl: webUrl(hit.thumbnailUrl),
        sourcePage: webUrl(hit.url),
        title: hit.title,
        width: width && height ? width : undefined,
        height: width && height ? height : undefined,
      });
    }

    let images = survivors;
    let unhashed = 0;
    let sheet: Awaited<ReturnType<typeof composeSheet>> | undefined;
    if (fetching && survivors.length > 0) {
      const budget = AbortSignal.timeout(IMAGE_FETCH_BUDGET_MS);
      const bytes = await mapWithLimit(survivors, IMAGE_CONCURRENCY, async (entry) => {
        for (const url of [entry.thumbnailUrl, entry.imageUrl]) {
          const data = url ? await fetchImage(url, budget) : undefined;
          const hash = data ? await dHash(data) : undefined;
          if (data && hash !== undefined) return { data, hash };
        }
        return undefined;
      });

      const kept: { entry: ImageSheetEntry; data?: Buffer | undefined }[] = [];
      const hashes: bigint[] = [];
      survivors.forEach((entry, i) => {
        const got = bytes[i];
        if (kept.length >= body.limit) return;
        if (visual && got && hashes.some((h) => hamming(h, got.hash) <= NEAR_DUPLICATE_BITS)) {
          filtered.nearDuplicate++;
          return;
        }
        if (got) hashes.push(got.hash);
        else unhashed++;
        kept.push({ entry, data: got?.data });
      });
      images = kept.map((k) => k.entry);

      if (unhashed > 0) {
        warnings.push(
          `${unhashed} image${unhashed === 1 ? '' : 's'} could not be fetched or decoded${visual ? ', so ' + (unhashed === 1 ? 'it was' : 'they were') + ' not compared for near-duplicates' : ''}.`,
        );
      }
      if (body.render === 'png') {
        if (kept.some((k) => k.data)) {
          sheet = await composeSheet(kept.map((k) => k.data));
          if (kept.length > MAX_CELLS) warnings.push(`The sheet shows the first ${MAX_CELLS} of ${kept.length} images.`);
        } else {
          warnings.push('No image could be fetched, so no sheet was drawn.');
        }
      }
    }

    const sizeFilterAsked =
      body.minWidth !== undefined || body.minHeight !== undefined || body.minAspect !== undefined || body.maxAspect !== undefined;
    if (sizeFilterAsked && unsized > 0) {
      warnings.push(
        `${unsized} result${unsized === 1 ? ' was' : 's were'} kept unfiltered because the backend gave no size; set dropUnsized to exclude them.`,
      );
    }
    if (images.length === 0) warnings.push('No image passed the filters for this query.');

    return reply.send({
      success: true,
      data: {
        images,
        ...(sheet && {
          sheet: {
            image: `data:image/png;base64,${sheet.png.toString('base64')}`,
            columns: sheet.columns,
            rows: sheet.rows,
            cellWidth: sheet.cellWidth,
            cellHeight: sheet.cellHeight,
            cells: sheet.cells,
          },
        }),
      },
      warnings,
      metadata: {
        backend: provider.name,
        query,
        pagesFetched: answered.length,
        candidates,
        kept: images.length,
        filtered,
        unsized,
        ...(fetching && { unhashed }),
      },
    });
  });
}
