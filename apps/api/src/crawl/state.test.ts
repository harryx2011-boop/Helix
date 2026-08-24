import { describe, expect, it } from 'vitest';
import { conditionalHeaders, isUnchanged, type CrawlStateRecord } from './state.js';

const record = (over: Partial<CrawlStateRecord> = {}): CrawlStateRecord => ({
  url: 'https://example.com/page',
  contentHash: 'abc123',
  etag: null,
  lastModified: null,
  statusCode: 200,
  lastSeenAt: new Date('2026-08-01T00:00:00Z'),
  unchangedStreak: 0,
  ...over,
});

describe('conditionalHeaders', () => {
  it('sends nothing for a URL never seen before', () => {
    expect(conditionalHeaders(undefined)).toBeUndefined();
  });

  it('sends If-None-Match when an ETag is known', () => {
    // The only mechanism that avoids the download itself: a 304 has no body.
    expect(conditionalHeaders(record({ etag: '"v1"' }))).toEqual({
      'if-none-match': '"v1"',
    });
  });

  it('sends If-Modified-Since in HTTP date format', () => {
    const headers = conditionalHeaders(
      record({ lastModified: new Date('2026-08-01T12:00:00Z') }),
    );

    // A raw ISO string here would be ignored by most servers.
    expect(headers?.['if-modified-since']).toBe('Sat, 01 Aug 2026 12:00:00 GMT');
  });

  it('sends both validators when both are known', () => {
    const headers = conditionalHeaders(
      record({ etag: '"v1"', lastModified: new Date('2026-08-01T12:00:00Z') }),
    );

    expect(headers).toHaveProperty('if-none-match');
    expect(headers).toHaveProperty('if-modified-since');
  });

  it('sends nothing when only a content hash is known', () => {
    // A content hash cannot be turned into a conditional request — it is only
    // knowable after fetching, so it saves processing rather than bandwidth.
    expect(conditionalHeaders(record({ contentHash: 'abc123' }))).toBeUndefined();
  });
});

describe('isUnchanged', () => {
  it('recognises identical content', () => {
    expect(isUnchanged(record({ contentHash: 'abc' }), 'abc')).toBe(true);
  });

  it('recognises changed content', () => {
    expect(isUnchanged(record({ contentHash: 'abc' }), 'def')).toBe(false);
  });

  it('treats a first visit as changed', () => {
    // Never seen is not the same as unchanged, and must never skip the write.
    expect(isUnchanged(undefined, 'abc')).toBe(false);
  });

  it('treats a missing stored hash as changed', () => {
    expect(isUnchanged(record({ contentHash: null }), 'abc')).toBe(false);
  });
});
