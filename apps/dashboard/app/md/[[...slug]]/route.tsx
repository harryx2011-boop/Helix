import { NextResponse } from 'next/server';
import { MARKDOWN_TWIN_PATHS, resolveMarkdownTwin } from '@/lib/markdown-twins';

export const dynamic = 'force-static';

/** Self-host exports statically, so every twin path has to be enumerated at build time. */
export function generateStaticParams(): { slug: string[] }[] {
  // A path that is also the prefix of another twin (`docs` vs `docs/crawl`)
  // would have to be both a file and a directory in `out/`, which the export
  // cannot write. Those stay served by the hosted build only.
  const prefixes = new Set(
    MARKDOWN_TWIN_PATHS.flatMap((path) => {
      const parts = path.split('/');
      return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
    }),
  );
  return MARKDOWN_TWIN_PATHS.filter((path) => !prefixes.has(path)).map((path) => ({ slug: path.split('/') }));
}

/** Markdown twin of every marketing page, no chrome (WEBSITE.md §9.4): `/md`, `/md/scrape`, `/md/docs/crawl`, … */
export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const path = (slug ?? []).join('/');
  const body = path === '' ? homeMarkdown() : await resolveMarkdownTwin(path);

  if (!body) {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

function homeMarkdown(): string {
  return [
    '# Helix',
    '',
    'A frontier utility hub you run yourself. Scrape, parse, search, crawl, interact and monitor with your own keys. Apache-2.0.',
    '',
    'See /llms.txt for an index of every page on this site.',
  ].join('\n');
}
