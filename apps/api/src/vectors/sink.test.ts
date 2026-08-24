import { describe, expect, it } from 'vitest';
import { deterministicId } from './sink.js';

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
