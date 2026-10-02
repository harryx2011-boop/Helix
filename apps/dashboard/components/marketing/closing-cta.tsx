import { Download } from 'lucide-react';
import { PillButton } from '@/components/shared/pill-button';
import { GridCells } from '@/components/shared/ambient';
import { AsciiFluid } from '@/components/shared/ascii-fluid';
import { FrameBand } from './section-frame';

/** Final section: one button over a cell grid, flanked by ASCII flame pillars. No stats, no logos. */
export function ClosingCta() {
  return (
    <section className="relative min-h-[480px] overflow-hidden px-6 py-16 sm:px-10">
      <FrameBand step="05" icon={Download} />

      <GridCells
        cell={100}
        fade="none"
        density={10}
        labels={{ tl: '[ SEARCH ]', tr: '[ CLICK ]', bl: '[ READ ]', br: '[ WATCH ]' }}
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
          Ready to try it?
        </h2>
        <p className="mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
          Download Helix for Windows. There is no account to create.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PillButton href="/download" variant="primary">
            Get the app
          </PillButton>
          <PillButton href="/docs/quickstart" variant="secondary">
            Read the quickstart
          </PillButton>
        </div>
      </div>
    </section>
  );
}
