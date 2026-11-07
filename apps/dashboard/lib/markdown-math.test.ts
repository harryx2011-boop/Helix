import { describe, expect, it } from 'vitest';
import { preprocessMarkdownMath } from './markdown-math';

describe('preprocessMarkdownMath', () => {
  it('bridges \\(...\\) to $...$', () => {
    expect(preprocessMarkdownMath('\\(x + 1\\)')).toBe('$x + 1$');
  });

  it('bridges \\[...\\] to $$...$$, isolated onto its own block like a one-line $$...$$ is', () => {
    expect(preprocessMarkdownMath('\\[x = y\\]')).toBe('$$\nx = y\n$$');
  });

  it('isolates a one-line $$...$$ onto its own block', () => {
    expect(preprocessMarkdownMath('$$x = y$$')).toBe('$$\nx = y\n$$');
  });

  it('escapes a $ immediately before a digit so currency is not read as math', () => {
    const out = preprocessMarkdownMath('It costs $5 and $10 for the pair.');
    expect(out).toBe('It costs \\$5 and \\$10 for the pair.');
  });

  it('does not touch $ inside a fenced or inline code span', () => {
    expect(preprocessMarkdownMath('`$5 in a span`')).toBe('`$5 in a span`');
    expect(preprocessMarkdownMath('```\n$5 in a fence\n```')).toBe('```\n$5 in a fence\n```');
  });

  it('leaves a genuinely unclosed \\( or \\[ as literal text, never hanging or throwing', () => {
    expect(() => preprocessMarkdownMath('unclosed \\( forever')).not.toThrow();
    expect(preprocessMarkdownMath('unclosed \\( forever')).toContain('\\(');
    expect(() => preprocessMarkdownMath('unclosed \\[ forever')).not.toThrow();
  });

  it('does not bridge \\( across a blank line (paragraph break)', () => {
    const out = preprocessMarkdownMath('para one \\( unclosed\n\npara two \\(x\\) closed');
    expect(out).toContain('\\( unclosed');
    expect(out).toContain('$x$');
  });

  it('skips preprocessing outright above the size cap, returning the input unchanged', () => {
    const huge = 'a'.repeat(600_000);
    expect(preprocessMarkdownMath(huge)).toBe(huge);
  });

  it('preprocesses 200k chars of unclosed \\( in well under 100ms', () => {
    const input = '\\(' + 'a'.repeat(200_000);
    const start = performance.now();
    preprocessMarkdownMath(input);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('preprocesses 200k chars of unclosed \\[ in well under 100ms', () => {
    const input = '\\[' + 'a'.repeat(200_000);
    const start = performance.now();
    preprocessMarkdownMath(input);
    expect(performance.now() - start).toBeLessThan(100);
  });

  const CAP = 500_000;
  const denseCases: Array<[string, string]> = [
    ['\\( x250k', '\\('.repeat(CAP / 2)],
    ['\\[ x250k', '\\['.repeat(CAP / 2)],
    ['\\( x250k then a single \\) at the end', '\\('.repeat(CAP / 2 - 1) + '\\)'],
    ['\\( and \\[ alternating', '\\(\\['.repeat(CAP / 4)],
    ['\\(x separated by blank lines', '\\(x\n\n'.repeat(Math.floor(CAP / 5))],
  ];
  for (const [label, input] of denseCases) {
    it(`preprocesses ${input.length} chars of densely packed unclosed openers (${label}) in well under 100ms`, () => {
      preprocessMarkdownMath(input.slice(0, 20_000));
      const start = performance.now();
      preprocessMarkdownMath(input);
      expect(performance.now() - start).toBeLessThan(100);
    });
  }

  it('scales linearly in opener count: 4x the dense input costs nowhere near 16x', () => {
    const time = (n: number) => {
      const input = '\\('.repeat(n);
      preprocessMarkdownMath(input);
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        preprocessMarkdownMath(input);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    const small = Math.max(time(62_500), 1);
    const large = time(250_000);
    expect(large / small).toBeLessThan(12);
  });

  it('lets the first opener claim the nearest closer, as the lazy regex did', () => {
    expect(preprocessMarkdownMath('\\( \\( \\( \\(x\\)')).toBe('$ \\( \\( \\(x$');
  });

  it('leaves an opener literal once a closer has been consumed and none remains', () => {
    expect(preprocessMarkdownMath('\\(a\\) then \\( b \\( c')).toBe('$a$ then \\( b \\( c');
  });

  it('does not bridge an opener whose closer lies beyond the span bound', () => {
    const far = '\\(' + 'a'.repeat(2500) + '\\)';
    expect(preprocessMarkdownMath(far)).toBe(far);
  });

  it('does not bridge across a blank line even when other openers precede it', () => {
    expect(preprocessMarkdownMath('\\( a\n\n b \\)')).toBe('\\( a\n\n b \\)');
  });
});
