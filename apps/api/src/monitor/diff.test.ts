import { describe, expect, it } from 'vitest';
import { boundedDiff, diffJson, diffText, tokenize } from './diff.js';

describe('tokenize', () => {
  it('keeps whitespace tokens at word granularity so the text re-joins verbatim', () => {
    const text = 'Standard  $29/month';
    expect(tokenize(text, 'word').join('')).toBe(text);
  });

  it('splits lines on either line ending', () => {
    expect(tokenize('a\r\nb\nc', 'line')).toEqual(['a', 'b', 'c']);
  });

  it('splits characters by code point, not UTF-16 unit', () => {
    expect(tokenize('a😀b', 'character')).toEqual(['a', '😀', 'b']);
  });
});

describe('diffText', () => {
  it('reports no change for identical input', () => {
    const diff = diffText('same', 'same', 'word');
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.changeRatio).toBe(0);
    expect(diff.text).toBe('same');
  });

  it('finds a single changed word and renders it inline', () => {
    const diff = diffText('Standard $29/month billed annually', 'Standard $34/month billed annually', 'word');
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.text).toBe('Standard [-$29/month-]{+$34/month+} billed annually');
    // Whitespace tokens are not counted: 4 words either side, 2 changed.
    expect(diff.changeRatio).toBeCloseTo(0.5);
  });

  it('renders line diffs with +/- prefixes', () => {
    const before = '## Standard\n$29/month\n\n## Pro\n$79/month';
    const after = '## Standard\n$34/month\n\n## Pro\n$79/month';
    const diff = diffText(before, after, 'line');
    expect(diff.text).toBe('  ## Standard\n- $29/month\n+ $34/month\n  \n  ## Pro\n  $79/month');
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
  });

  it('handles pure insertion and pure deletion', () => {
    expect(diffText('', 'new content', 'word').added).toBe(2);
    expect(diffText('old content', '', 'word').removed).toBe(2);
    expect(diffText('old content', '', 'word').changeRatio).toBe(1);
  });

  it('collapses runs so consecutive edits form one hunk', () => {
    const diff = diffText('abc', 'axyz', 'character');
    expect(diff.ops).toEqual([
      { op: 'equal', text: 'a' },
      { op: 'delete', text: 'bc' },
      { op: 'insert', text: 'xyz' },
    ]);
  });

  it('re-joins to the original strings from the ops', () => {
    const before = 'The quick brown fox jumps over the lazy dog';
    const after = 'The quick red fox leaps over the very lazy dog';
    const diff = diffText(before, after, 'word');
    const rebuiltBefore = diff.ops.filter((o) => o.op !== 'insert').map((o) => o.text).join('');
    const rebuiltAfter = diff.ops.filter((o) => o.op !== 'delete').map((o) => o.text).join('');
    expect(rebuiltBefore).toBe(before);
    expect(rebuiltAfter).toBe(after);
  });

  it('stays fast on a page-sized document with a small edit', () => {
    const lines = Array.from({ length: 2_000 }, (_, i) => `line ${i} of a fairly ordinary page`);
    const before = lines.join('\n');
    lines[1_000] = 'line 1000 was edited';
    const after = lines.join('\n');
    const started = Date.now();
    const diff = diffText(before, after, 'word');
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(diff.removed).toBeGreaterThan(0);
    expect(diff.added).toBeGreaterThan(0);
  });
});

describe('diffText on large rewrites', () => {
  const words = (count: number, seed: string) => Array.from({ length: count }, (_, i) => `${seed}${i}`).join(' ');

  it('stays within a small memory budget when a long page is replaced wholesale', () => {
    const before = words(20_000, 'old');
    const after = words(20_000, 'new');
    const heapBefore = process.memoryUsage().heapUsed;
    const started = Date.now();
    const diff = diffText(before, after, 'word');
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(64 * 1024 * 1024);
    // One line replaced by one line: the line-granularity stage answered.
    expect(diff.granularity).toBe('line');
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.changeRatio).toBe(1);
  });

  it('falls back to line granularity, then to one delete and one insert', () => {
    const lines = Array.from({ length: 4_000 }, (_, i) => `line ${i} of the page`);
    const before = lines.join('\n');
    const after = lines.map((line, i) => (i % 2 === 0 ? `line ${i} rewritten entirely` : line)).join('\n');

    const fromWord = diffText(before, after, 'word');
    expect(fromWord.granularity).toBe('line');
    expect(fromWord.added).toBe(2_000);
    expect(fromWord.coarse).toBeUndefined();

    const rewritten = Array.from({ length: 6_000 }, (_, i) => `entirely different line ${i}`).join('\n');
    const coarse = diffText(before, rewritten, 'line');
    expect(coarse.coarse).toBe(true);
    expect(coarse.ops.map((o) => o.op)).toEqual(['delete', 'insert']);
    expect(coarse.removed).toBe(4_000);
    expect(coarse.added).toBe(6_000);
    const rebuiltBefore = coarse.ops.filter((o) => o.op !== 'insert').map((o) => o.text).join('\n');
    expect(rebuiltBefore).toBe(before);
  });

  it('character diffs of a page-sized replacement finish quickly', () => {
    const started = Date.now();
    const diff = diffText('x'.repeat(40_000), 'y'.repeat(40_000), 'character');
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(diff.added).toBeGreaterThan(0);
  });

  it('keeps an exact diff for a scattered edit across a long page', () => {
    const lines = Array.from({ length: 3_000 }, (_, i) => `line ${i} content here`);
    const before = lines.join('\n');
    for (let i = 0; i < lines.length; i += 50) lines[i] = `line ${i} edited`;
    const after = lines.join('\n');
    const diff = diffText(before, after, 'word');
    expect(diff.granularity).toBe('word');
    expect(diff.added).toBe(60);
    expect(diff.removed).toBe(120);
    expect(diff.ops.filter((o) => o.op !== 'insert').map((o) => o.text).join('')).toBe(before);
    expect(diff.ops.filter((o) => o.op !== 'delete').map((o) => o.text).join('')).toBe(after);
  });
});

describe('boundedDiff', () => {
  it('drops ops and text past the byte cap and keeps the counts', () => {
    const diff = diffText('a b c', 'a x c', 'word');
    expect(boundedDiff(diff, 10_000)).toBe(diff);
    const bounded = boundedDiff(diff, 10);
    expect(bounded).toMatchObject({ added: 1, removed: 1, ops: [], text: '', truncated: true });
  });
});

describe('diffJson', () => {
  it('reports only the field that changed, not unchanged siblings', () => {
    const before = { price: 29, name: 'Standard', tags: ['a', 'b'] };
    const after = { price: 34, name: 'Standard', tags: ['a', 'b'] };
    const diff = diffJson(before, after);

    expect(diff.granularity).toBe('json');
    expect(diff.fields).toEqual([{ path: 'price', before: 29, after: 34 }]);
  });

  it('walks nested objects with dot paths', () => {
    const before = { address: { city: 'Leeds', zip: 'LS1' } };
    const after = { address: { city: 'York', zip: 'LS1' } };
    const diff = diffJson(before, after);
    expect(diff.fields).toEqual([{ path: 'address.city', before: 'Leeds', after: 'York' }]);
  });

  it('walks arrays with index paths', () => {
    const before = { items: [{ price: 10 }, { price: 20 }] };
    const after = { items: [{ price: 10 }, { price: 25 }] };
    const diff = diffJson(before, after);
    expect(diff.fields).toEqual([{ path: 'items.1.price', before: 20, after: 25 }]);
  });

  it('reports an added or removed field without a spurious null', () => {
    const added = diffJson({ a: 1 }, { a: 1, b: 2 });
    expect(added.fields).toEqual([{ path: 'b', after: 2 }]);
    expect('before' in added.fields[0]!).toBe(false);

    const removed = diffJson({ a: 1, b: 2 }, { a: 1 });
    expect(removed.fields).toEqual([{ path: 'b', before: 2 }]);
    expect('after' in removed.fields[0]!).toBe(false);
  });

  it('reports no fields and a zero changeRatio for identical objects', () => {
    const diff = diffJson({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } });
    expect(diff.fields).toEqual([]);
    expect(diff.changeRatio).toBe(0);
  });

  it('never treats key reordering or whitespace as a change', () => {
    const before = { b: 2, a: 1 };
    const after = { a: 1, b: 2 };
    expect(diffJson(before, after).fields).toEqual([]);
  });
});

