/**
 * Bridges LaTeX-style math delimiters onto what `remark-math` actually parses
 * (`$...$` inline, `$$...$$` block) and guards the classic currency false
 * positive: `remark-math`'s single-dollar rule has no "not followed by a
 * digit" exception, so "costs $5 and $10" tokenizes as inline math starting
 * at the first `$`. A `$` immediately followed by a digit is escaped to a
 * literal `\$` — real inline math essentially never opens on a bare digit
 * (`$x$`, `$\pi$`, `$n^2$`), so this costs nothing genuine while defusing
 * plain-language prices, which scraped pricing pages are full of.
 *
 * Runs on the whole markdown string, but skips fenced and inline code spans
 * so a `$5` inside a code sample is never rewritten.
 */
const CODE_SPAN_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

/** A closer this far past its opener, or never found, is treated as unclosed rather than scanned to the end of a huge document. */
const MAX_DELIMITER_SPAN = 2000;

/**
 * Linear replacement for `text.replace(/\\\[([\s\S]*?)\\\]/g, ...)`: a lazy
 * `[\s\S]*?` against an *unclosed* opener degenerates to O(n^2), since the
 * engine retries the lazy match from every position between opener and end of
 * string with nothing ever closing it. This scans forward once, bounding how
 * far a closer may be from its opener (and never crossing a blank line, which
 * LaTeX math never legitimately spans) so a pathological unclosed run costs
 * O(n), not O(n^2).
 */
function bridgeDelimiters(text: string, open: string, close: string, wrap: (inner: string) => string): string {
  let result = '';
  let cursor = 0;
  for (;;) {
    const start = text.indexOf(open, cursor);
    if (start === -1) {
      result += text.slice(cursor);
      break;
    }
    const searchEnd = Math.min(text.length, start + open.length + MAX_DELIMITER_SPAN);
    const window = text.slice(start, searchEnd);
    const blankLine = window.search(/\n[ \t]*\n/);
    const boundedEnd = blankLine === -1 ? searchEnd : start + blankLine;
    // Bounded to `window`/`boundedEnd`, never the rest of the document: a
    // document with many unclosed openers must not pay for an `indexOf` that
    // walks to the end of the string on every single one of them (that is
    // exactly how the regex this replaces went quadratic).
    const relativeEnd = text.slice(start + open.length, boundedEnd).indexOf(close);
    const end = relativeEnd === -1 ? -1 : start + open.length + relativeEnd;

    if (end === -1) {
      // No closer within the bound: emit the opener literally and resume
      // right after it, rather than re-scanning the same unclosed run again.
      result += text.slice(cursor, start + open.length);
      cursor = start + open.length;
      continue;
    }

    result += text.slice(cursor, start) + wrap(text.slice(start + open.length, end));
    cursor = end + close.length;
  }
  return result;
}

function transformProse(text: string): string {
  let out = bridgeDelimiters(text, '\\[', '\\]', (inner) => `$$${inner}$$`);
  out = bridgeDelimiters(out, '\\(', '\\)', (inner) => `$${inner}$`);
  return out
    // mdast-util-math's block ("flow") math needs `$$` to open and close its
    // own line, the same as a fenced code block; a one-line `$$...$$` is
    // otherwise left as plain text. Isolating it onto its own blank-delimited
    // line makes it a valid flow construct instead.
    .replace(/(^|\n)([ \t]*)\$\$([^\n$]+)\$\$([ \t]*)(?=\n|$)/g, (_m, before: string, indent: string, inner: string) => `${before}${indent}$$\n${inner.trim()}\n$$`)
    .replace(/\$(?=\d)/g, '\\$');
}

/** Above this, math preprocessing is skipped outright: a pathologically large blob gains little from LaTeX-delimiter bridging, and every guard here trades on the document being of ordinary size. */
const MAX_PREPROCESS_LENGTH = 500_000;

export function preprocessMarkdownMath(markdown: string): string {
  if (markdown.length > MAX_PREPROCESS_LENGTH) return markdown;
  const parts = markdown.split(CODE_SPAN_RE);
  // split() with a capturing group interleaves matched separators back into
  // the array at odd indices; even indices are the plain-prose segments.
  return parts.map((part, i) => (i % 2 === 0 ? transformProse(part) : part)).join('');
}
