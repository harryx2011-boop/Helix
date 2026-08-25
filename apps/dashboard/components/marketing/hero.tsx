import { HeroPanel } from './hero-panel';
import { GridCells, AsciiFlame } from './ambient';
import { PillButton } from './pill-button';
import { GithubMark } from './github-mark';

/** WEBSITE.md §4.2. H1 + subhead + CTA pair + hero panel, over a hairline grid texture. */
export function Hero() {
  return (
    <section className="relative overflow-hidden pb-32 pt-20 sm:pt-28">
      <GridCells
        labels={{ tl: '[ 200 OK ]', tr: '[ SCRAPE ]', bl: '[ .JSON ]', br: '[ .MD ]' }}
        sparkles={[[3, 2], [10, 2]]}
        fade="bottom"
      />

      <div className="mx-auto flex min-w-0 max-w-container flex-col items-center px-4 text-center">
        <span data-reveal className="inline-block max-w-[320px] rounded-pill bg-m-ink/[0.039] px-4 py-1.5 font-mono text-[12px] leading-snug text-m-ink/72 sm:max-w-none sm:text-[13px]">
          Apache-2.0 · self-hosted · bring your own keys <span aria-hidden>→</span>
        </span>

        <h1
          data-reveal
          style={{ transitionDelay: '60ms' }}
          className="mt-6 max-w-[760px] text-[44px] font-normal leading-[1.03] tracking-tightest sm:text-[64px]"
        >
          The web-data API
          <br />
          <span className="text-violet">you run yourself</span>
        </h1>

        <div className="relative flex flex-col items-center">
          <AsciiFlame
            shape="cluster"
            cols={26}
            rows={13}
            seed={5}
            className="absolute right-full top-1/2 hidden -translate-x-6 -translate-y-1/2 lg:block"
          />
          <AsciiFlame
            shape="cluster"
            cols={26}
            rows={13}
            seed={9}
            className="absolute left-full top-1/2 hidden -translate-y-1/2 translate-x-6 lg:block"
          />

          <p data-reveal style={{ transitionDelay: '120ms' }} className="mt-5 max-w-[560px] text-[18px] leading-relaxed text-m-ink/72">
            An API built for agents to scour the web.{' '}
            <span className="rounded-card bg-m-ink/[0.039] px-1.5 py-0.5">Completely open source, run it locally.</span>
          </p>

          <div data-reveal style={{ transitionDelay: '180ms' }} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PillButton href="/sign-up" variant="primary">
              Get started
            </PillButton>
            <PillButton href="https://github.com/helix-dev/helix" variant="secondary">
              <GithubMark className="h-4 w-4" />
              View on GitHub
            </PillButton>
          </div>
        </div>

        <div data-reveal style={{ transitionDelay: '240ms' }} className="relative mt-16 w-full min-w-0 max-w-full">
          <HeroPanel id="ladder" />
        </div>
      </div>
    </section>
  );
}
