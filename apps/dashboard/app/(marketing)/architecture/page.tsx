import * as React from 'react';
import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';

/** Anchors `/architecture#roadmap` to the "Build order" heading without a rehype-slug dependency. */
function H2({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) {
  const text = React.Children.toArray(children).join('');
  const id = /build order/i.test(text) ? 'roadmap' : undefined;
  return (
    <h2 id={id} {...props}>
      {children}
    </h2>
  );
}

export const metadata: Metadata = {
  title: 'Architecture',
  description: 'Three runtimes behind one HTTP surface: the fetch ladder, block detection, extraction and the job store.',
};

async function getArchitectureMarkdown(): Promise<string> {
  const path = join(process.cwd(), '..', '..', 'ARCHITECTURE.md');
  return readFile(path, 'utf-8');
}

export default async function ArchitecturePage() {
  const markdown = await getArchitectureMarkdown();

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="mx-auto max-w-[720px] animate-fade-up">
        <SectionEyebrow step="ENGINEERING" label="ARCHITECTURE" sub="how Helix is built" />
        <h1 className="mt-6 text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
          Three runtimes, <span className="text-violet">one HTTP surface.</span>
        </h1>
      </div>

      <article className="prose-helix mx-auto mt-14 max-w-[720px] animate-fade-up [animation-delay:60ms]">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h2: H2 }}>
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
