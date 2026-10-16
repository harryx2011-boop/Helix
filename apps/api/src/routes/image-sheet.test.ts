import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { registerImageSheet, type ImageSheetRouteDeps } from './image-sheet.js';
import type { ProviderResult, SearchHit, SearchProvider, SearchQuery } from '../search/providers.js';

function image(n: number, extra: Partial<SearchHit> = {}): SearchHit {
  return {
    title: `Image ${n}`,
    url: `https://site${n}.test/page`,
    position: n,
    source: 'images',
    imageUrl: `https://cdn${n}.test/full.jpg`,
    thumbnailUrl: `https://cdn${n}.test/thumb.jpg`,
    width: 1920,
    height: 1080,
    ...extra,
  };
}

function providerReturning(
  pages: SearchHit[][] | ((query: SearchQuery) => SearchHit[]),
  failures: ProviderResult['failures'] = [],
): SearchProvider & { search: ReturnType<typeof vi.fn> } {
  return {
    name: 'fake',
    configured: () => true,
    search: vi.fn(async (query: SearchQuery): Promise<ProviderResult> => ({
      hits: typeof pages === 'function' ? pages(query) : (pages[(query.page ?? 1) - 1] ?? []),
      failures,
    })),
  };
}

async function build(overrides: Partial<ImageSheetRouteDeps> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  await registerImageSheet(app, { provider: providerReturning([[image(1), image(2)]]), ...overrides });
  return app;
}

async function post(app: FastifyInstance, body: unknown) {
  const response = await app.inject({ method: 'POST', url: '/image-sheet', payload: body as object });
  return { status: response.statusCode, body: response.json() };
}

describe('POST /image-sheet', () => {
  it('turns image hits into sheet entries', async () => {
    const { status, body } = await post(await build(), { query: 'storm clouds' });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.images).toEqual([
      {
        imageUrl: 'https://cdn1.test/full.jpg',
        thumbnailUrl: 'https://cdn1.test/thumb.jpg',
        sourcePage: 'https://site1.test/page',
        title: 'Image 1',
        width: 1920,
        height: 1080,
      },
      {
        imageUrl: 'https://cdn2.test/full.jpg',
        thumbnailUrl: 'https://cdn2.test/thumb.jpg',
        sourcePage: 'https://site2.test/page',
        title: 'Image 2',
        width: 1920,
        height: 1080,
      },
    ]);
    expect(body.metadata).toMatchObject({ backend: 'fake', pagesFetched: 2, candidates: 2, kept: 2 });
  });

  it('filters by size, aspect, duplicate and missing image, and counts each', async () => {
    const provider = providerReturning([
      [
        image(1),
        image(2, { width: 100, height: 100 }),
        image(3, { width: 3000, height: 500 }),
        image(4, { imageUrl: 'https://cdn1.test/full.jpg#again' }),
        image(5, { imageUrl: undefined }),
        image(6, { width: undefined, height: undefined }),
        image(7, { imageUrl: 'data:image/png;base64,AAAA' }),
      ],
    ]);
    const { body } = await post(await build({ provider }), {
      query: 'x',
      minWidth: 640,
      minHeight: 360,
      maxAspect: 2.5,
    });

    expect(body.data.images.map((i: { title: string }) => i.title)).toEqual(['Image 1', 'Image 6']);
    expect(body.data.images[1]).not.toHaveProperty('width');
    expect(body.metadata).toMatchObject({
      candidates: 7,
      kept: 2,
      filtered: { size: 1, aspect: 1, duplicate: 1, noImage: 2 },
      unsized: 1,
    });
  });

  it('warns when a size filter could not be applied to unsized images', async () => {
    const provider = providerReturning([[image(1), image(2, { width: undefined, height: undefined }), image(3, { width: undefined, height: undefined })]]);
    const { body } = await post(await build({ provider }), { query: 'x', minWidth: 1920 });

    expect(body.data.images).toHaveLength(3);
    expect(body.metadata.unsized).toBe(2);
    expect(body.warnings.join(' ')).toMatch(/2 results? .*kept.*no (pixel )?size/i);

    const none = await post(await build({ provider }), { query: 'x' });
    expect(none.body.warnings).toEqual([]);
  });

  it('drops unsized images when dropUnsized is set', async () => {
    const provider = providerReturning([[image(1), image(2, { width: undefined, height: undefined })]]);
    const { body } = await post(await build({ provider }), { query: 'x', minWidth: 640, dropUnsized: true });

    expect(body.data.images.map((i: { title: string }) => i.title)).toEqual(['Image 1']);
    expect(body.metadata).toMatchObject({ kept: 1, unsized: 0, filtered: { unsized: 1 } });
    expect(body.warnings).toEqual([]);
  });

  it('applies minAspect and keeps only landscape-or-wider images', async () => {
    const provider = providerReturning([[image(1), image(2, { width: 1000, height: 1000 }), image(3, { width: 500, height: 1000 })]]);
    const { body } = await post(await build({ provider }), { query: 'x', minAspect: 1.5 });

    expect(body.data.images.map((i: { title: string }) => i.title)).toEqual(['Image 1']);
    expect(body.metadata.filtered.aspect).toBe(2);
  });

  it('passes domain filters to the backend query', async () => {
    const provider = providerReturning([[image(1)]]);
    await post(await build({ provider }), {
      query: 'x',
      includeDomains: ['a.test'],
      excludeDomains: ['b.test'],
    });
    expect(provider.search.mock.calls[0]?.[0]).toMatchObject({
      includeDomains: ['a.test'],
      excludeDomains: ['b.test'],
    });
  });

  it('drops a non-http thumbnail and source page instead of passing it on', async () => {
    const provider = providerReturning([
      [image(1, { thumbnailUrl: 'data:image/png;base64,AAAA', url: 'javascript:alert(1)' })],
    ]);
    const { body } = await post(await build({ provider }), { query: 'x' });

    expect(body.data.images).toHaveLength(1);
    expect(body.data.images[0]).not.toHaveProperty('thumbnailUrl');
    expect(body.data.images[0]).not.toHaveProperty('sourcePage');
  });

  it('reads several pages, asks only for images and truncates to the limit', async () => {
    const provider = providerReturning([[image(1), image(2)], [image(3), image(4)], [image(5)]]);
    const { body } = await post(await build({ provider }), { query: 'x', pages: 3, limit: 3 });

    expect(provider.search).toHaveBeenCalledTimes(3);
    const calls = provider.search.mock.calls.map((c) => c[0] as SearchQuery);
    expect(calls.map((c) => c.page).sort()).toEqual([1, 2, 3]);
    expect(calls.every((c) => c.sources.length === 1 && c.sources[0] === 'images')).toBe(true);
    expect(body.data.images).toHaveLength(3);
    expect(body.data.images.map((i: { title: string }) => i.title)).toEqual(['Image 1', 'Image 2', 'Image 3']);
    expect(body.metadata.pagesFetched).toBe(3);
  });

  it('adds motion-reference terms to the query', async () => {
    const provider = providerReturning([[image(1)]]);
    await post(await build({ provider }), { query: 'car chase', motionReference: true });
    expect((provider.search.mock.calls[0]?.[0] as SearchQuery).query).toBe('car chase storyboard frame keyframe');
  });

  it('keeps going when one page fails and says so', async () => {
    const provider: SearchProvider = {
      name: 'fake',
      configured: () => true,
      search: vi.fn(async (query: SearchQuery): Promise<ProviderResult> => {
        if (query.page === 2) throw new Error('boom');
        return { hits: [image(1)], failures: [] };
      }),
    };
    const { status, body } = await post(await build({ provider }), { query: 'x', pages: 2 });

    expect(status).toBe(200);
    expect(body.data.images).toHaveLength(1);
    expect(body.metadata.pagesFetched).toBe(1);
    expect(body.warnings.join(' ')).toMatch(/page 2.*boom/);
  });

  it('answers 502 when every page fails', async () => {
    const provider = providerReturning([[]], [{ source: 'images', message: 'searxng answered HTTP 500 for images' }]);
    const { status, body } = await post(await build({ provider }), { query: 'x' });
    expect(status).toBe(502);
    expect(body.error).toBe('search_failed');
  });

  it('rejects a bad request with 400 and names the field', async () => {
    const { status, body } = await post(await build(), { query: '' });
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: 'invalid_request', field: 'query' });

    const over = await post(await build({ maxResults: 10 }), { query: 'x', limit: 11 });
    expect(over.status).toBe(400);
    expect(over.body.field).toBe('limit');
  });

  it('answers 503 when no search backend is configured', async () => {
    const { status, body } = await post(await build({ provider: undefined }), { query: 'x' });
    expect(status).toBe(503);
    expect(body.error).toBe('search_unavailable');
  });
});

/** A 64x48 PNG: a left-to-right or right-to-left ramp, optionally dimmed or noisy, so its dHash is known. */
async function ramp(direction: 'rtl' | 'ltr', { dim = 0, width = 64 }: { dim?: number; width?: number } = {}): Promise<Buffer> {
  const w = 64;
  const raw = Buffer.alloc(w * 48);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < w; x++) {
      const v = direction === 'ltr' ? x * 3 : 255 - x * 3;
      raw[y * w + x] = Math.max(0, v - dim);
    }
  }
  return sharp(raw, { raw: { width: w, height: 48, channels: 1 } })
    .resize(width, Math.round((width * 48) / 64))
    .png()
    .toBuffer();
}

describe('POST /image-sheet visual dedupe and PNG sheet', () => {
  async function fixtures() {
    const files = new Map<string, Buffer>([
      ['https://cdn1.test/thumb.jpg', await ramp('ltr')],
      ['https://cdn2.test/thumb.jpg', await ramp('ltr', { dim: 12, width: 40 })],
      ['https://cdn3.test/thumb.jpg', await ramp('rtl')],
    ]);
    const fetchImage = vi.fn(async (url: string) => files.get(url));
    return { fetchImage };
  }

  it('does not download anything unless asked', async () => {
    const { fetchImage } = await fixtures();
    const { body } = await post(await build({ fetchImage }), { query: 'x' });
    expect(fetchImage).not.toHaveBeenCalled();
    expect(body.metadata.filtered.nearDuplicate).toBe(0);
  });

  it('drops a near-duplicate with a different URL when visualDedupe is on', async () => {
    const { fetchImage } = await fixtures();
    const provider = providerReturning([[image(1), image(2), image(3)]]);
    const { body } = await post(await build({ provider, fetchImage }), { query: 'x', visualDedupe: true });

    expect(body.data.images.map((i: { title: string }) => i.title)).toEqual(['Image 1', 'Image 3']);
    expect(body.metadata.filtered).toMatchObject({ duplicate: 0, nearDuplicate: 1 });
    expect(body.metadata).toMatchObject({ candidates: 3, kept: 2 });
    expect(body.data.sheet).toBeUndefined();
  });

  it('fills the limit from later images after dropping near-duplicates', async () => {
    const { fetchImage } = await fixtures();
    const provider = providerReturning([[image(1), image(2), image(3)]]);
    const { body } = await post(await build({ provider, fetchImage }), { query: 'x', visualDedupe: true, limit: 2 });
    expect(body.data.images.map((i: { title: string }) => i.title)).toEqual(['Image 1', 'Image 3']);
  });

  it('keeps an image it could not fetch and warns', async () => {
    const { fetchImage } = await fixtures();
    const provider = providerReturning([[image(1), image(9)]]);
    const { body } = await post(await build({ provider, fetchImage }), { query: 'x', visualDedupe: true });

    expect(body.data.images).toHaveLength(2);
    expect(body.metadata.unhashed).toBe(1);
    expect(body.warnings.join(' ')).toMatch(/1 image .*could not be fetched or decoded/);
  });

  it('falls back to the full image when the thumbnail cannot be fetched', async () => {
    const files = new Map<string, Buffer>([['https://cdn1.test/full.jpg', await ramp('ltr')]]);
    const fetchImage = vi.fn(async (url: string) => files.get(url));
    const { body } = await post(await build({ fetchImage }), { query: 'x', visualDedupe: true });
    expect(body.metadata.unhashed).toBe(1);
    expect(fetchImage.mock.calls.map((c) => c[0])).toContain('https://cdn1.test/full.jpg');
  });

  it('returns a PNG contact sheet as a data URI with a cell for every image', async () => {
    const { fetchImage } = await fixtures();
    const provider = providerReturning([[image(1), image(2), image(3), image(9)]]);
    const { status, body } = await post(await build({ provider, fetchImage }), { query: 'x', render: 'png' });

    expect(status).toBe(200);
    expect(body.data.images.map((i: { title: string }) => i.title)).toEqual(['Image 1', 'Image 3', 'Image 9']);
    const { image: uri, columns, rows, cellWidth, cellHeight, cells } = body.data.sheet;
    expect(uri).toMatch(/^data:image\/png;base64,/);
    expect(cells).toBe(3);
    const png = sharp(Buffer.from(uri.split(',')[1], 'base64'));
    const meta = await png.metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(columns * cellWidth + (columns + 1) * 4);
    expect(meta.height).toBe(rows * cellHeight + (rows + 1) * 4);
    expect(rows * columns).toBeGreaterThanOrEqual(3);
  });

  it('caps the sheet at 24 cells and says so', async () => {
    const png = await ramp('ltr');
    const hits = Array.from({ length: 30 }, (_, i) => image(i + 1));
    const fetchImage = vi.fn(async () => png);
    const { body } = await post(await build({ provider: providerReturning([hits]), fetchImage, maxResults: 50 }), {
      query: 'x',
      limit: 30,
      render: 'png',
      visualDedupe: false,
    });
    expect(body.data.images).toHaveLength(30);
    expect(body.data.sheet.cells).toBe(24);
    expect(body.warnings.join(' ')).toMatch(/sheet shows the first 24 of 30/);
  });

  it('omits the sheet and warns when no image could be decoded', async () => {
    const fetchImage = vi.fn(async () => undefined);
    const { body } = await post(await build({ fetchImage }), { query: 'x', render: 'png' });
    expect(body.data.sheet).toBeUndefined();
    expect(body.warnings.join(' ')).toMatch(/no image could be fetched/i);
  });

  it('rejects an unknown render mode', async () => {
    const { status, body } = await post(await build(), { query: 'x', render: 'gif' });
    expect(status).toBe(400);
    expect(body.field).toBe('render');
  });
});
