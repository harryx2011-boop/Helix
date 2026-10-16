import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
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
