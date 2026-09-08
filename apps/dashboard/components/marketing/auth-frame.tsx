import Link from 'next/link';
import { Logo } from '@/components/shell/logo';
import { GridCells } from '@/components/marketing/ambient';
import { AsciiOcean, AsciiWave } from '@/components/marketing/ocean';

/**
 * Light marketing-surface frame around Clerk's components (WEBSITE.md §6.1).
 * Two columns from `lg`: the form on plain ground, and a sticky panel that
 * carries the hero's texture — the hairline grid, the water and the wave —
 * so the character work never sits under the card. Below `lg` the panel is
 * gone and the form centres alone.
 */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div data-surface="marketing" className="min-h-screen bg-m-bg p-4 font-sans text-m-ink sm:p-5">
      <div className="grid min-h-[calc(100dvh-40px)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        <div className="flex min-h-[calc(100dvh-40px)] flex-col">
          <header className="flex h-16 items-center">
            <Link href="/" aria-label="Helix home">
              <Logo className="h-14 w-auto text-m-ink" />
            </Link>
          </header>
          <main className="flex flex-1 flex-col items-center justify-center py-10">
            <div className="mb-8 text-center">
              <h1 className="text-[32px] font-normal leading-[1.1] tracking-tighter">{title}</h1>
              <p className="mt-2 text-[15px] text-m-ink/70">{subtitle}</p>
            </div>
            <div className="flex w-full flex-col items-center">{children}</div>
            <p className="mt-10 max-w-md text-center font-mono text-[12px] leading-relaxed tracking-wide text-m-ink/50">
              [ SELF-HOST ] no account needed. <Link href="/self-host" className="underline decoration-m-border-loud underline-offset-4 hover:text-m-ink">docker compose up</Link> and open localhost:3400.
            </p>
          </main>
        </div>

        <aside
          aria-hidden="true"
          className="sticky top-5 hidden h-[calc(100dvh-40px)] self-start animate-fade-up overflow-hidden rounded-[24px] border border-m-border-faint bg-m-bg-lighter lg:block"
        >
          <GridCells
            fade="none"
            density={6}
            seed={13}
            sparkles={[[2, 2], [5, 6]]}
            clusters={[
              { col: 1, row: 1, size: 3, assemble: true },
              { col: 5, row: 5, size: 4, assemble: true },
            ]}
            crosshairs
          />
          <AsciiWave cols={40} rows={7} seed={4} className="absolute right-8 top-10 opacity-60" />
          <AsciiOcean
            cols={220}
            rows={10}
            seed={2}
            className="absolute inset-x-0 bottom-0 [mask-image:linear-gradient(to_top,black_35%,transparent)] [-webkit-mask-image:linear-gradient(to_top,black_35%,transparent)]"
          />
          <div className="absolute inset-0 flex items-center justify-center px-10">
            <p className="max-w-[520px] text-center text-[clamp(28px,3vw,44px)] font-normal leading-[1.1] tracking-tighter text-m-ink/40 [text-wrap:balance]">
              A frontier utility hub
              <span className="ml-2.5 inline-block h-3 w-3 rounded-[2px] bg-violet" />
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
