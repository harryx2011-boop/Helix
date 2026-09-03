/**
 * Fork body conversion: the fork's markdown <-> the editor's HTML. Small and
 * deterministic on purpose (PERSONA.md §6 editor floor: bold, italic, heading,
 * list). `{{TOKENS}}` pass through untouched in both directions so the wizard
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
  { pattern: /(?<!_)_(.+?)_(?!_)/g, toHtml: (m) => `<em>${m[1]}</em>` },
  { pattern: /`(.+?)`/g, toHtml: (m) => `<code>${m[1]}</code>` },
];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineToHtml(text: string): string {
  let escaped = escapeHtml(text);
  for (const rule of INLINE_RULES) {
    escaped = escaped.replace(rule.pattern, (...args) => rule.toHtml(args as unknown as RegExpMatchArray));
  }
  return escaped;
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
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
      !/^(-{3,}|\*{3,}|_{3,})$/.test((lines[i] ?? '').trim())
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
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** HTML from the Tiptap editor -> markdown, saved back onto the fork. */
export function htmlToMarkdown(html: string): string {
  const blockPattern = /<(h1|h2|h3|p|ul|ol|pre|hr)\b[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/g;
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
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) =>
        htmlInlineToMarkdown((m[1] ?? '').replace(/<\/?p>/g, '')).trim(),
      );
      const prefix = tag === 'ul' ? '- ' : (i: number) => `${i + 1}. `;
      items.forEach((item, i) => {
        out.push(`${typeof prefix === 'function' ? prefix(i) : prefix}${item}`);
      });
    } else if (tag === 'pre') {
      const code = inner.replace(/<\/?code>/g, '');
      out.push('```\n' + code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') + '\n```');
    } else if (tag === 'hr') {
      out.push('---');
    }
  }
  return out.join('\n\n').trim();
}
