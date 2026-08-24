import { NextResponse } from 'next/server';
import { resolveMarkdownTwin } from '@/lib/markdown-twins';

export const dynamic = 'force-static';

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
    'The web-data API you run yourself. Scrape, parse, search, crawl, interact and monitor with your own keys. Apache-2.0.',
    '',
    'See /llms.txt for an index of every page on this site.',
  ].join('\n');
}
