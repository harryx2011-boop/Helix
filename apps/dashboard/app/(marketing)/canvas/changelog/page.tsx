import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { CANVAS_NAME } from '@/lib/canvas';

export const metadata: Metadata = {
  title: `Changelog — ${CANVAS_NAME}`,
  description: `Release history for the ${CANVAS_NAME} MCP server.`,
};

/**
 * Read at build time from `public/`, which is where the server's CHANGELOG.md is
 * mirrored. Unlike `/architecture`, which reaches up to a repo-root file, this
 * one must live inside the app: the server is a separate package and a
 * self-host build cannot assume the repo layout around it.
 */
async function getChangelog(): Promise<string> {
  return readFile(join(process.cwd(), 'public', 'canvas', 'CHANGELOG.md'), 'utf-8');
}

export default async function CanvasChangelogPage() {
  const markdown = await getChangelog();

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="mx-auto max-w-[720px] animate-fade-up">
        <h1 className="text-[32px] font-normal leading-[1.08] tracking-tighter lg:text-[40px]">Changelog</h1>
        <SectionEyebrow step="CANVAS" label={CANVAS_NAME} sub="release history" className="mt-3" />
      </div>

      <article className="prose-helix mx-auto mt-12 max-w-[720px] animate-fade-up [animation-delay:60ms]">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h1: () => null }}>
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
