import Link from 'next/link';
import { Logo } from '@/components/shell/logo';
import { GridCells } from '@/components/marketing/ambient';
import { AsciiOcean, AsciiWave } from '@/components/marketing/ocean';

/**
 * Light marketing-surface frame around Clerk's components (WEBSITE.md §6.1),
 * on the same hairline grid as the hero. The grid is masked clear behind the
 * card so the form never sits on a line; the water lives below the card and
 * the wave off to one side, so neither competes with it.
 */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div data-surface="marketing" className="relative flex min-h-screen flex-col overflow-hidden bg-m-bg font-sans text-m-ink">
      <GridCells
        fade="none"
        density={10}
        seed={13}
        sparkles={[[2, 2], [10, 3]]}
        clusters={[
          { col: 1, row: 4, size: 3, assemble: true },
          { col: 10, row: 5, size: 4 },
        ]}
        crosshairs
        className="[mask-image:radial-gradient(ellipse_640px_520px_at_50%_44%,transparent_28%,black_78%)] [-webkit-mask-image:radial-gradient(ellipse_640px_520px_at_50%_44%,transparent_28%,black_78%)]"
      />
      <AsciiWave cols={56} rows={7} seed={4} className="absolute right-8 top-28 hidden xl:block" />
      <AsciiOcean
        cols={220}
        rows={10}
        seed={2}
        className="absolute inset-x-0 bottom-0 hidden lg:flex [mask-image:linear-gradient(to_top,black_35%,transparent)] [-webkit-mask-image:linear-gradient(to_top,black_35%,transparent)]"
      />
      <header className="relative mx-auto flex h-16 w-full max-w-container items-center px-4">
        <Link href="/" aria-label="Helix home">
          <Logo className="h-14 w-auto text-m-ink" />
        </Link>
      </header>
      <main className="relative flex flex-1 flex-col items-center px-4 pb-24 pt-10 lg:pb-44">
        <div className="mb-8 text-center">
          <h1 className="text-[32px] font-normal leading-[1.1] tracking-tighter">{title}</h1>
          <p className="mt-2 text-[15px] text-m-ink/70">{subtitle}</p>
        </div>
        {children}
        <p className="mt-10 max-w-md text-center font-mono text-[12px] leading-relaxed tracking-wide text-m-ink/50">
          [ SELF-HOST ] no account needed. <Link href="/self-host" className="underline decoration-m-border-loud underline-offset-4 hover:text-m-ink">docker compose up</Link> and open localhost:3400.
        </p>
      </main>
    </div>
  );
}
