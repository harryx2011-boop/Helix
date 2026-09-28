import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HeroField } from '@/components/marketing/hero-field';
import { ArchitectureMarkdown } from './architecture-markdown';

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
      <div className="relative">
        <HeroField
          motif="flow"
          seed={41}
          className="opacity-50 [mask-image:radial-gradient(ellipse_at_center,transparent_56%,black_78%,transparent_100%)]"
        />
        <div className="relative mx-auto max-w-[720px] animate-fade-up">
          <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            Three runtimes, <span className="text-violet">one HTTP surface.</span>
          </h1>
        </div>
      </div>

      <article className="prose-helix mx-auto mt-14 max-w-[720px] animate-fade-up [animation-delay:60ms]">
        <ArchitectureMarkdown content={markdown} />
      </article>
    </div>
  );
}
