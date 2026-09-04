import Link from 'next/link';
import { Terminal } from 'lucide-react';
import { PillButton } from './pill-button';
import { GithubMark } from './github-mark';
import { GridCells } from './ambient';
import { AsciiFluid } from './ascii-fluid';
import { FrameBand } from './section-frame';
import { GITHUB_URL } from '@/lib/github-stars';

/** Final section: repeats the hero's CTA pair over a cell grid, flanked by ASCII flame pillars. No stats, no logos. */
export function ClosingCta() {
  return (
    <section className="relative min-h-[480px] overflow-hidden px-6 py-16 sm:px-10">
      <FrameBand step="07" total="07" label="GET STARTED" sub="Run it now" icon={Terminal} />

      <GridCells
        cell={100}
        fade="none"
        density={10}
        labels={{ tl: '[ SEARCH ]', tr: '[ INTERACT ]', bl: '[ SCRAPE ]', br: '[ CRAWL ]' }}
        clusters={[
          { col: 2, row: 1, size: 3, assemble: true },
          { col: 9, row: 3, size: 4, accent: true, assemble: true },
        ]}
        crosshairs
      />

      <AsciiFluid
        cols={44}
        rows={14}
        seed={5}
        className="absolute bottom-6 left-[3%] hidden lg:block [mask-image:linear-gradient(to_right,black_60%,transparent)]"
      />
      <AsciiFluid
        cols={44}
        rows={14}
        seed={9}
        className="absolute bottom-6 right-[3%] hidden lg:block [mask-image:linear-gradient(to_left,black_60%,transparent)]"
      />

      <div data-reveal className="relative mx-auto flex max-w-container flex-col items-center py-16 text-center">
        <h2 className="max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
          Ready to run it?
        </h2>
        <p className="mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
          Apache-2.0, self-hosted, bring your own keys.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PillButton href="/sign-up" variant="primary">
            Get started
          </PillButton>
          <PillButton href={GITHUB_URL} variant="secondary">
            <GithubMark className="h-4 w-4" />
            View on GitHub
          </PillButton>
        </div>

        <Link href="/agent-onboarding/SKILL.md" className="mt-6 text-[13px] text-m-ink/48 transition-colors duration-fast ease-out hover:text-m-ink/72">
          Are you an AI agent? See setup options ›
        </Link>
      </div>
    </section>
  );
}
