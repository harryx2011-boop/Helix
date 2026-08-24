import { describe, expect, it } from 'vitest';
import { diffText, tokenize } from './diff.js';

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
