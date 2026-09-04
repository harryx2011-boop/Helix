import { NextResponse } from 'next/server';
import { ENDPOINTS } from '@/lib/catalog';
import { MARKDOWN_TWIN_PATHS, resolveMarkdownTwin } from '@/lib/markdown-twins';
import type { DocIndexEntry } from '@/lib/palette-search';

export const dynamic = 'force-static';

const BODY_LIMIT = 2400;
const DESCRIPTION_LIMIT = 160;
const PRODUCT_IDS = new Set<string>(ENDPOINTS.filter((e) => e.product).map((e) => e.id));

function plain(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTwin(path: string, markdown: string): DocIndexEntry {
  const lines = markdown.split('\n');
  const titleAt = lines.findIndex((l) => l.startsWith('# '));
  const titleLine = titleAt >= 0 ? lines[titleAt] : undefined;
  const description = lines.slice(titleAt + 1).find((l) => l.trim().length > 0 && !l.startsWith('#'));
  // The trailing agent block is identical on every page and would match every query for "agent".
  const body = markdown.replace(/\n---\n\nIf you are an AI agent[\s\S]*$/, '');
  return {
    path,
    href: `/${path}`,
    kind: PRODUCT_IDS.has(path) ? 'capability' : 'docs',
    title: titleLine ? titleLine.slice(2).trim() : path,
    description: plain(description ?? '').slice(0, DESCRIPTION_LIMIT),
    headings: lines.filter((l) => l.startsWith('## ')).map((l) => plain(l.slice(3))),
    body: plain(body).toLowerCase().slice(0, BODY_LIMIT),
  };
}

/**
 * The command palette's docs index (title, headings, a bounded slice of prose
 * per page), derived from the same markdown twins `/md` and `/llms.txt` serve
 * so it can never disagree with the pages. Static, so a self-host export
 * ships it as a file and the browser fetches it once instead of bundling the
 * corpus.
 */
export async function GET() {
  const entries = await Promise.all(
    MARKDOWN_TWIN_PATHS.map(async (path) => {
      const markdown = await resolveMarkdownTwin(path);
      return markdown ? parseTwin(path, markdown) : undefined;
    }),
  );
  return NextResponse.json(entries.filter((e): e is DocIndexEntry => e !== undefined));
}
