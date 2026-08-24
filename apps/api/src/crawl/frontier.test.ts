import { describe, expect, it } from 'vitest';
import { Frontier } from './frontier.js';

const base = (over: Partial<ConstructorParameters<typeof Frontier>[0]> = {}) =>
  new Frontier({ seedUrl: 'https://example.com/docs', limit: 100, ...over });

describe('Frontier', () => {
  it('accepts a URL once and rejects the repeat', () => {
    const frontier = base();

    expect(frontier.add('https://example.com/docs/a', 1)).toBe(true);
    expect(frontier.add('https://example.com/docs/a', 1)).toBe(false);
    expect(frontier.enqueued).toBe(1);
  });

  it('treats normalised variants as the same page', () => {
    const frontier = base();

    expect(frontier.add('https://example.com/docs/a', 1)).toBe(true);
    // Same document, three spellings.
    expect(frontier.add('https://example.com/docs/a/', 1)).toBe(false);
    expect(frontier.add('https://example.com/docs/a#top', 1)).toBe(false);
    expect(frontier.add('https://www.example.com/docs/a', 1)).toBe(false);
    expect(frontier.enqueued).toBe(1);
  });

  it('keeps the crawl on-site by default', () => {
    const frontier = base();

    expect(frontier.add('https://elsewhere.com/page', 1)).toBe(false);
    expect(frontier.rejections()['off-site']).toBe(1);
  });

  it('follows external links when told to', () => {
    const frontier = base({ allowExternal: true });

    expect(frontier.add('https://elsewhere.com/page', 1)).toBe(true);
  });

  it('excludes subdomains unless allowed', () => {
    expect(base().add('https://blog.example.com/post', 1)).toBe(false);
    expect(base({ allowSubdomains: true }).add('https://blog.example.com/post', 1)).toBe(true);
  });

  it('enforces the depth ceiling', () => {
    const frontier = base({ maxDepth: 2 });

    expect(frontier.add('https://example.com/docs/a', 2)).toBe(true);
    expect(frontier.add('https://example.com/docs/b', 3)).toBe(false);
    expect(frontier.rejections()['too-deep']).toBe(1);
  });

  it('applies include and exclude patterns', () => {
    const frontier = base({ includePaths: ['^/docs'], excludePaths: ['/internal'] });

    expect(frontier.add('https://example.com/docs/public', 1)).toBe(true);
    expect(frontier.add('https://example.com/blog/post', 1)).toBe(false);
    expect(frontier.add('https://example.com/docs/internal/secret', 1)).toBe(false);
  });

  it('fetches the seed even when the path filters would not follow it', () => {
    // The spec's own example: seed the site root, include /blog/*. The root is
    // where the blog links live; filtering it out crawls nothing.
    const frontier = new Frontier({
      seedUrl: 'https://example.com',
      limit: 100,
      includePaths: ['/blog/*'],
    });

    expect(frontier.add('https://example.com', 0)).toBe(true);
    expect(frontier.add('https://example.com/blog/post-1', 1)).toBe(true);
    expect(frontier.add('https://example.com/pricing', 1)).toBe(false);
    expect(frontier.rejections()['not-included']).toBe(1);
  });

  it('applies the filters to any other depth-zero URL and to an excluded seed', () => {
    const filtered = base({ includePaths: ['/blog/*'] });
    expect(filtered.add('https://example.com/pricing', 0)).toBe(false);

    // Off-site still wins: the seed exemption is about path filters only.
    const offSite = new Frontier({ seedUrl: 'https://example.com', limit: 10 });
    expect(offSite.add('https://elsewhere.com', 0)).toBe(false);
  });

  it('accepts a seed with a trailing slash under a directory glob', () => {
    const frontier = new Frontier({
      seedUrl: 'https://example.com/blog/',
      limit: 100,
      includePaths: ['/blog/*'],
    });

    expect(frontier.add('https://example.com/blog/', 0)).toBe(true);
    expect(frontier.add('https://example.com/blog', 1)).toBe(false); // duplicate of the seed
    expect(frontier.rejections()['duplicate']).toBe(1);
  });

  it('lets exclusion win over inclusion', () => {
    // A URL matching both is excluded: the narrower statement is the intent.
    const frontier = base({ includePaths: ['^/docs'], excludePaths: ['^/docs/draft'] });

    expect(frontier.add('https://example.com/docs/draft/x', 1)).toBe(false);
    expect(frontier.rejections()['excluded']).toBe(1);
  });

  it('stops accepting at the limit', () => {
    const frontier = base({ limit: 3 });

    for (let i = 0; i < 10; i++) frontier.add(`https://example.com/docs/${i}`, 1);

    expect(frontier.enqueued).toBe(3);
    expect(frontier.atLimit).toBe(true);
  });

  it('dispenses only to hosts with capacity', () => {
    const frontier = base();
    frontier.add('https://example.com/docs/a', 1);

    expect(frontier.next(() => false)).toBeUndefined();

    const item = frontier.next(() => true);
    expect(item?.url).toBe('https://example.com/docs/a');
    expect(frontier.pending).toBe(0);
  });

  it('skips a busy host to serve one that is free', () => {
    const frontier = base({ allowExternal: true });
    frontier.add('https://busy.com/a', 1);
    frontier.add('https://free.com/b', 1);

    // Head-of-line blocking would leave a crawl idle behind one slow host.
    const item = frontier.next((site) => site === 'free.com');
    expect(item?.url).toContain('free.com');
  });

  it('rejects malformed URLs', () => {
    const frontier = base();

    expect(frontier.add('not a url', 1)).toBe(false);
    expect(frontier.add('javascript:alert(1)', 1)).toBe(false);
    expect(frontier.rejections()['invalid']).toBe(2);
  });

  it('reports why URLs were turned away', () => {
    // A silent cap reads as complete coverage. The counts make the gap visible.
    const frontier = base({ maxDepth: 1 });
    frontier.add('https://elsewhere.com/a', 1);
    frontier.add('https://example.com/docs/deep', 5);
    frontier.add('bad url', 1);

    const rejections = frontier.rejections();
    expect(rejections['off-site']).toBe(1);
    expect(rejections['too-deep']).toBe(1);
    expect(rejections['invalid']).toBe(1);
  });

  it('uses a Bloom filter for large crawls without losing correctness on repeats', () => {
    // Above the exact-set threshold, dedup becomes probabilistic. A URL just
    // added must still always be recognised — false positives are the accepted
    // failure mode, false negatives are not.
    const frontier = new Frontier({
      seedUrl: 'https://example.com/',
      limit: 100_000,
      allowExternal: true,
    });

    for (let i = 0; i < 1_000; i++) {
      expect(frontier.add(`https://example.com/page/${i}`, 1)).toBe(true);
    }
    for (let i = 0; i < 1_000; i++) {
      expect(frontier.add(`https://example.com/page/${i}`, 1)).toBe(false);
    }

    expect(frontier.enqueued).toBe(1_000);
  });
});
