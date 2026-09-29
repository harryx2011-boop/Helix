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
 * engine retries the lazy match from every opener with nothing ever closing it.
 *
 * A closer may sit at most MAX_DELIMITER_SPAN past its opener and never past a
 * blank line (LaTeX math does not span a paragraph break). Bounding each search
 * is not enough on its own: text packed with unclosed openers would still pay a
 * fresh bounded scan per opener (~n/2 openers x 2000 chars). So the position of
 * the next closer and the next blank line are each found once and reused for
 * every opener until the cursor passes them; each is recomputed only from
 * beyond its previous hit, so the scanned ranges never overlap and the whole
 * pass is O(n) whatever the opener density.
 */
const BLANK_LINE_RE = /\n[ \t]*\n/g;

function bridgeDelimiters(text: string, open: string, close: string, wrap: (inner: string) => string): string {
  const parts: string[] = [];
  // `cursor` is how much of `text` has been emitted; `scan` is how far openers
  // have been examined. An unmatched opener only advances `scan`, so it stays
  // literal text and costs no allocation.
  let cursor = 0;
  let scan = 0;
  // Cached lookahead: `Infinity` once nothing remains; recomputed only after
  // the scan position has moved beyond the cached position.
  let closePos = -2;
  let blankPos = -2;

  for (;;) {
    const start = text.indexOf(open, scan);
    if (start === -1) break;
    const innerStart = start + open.length;

    if (closePos !== Infinity && closePos < innerStart) {
      const found = text.indexOf(close, innerStart);
      closePos = found === -1 ? Infinity : found;
    }
    if (blankPos !== Infinity && blankPos < start) {
      BLANK_LINE_RE.lastIndex = start;
      const found = BLANK_LINE_RE.exec(text);
      blankPos = found ? found.index : Infinity;
    }

    const limit = Math.min(text.length, innerStart + MAX_DELIMITER_SPAN, blankPos);
    if (closePos === Infinity || closePos + close.length > limit) {
      // No closer within the bound: the opener stays literal text.
      scan = innerStart;
      continue;
    }

    parts.push(text.slice(cursor, start), wrap(text.slice(innerStart, closePos)));
    cursor = closePos + close.length;
    scan = cursor;
  }
  parts.push(text.slice(cursor));
  return parts.join('');
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
