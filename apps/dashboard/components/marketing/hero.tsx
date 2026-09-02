import { HeroPanel } from './hero-panel';
import { GridCells, AsciiHelix, CodeRain } from './ambient';
import { PillButton } from './pill-button';
import { GithubMark } from './github-mark';
import { SetupPrompt } from './setup-prompt';

/** WEBSITE.md §4.2. H1 + subhead + CTA pair + hero panel, over a hairline grid texture. */
export function Hero() {
  return (
    <section className="relative overflow-hidden pb-32 pt-20 sm:pt-28">
      <GridCells
        labels={{ tl: '[ 200 OK ]', tr: '[ SCRAPE ]', bl: '[ .JSON ]', br: '[ .MD ]' }}
        sparkles={[[3, 2], [10, 2]]}
        clusters={[
          { col: 1, row: 2, size: 4 },
          { col: 0, row: 4, size: 3, assemble: true },
          { col: 9, row: 1, size: 3, accent: true },
          { col: 10, row: 4, size: 4, assemble: true },
        ]}
        crosshairs
        fade="bottom"
      />

      <CodeRain
        cols={8}
        rows={6}
        density={0.35}
        seed={71}
        className="absolute left-6 top-1/2 hidden max-w-[160px] -translate-y-1/2 xl:block"
      />
      <CodeRain
        cols={8}
        rows={6}
        density={0.35}
        seed={83}
        className="absolute right-6 top-1/2 hidden max-w-[160px] -translate-y-1/2 xl:block"
      />

      <div className="mx-auto flex min-w-0 max-w-container flex-col items-center px-4 text-center">
        <h1
          data-reveal
          style={{ transitionDelay: '60ms' }}
          className="max-w-[760px] text-[44px] font-normal leading-[1.03] tracking-tightest sm:text-[64px]"
        >
          The web-data API
          <br />
          <span className="text-violet">you run yourself</span>
        </h1>

        <div className="relative flex flex-col items-center">
          <AsciiHelix
            orientation="horizontal"
            cols={32}
            rows={13}
            pitch={22}
            seed={5}
            className="absolute right-full top-1/2 hidden -translate-x-6 -translate-y-1/2 lg:block"
          />
          <AsciiHelix
            orientation="horizontal"
            cols={32}
            rows={13}
            pitch={22}
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

          <div data-reveal style={{ transitionDelay: '220ms' }} className="mt-4">
            <SetupPrompt />
          </div>
        </div>

        <div data-reveal style={{ transitionDelay: '240ms' }} className="relative mt-16 w-full min-w-0 max-w-full">
          <HeroPanel id="ladder" />
        </div>
      </div>
    </section>
  );
}
