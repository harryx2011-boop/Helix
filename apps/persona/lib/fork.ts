/**
 * Fork body conversion: the fork's markdown <-> the editor's HTML. Small and
 * deterministic on purpose (PERSONA.md §6 editor floor: bold, italic, heading,
 * list, code block; PERSONA-REVAMP.md Track 1 adds pipe tables). `{{TOKENS}}` pass through untouched in both directions so the wizard
 * and the placeholder scanner keep working on editor output.
 */

interface InlineRule {
  pattern: RegExp;
  toHtml: (match: RegExpMatchArray) => string;
}

const INLINE_RULES: InlineRule[] = [
  { pattern: /\*\*(.+?)\*\*/g, toHtml: (m) => `<strong>${m[1]}</strong>` },
  { pattern: /__(.+?)__/g, toHtml: (m) => `<strong>${m[1]}</strong>` },
  { pattern: /\*(.+?)\*/g, toHtml: (m) => `<em>${m[1]}</em>` },
  { pattern: /(?<![A-Za-z0-9_])_(?!_)(.+?)(?<!_)_(?![A-Za-z0-9_])/g, toHtml: (m) => `<em>${m[1]}</em>` },
  { pattern: /`(.+?)`/g, toHtml: (m) => `<code>${m[1]}</code>` },
];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const TOKEN_SPLIT = /(\{\{\s*[A-Za-z][A-Za-z0-9_.]*\s*\}\})/g;

/** Inline rules apply between tokens only, so `{{HELP_CENTER_URL}}` never reads as emphasis. */
function inlineToHtml(text: string): string {
  return text
    .split(TOKEN_SPLIT)
    .map((part, i) => {
      if (i % 2 === 1) return escapeHtml(part);
      let escaped = escapeHtml(part);
      for (const rule of INLINE_RULES) {
        escaped = escaped.replace(rule.pattern, (...args) => rule.toHtml(args as unknown as RegExpMatchArray));
      }
      return escaped;
    })
    .join('');
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function isTableRow(line: string): boolean {
  return TABLE_ROW.test(line);
}

export function isTableSeparator(line: string): boolean {
  return TABLE_SEP.test(line) && line.includes('-');
}

/** Cells of one pipe-table row; `\|` inside a cell is a literal pipe. */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' }
  | { type: 'code'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; text: string };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.trim() === '') {
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      i++; // closing fence
      blocks.push({ type: 'code', text: codeLines.join('\n') });
      continue;
    }

    if (isTableRow(line) && isTableSeparator(lines[i + 1] ?? '')) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        rows.push(splitTableRow(lines[i] ?? ''));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length as 1 | 2 | 3, text: heading[2]!.trim() });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (/^(\s*)[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(\s*)[-*+]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^(\s*)[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^(\s*)\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(\s*)\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^(\s*)\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i] ?? '') &&
      !/^```/.test(lines[i] ?? '') &&
      !/^(\s*)[-*+]\s+/.test(lines[i] ?? '') &&
      !/^(\s*)\d+\.\s+/.test(lines[i] ?? '') &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test((lines[i] ?? '').trim()) &&
      !(isTableRow(lines[i] ?? '') && isTableSeparator(lines[i + 1] ?? ''))
    ) {
      paraLines.push(lines[i] ?? '');
      i++;
    }
    blocks.push({ type: 'p', text: paraLines.join(' ').trim() });
  }
  return blocks;
}

/** Markdown -> HTML the Tiptap editor can load via `setContent`. */
export function markdownToHtml(markdown: string): string {
  const blocks = parseBlocks(markdown);
  const html: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        html.push(`<h${block.level}>${inlineToHtml(block.text)}</h${block.level}>`);
        break;
      case 'hr':
        html.push('<hr>');
        break;
      case 'code':
        html.push(`<pre><code>${escapeHtml(block.text)}</code></pre>`);
        break;
      case 'table': {
        const width = block.header.length;
        const cell = (tag: 'th' | 'td', text: string) => `<${tag}><p>${inlineToHtml(text)}</p></${tag}>`;
        const head = `<tr>${block.header.map((h) => cell('th', h)).join('')}</tr>`;
        const body = block.rows
          .map((row) => `<tr>${Array.from({ length: width }, (_, c) => cell('td', row[c] ?? '')).join('')}</tr>`)
          .join('');
        html.push(`<table><tbody>${head}${body}</tbody></table>`);
        break;
      }
      case 'ul':
        html.push(`<ul>${block.items.map((it) => `<li><p>${inlineToHtml(it)}</p></li>`).join('')}</ul>`);
        break;
      case 'ol':
        html.push(`<ol>${block.items.map((it) => `<li><p>${inlineToHtml(it)}</p></li>`).join('')}</ol>`);
        break;
      case 'p':
        if (block.text) html.push(`<p>${inlineToHtml(block.text)}</p>`);
        break;
    }
  }
  return html.join('\n');
}

function htmlInlineToMarkdown(html: string): string {
  return html
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<b>(.*?)<\/b>/g, '**$1**')
    .replace(/<em>(.*?)<\/em>/g, '*$1*')
    .replace(/<i>(.*?)<\/i>/g, '*$1*')
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<br\b[^>]*>/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** HTML from the Tiptap editor -> markdown, saved back onto the fork. */
export function htmlToMarkdown(html: string): string {
  const blockPattern = /<(h1|h2|h3|p|ul|ol|pre|hr|table)\b[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/g;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html))) {
    const tag = match[1];
    const inner = match[2] ?? '';
    if (!tag) {
      out.push('---');
      continue;
    }
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const hashes = '#'.repeat(Number(tag[1]));
      out.push(`${hashes} ${htmlInlineToMarkdown(inner).trim()}`);
    } else if (tag === 'p') {
      const text = htmlInlineToMarkdown(inner).trim();
      if (text) out.push(text);
    } else if (tag === 'ul' || tag === 'ol') {
      // A table inside a list item (cursor was in the list at insert time) cannot
      // nest in a pipe table's markdown; it is hoisted to sit right after the list.
      const hoisted: string[] = [];
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
        const li = (m[1] ?? '').replace(/<table\b[^>]*>([\s\S]*?)<\/table>/g, (_, t: string) => {
          const table = tableToMarkdown(t);
          if (table) hoisted.push(table);
          return ' ';
        });
        return htmlInlineToMarkdown(li.replace(/<\/p>\s*<p[^>]*>/g, ' ').replace(/<\/?p[^>]*>/g, ''))
          .replace(/ {2,}/g, ' ')
          .trim();
      });
      out.push(items.map((item, i) => `${tag === 'ul' ? '- ' : `${i + 1}. `}${item}`).join('\n'));
      out.push(...hoisted);
    } else if (tag === 'pre') {
      const code = inner.replace(/<\/?code>/g, '');
      out.push('```\n' + code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') + '\n```');
    } else if (tag === 'hr') {
      out.push('---');
    } else if (tag === 'table') {
      const table = tableToMarkdown(inner);
      if (table) out.push(table);
    }
  }
  return out.join('\n\n').trim();
}

/** The rows of a <table>'s inner HTML as a pipe table; the first row is the header. */
function tableToMarkdown(inner: string): string | null {
  const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...(row[1] ?? '').matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((c) => cellToMarkdown(c[2] ?? '')),
  );
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const line = (row: string[]) => `| ${Array.from({ length: width }, (_, c) => row[c] ?? '').join(' | ')} |`;
  return [line(rows[0]!), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}

/** A table cell's inner HTML (Tiptap wraps it in <p>) to one line of inline markdown. */
function cellToMarkdown(html: string): string {
  return htmlInlineToMarkdown(html.replace(/<\/p>\s*<p[^>]*>/g, ' ').replace(/<\/?p[^>]*>/g, ''))
    .replace(/\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}
