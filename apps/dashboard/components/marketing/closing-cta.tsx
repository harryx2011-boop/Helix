import Link from 'next/link';
import { PillButton } from './pill-button';
import { GithubMark } from './github-mark';
import { GridCells, AsciiHelix } from './ambient';
import { FrameBand } from './section-frame';

/** Final section: repeats the hero's CTA pair over a cell grid, flanked by ASCII flame pillars. No stats, no logos. */
export function ClosingCta() {
  return (
    <section className="relative min-h-[480px] overflow-hidden px-6 py-16 sm:px-10">
      <FrameBand step="06" total="06" label="GET STARTED" sub="Run it now" />

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

      <AsciiHelix
        orientation="vertical"
        cols={22}
        rows={30}
        pitch={16}
        seed={5}
        className="pointer-events-none absolute bottom-0 left-[8%] hidden lg:block"
      />
      <AsciiHelix
        orientation="vertical"
        cols={22}
        rows={30}
        pitch={16}
        seed={9}
        className="pointer-events-none absolute bottom-0 right-[8%] hidden lg:block"
      />

      <div data-reveal className="relative mx-auto flex max-w-container flex-col items-center py-16 text-center">
        <span className="font-mono text-[12px] text-m-ink/56">{'// get started \\\\'}</span>
        <h2 className="mt-4 max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
          Ready to run it?
        </h2>
        <p className="mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
          Apache-2.0, self-hosted, bring your own keys. Or start with a hosted key in under a minute.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PillButton href="/sign-up" variant="primary">
            Get started
          </PillButton>
          <PillButton href="https://github.com/helix-dev/helix" variant="secondary">
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
