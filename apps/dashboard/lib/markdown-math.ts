const CODE_SPAN_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

const MAX_DELIMITER_SPAN = 2000;

const BLANK_LINE_RE = /\n[ \t]*\n/g;

function bridgeDelimiters(text: string, open: string, close: string, wrap: (inner: string) => string): string {
  const parts: string[] = [];
  let cursor = 0;
  let scan = 0;
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
    .replace(/(^|\n)([ \t]*)\$\$([^\n$]+)\$\$([ \t]*)(?=\n|$)/g, (_m, before: string, indent: string, inner: string) => `${before}${indent}$$\n${inner.trim()}\n$$`)
    .replace(/\$(?=\d)/g, '\\$');
}

const MAX_PREPROCESS_LENGTH = 500_000;

export function preprocessMarkdownMath(markdown: string): string {
  if (markdown.length > MAX_PREPROCESS_LENGTH) return markdown;
  const parts = markdown.split(CODE_SPAN_RE);
  return parts.map((part, i) => (i % 2 === 0 ? transformProse(part) : part)).join('');
}
