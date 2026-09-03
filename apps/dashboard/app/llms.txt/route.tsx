import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/mode';
import { MARKDOWN_TWIN_PATHS } from '@/lib/markdown-twins';

export const dynamic = 'force-static';

/** Index of every markdown twin on the site (WEBSITE.md §2, §9.4), the `llms.txt` category convention. */
export async function GET() {
  const base = SITE_URL.replace(/\/$/, '');
  const lines = [
    '# Helix',
    '',
    '> The web-data API you run yourself. Scrape, parse, search, crawl, interact and monitor with your own keys. Apache-2.0.',
    '',
    `- [Home](${base}/md)`,
    ...MARKDOWN_TWIN_PATHS.map((path) => `- [${path}](${base}/md/${path})`),
    `- [Agent onboarding](${base}/agent-onboarding/SKILL.md)`,
  ];

  return new NextResponse(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
