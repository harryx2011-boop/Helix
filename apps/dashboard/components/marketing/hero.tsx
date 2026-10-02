import { GridCells, AsciiHelix } from '@/components/shared/ambient';
import { AsciiFluid } from '@/components/shared/ascii-fluid';
import { AsciiNoise } from '@/components/shared/ascii-fields';
import { PillButton } from '@/components/shared/pill-button';

/** WEBSITE.md §4.2. H1, one sentence, one download button, over a hairline grid texture. */
export function Hero() {
  return (
    <section className="relative overflow-hidden pb-28 pt-24 sm:pb-36 sm:pt-32">
      <GridCells
        labels={{ tl: '[ READ ]', tr: '[ SEARCH ]', bl: '[ WATCH ]', br: '[ CLICK ]' }}
        sparkles={[[3, 1], [10, 1]]}
        clusters={[
          { col: 1, row: 2, size: 4 },
          { col: 0, row: 4, size: 3, assemble: true },
          { col: 9, row: 1, size: 3, accent: true },
          { col: 10, row: 4, size: 4, assemble: true },
        ]}
        crosshairs
        fade="bottom"
      />

      <AsciiNoise
        cols={150}
        rows={24}
        seed={7}
        className="absolute left-1/2 top-6 hidden -translate-x-1/2 opacity-50 md:block [mask-image:radial-gradient(ellipse_at_center,transparent_26%,black_52%,transparent_78%)]"
      />
      <AsciiFluid
        cols={30}
        rows={12}
        seed={71}
        className="absolute left-0 top-[36%] hidden lg:block [mask-image:linear-gradient(to_right,black_70%,transparent)]"
      />
      <AsciiFluid
        cols={30}
        rows={12}
        seed={83}
        className="absolute right-0 top-[36%] hidden lg:block [mask-image:linear-gradient(to_left,black_70%,transparent)]"
      />

      <div className="mx-auto flex min-w-0 max-w-container flex-col items-center px-4 text-center">
        <h1
          data-reveal
          className="max-w-[760px] text-[44px] font-normal leading-[1.03] tracking-tightest sm:text-[64px]"
        >
          Read and watch the web,
          <br />
          <span className="text-violet">from your own PC</span>
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

          <p data-reveal className="mt-5 max-w-[560px] text-[18px] leading-relaxed text-m-ink/72">
            Helix reads pages and documents, searches the web, follows the links across a whole site and tells you
            when something changes. It runs on your Windows PC.
          </p>

          <div data-reveal className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PillButton href="/download" variant="primary">
              Download for Windows
            </PillButton>
            <PillButton href="/docs/how-it-works" variant="secondary">
              How it works
            </PillButton>
          </div>

          <p data-reveal className="mt-4 text-[14px] text-m-ink/56">
            No account to create.
          </p>
        </div>
      </div>
    </section>
  );
}
