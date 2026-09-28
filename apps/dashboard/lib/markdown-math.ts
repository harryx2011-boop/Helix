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

function transformProse(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `$$${inner}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => `$${inner}$`)
    // mdast-util-math's block ("flow") math needs `$$` to open and close its
    // own line, the same as a fenced code block; a one-line `$$...$$` is
    // otherwise left as plain text. Isolating it onto its own blank-delimited
    // line makes it a valid flow construct instead.
    .replace(/(^|\n)([ \t]*)\$\$([^\n$]+)\$\$([ \t]*)(?=\n|$)/g, (_m, before: string, indent: string, inner: string) => `${before}${indent}$$\n${inner.trim()}\n$$`)
    .replace(/\$(?=\d)/g, '\\$');
}

export function preprocessMarkdownMath(markdown: string): string {
  const parts = markdown.split(CODE_SPAN_RE);
  // split() with a capturing group interleaves matched separators back into
  // the array at odd indices; even indices are the plain-prose segments.
  return parts.map((part, i) => (i % 2 === 0 ? transformProse(part) : part)).join('');
}
