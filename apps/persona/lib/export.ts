import type { Fork } from './store';
import { isTableRow, isTableSeparator, splitTableRow } from './fork';

/**
 * Export formats for a fork (PERSONA.md §6): .md, .txt, .json, and the .pdf
 * path via the print route. Downloads are Blob + anchor; filenames are
 * `<persona-slug>-<title-kebab>.<ext>`.
 */

export type ExportFormat = 'md' | 'txt' | 'json';

function kebab(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

export function exportFilename(fork: Pick<Fork, 'personaSlug' | 'title'>, ext: string): string {
  return `${fork.personaSlug}-${kebab(fork.title)}.${ext}`;
}

/** Pipe tables become space-aligned columns with a dashed rule under the header. */
function layoutTables(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isTableRow(line) && isTableSeparator(lines[i + 1] ?? '')) {
      const rows = [splitTableRow(line)];
      i += 2;
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        rows.push(splitTableRow(lines[i] ?? ''));
        i++;
      }
      const width = Math.max(...rows.map((r) => r.length));
      const widths = Array.from({ length: width }, (_, c) => Math.max(1, ...rows.map((r) => (r[c] ?? '').length)));
      const format = (row: string[]) => widths.map((w, c) => (row[c] ?? '').padEnd(w)).join('  ').trimEnd();
      out.push(format(rows[0]!), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.slice(1).map(format));
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

/** Markdown with formatting characters stripped sensibly, for plain-text targets. */
export function toPlainText(markdown: string): string {
  const stripped = markdown
    .replace(/\r\n/g, '\n')
    .replace(/^```[a-z]*\n?/gm, '')
    .replace(/```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/(?<![A-Za-z0-9_])_(?!_)(.+?)(?<!_)_(?![A-Za-z0-9_])/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '- ')
    .replace(/^-{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return layoutTables(stripped);
}

export interface ForkJsonExport {
  title: string;
  role: string;
  persona: string;
  sourceVersion: number;
  values: Record<string, string>;
  bodyMd: string;
  exportedAt: string;
}

export function toJsonExport(fork: Fork): ForkJsonExport {
  return {
    title: fork.title,
    role: fork.roleSlug,
    persona: fork.personaSlug,
    sourceVersion: fork.sourceVersion,
    values: fork.values,
    bodyMd: fork.bodyMd,
    exportedAt: new Date().toISOString(),
  };
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadFork(fork: Fork, format: ExportFormat): void {
  if (format === 'md') {
    download(exportFilename(fork, 'md'), fork.bodyMd, 'text/markdown;charset=utf-8');
  } else if (format === 'txt') {
    download(exportFilename(fork, 'txt'), toPlainText(fork.bodyMd), 'text/plain;charset=utf-8');
  } else {
    download(exportFilename(fork, 'json'), JSON.stringify(toJsonExport(fork), null, 2), 'application/json;charset=utf-8');
  }
}
