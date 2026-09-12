import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicId, QdrantSink, type ChunkToStore } from './sink.js';

describe('deterministicId', () => {
  it('returns the same id for the same chunk every time', () => {
    // The property the whole re-crawl story depends on: crawling a page twice
    // must update its vectors, not append a second copy of every chunk.
    const first = deterministicId('https://example.com/docs', '#pricing:abc123');
    const second = deterministicId('https://example.com/docs', '#pricing:abc123');

    expect(first).toBe(second);
  });

  it('separates chunks within one page', () => {
    const a = deterministicId('https://example.com/docs', '#pricing:abc');
    const b = deterministicId('https://example.com/docs', '#features:def');

    expect(a).not.toBe(b);
  });

  it('separates the same anchor across different pages', () => {
    const a = deterministicId('https://example.com/a', '#intro:abc');
    const b = deterministicId('https://example.com/b', '#intro:abc');

    expect(a).not.toBe(b);
  });

  it('produces a well-formed UUID', () => {
    // Several vector stores validate the format and reject anything else.
    const id = deterministicId('https://example.com/', '#x:y');

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('stamps version 5 and the RFC 4122 variant', () => {
    for (const seed of ['a', 'b', 'c', 'longer-anchor-value', '#deep/path:hash']) {
      const id = deterministicId('https://example.com/', seed);
      expect(id[14]).toBe('5');
      expect(['8', '9', 'a', 'b']).toContain(id[19]);
    }
  });

  it('does not collide across many inputs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5_000; i++) {
      ids.add(deterministicId('https://example.com/page', `#section-${i}:hash${i}`));
    }
    expect(ids.size).toBe(5_000);
  });
});

describe('QdrantSink.store', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function chunk(embedding: number[], anchor = '#a'): ChunkToStore {
    return { text: 'x', anchor, tokens: 1, embedding };
  }

  /* ensureCollection sizes the Qdrant collection from chunk 0's embedding
     alone. If a later chunk in the same batch carries a different length —
     a provider swap mid-crawl, or a bug upstream — Qdrant either rejects the
     whole batch with an opaque error or silently truncates/pads, neither of
     which says which chunk was wrong. */
  it('throws naming the offending index when embeddings disagree in length', async () => {
    const fetchMock = vi.fn(async () => new Response('should not be called', { status: 500 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const sink = new QdrantSink('http://localhost:6333');
    const chunks = [chunk([1, 2, 3]), chunk([1, 2, 3, 4], '#b'), chunk([1, 2], '#c')];

    await expect(
      sink.store({ url: 'https://example.com', collection: 'docs', chunks }),
    ).rejects.toThrow(/index 1.*index 2|1.*2/s);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores normally when every embedding matches chunk 0', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      const target = String(url);
      if (target.endsWith('/collections/docs')) return new Response('', { status: 200 });
      if (target.includes('/points')) return new Response('', { status: 200 });
      return new Response('unexpected', { status: 404 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const sink = new QdrantSink('http://localhost:6333');
    const chunks = [chunk([1, 2, 3]), chunk([4, 5, 6], '#b')];

    const result = await sink.store({ url: 'https://example.com', collection: 'docs', chunks });
    expect(result.stored).toBe(2);
  });
});
