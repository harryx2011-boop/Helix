import Link from 'next/link';
import { Logo } from '@/components/shell/logo';

/** Light marketing-surface frame around Clerk's components (WEBSITE.md §6.1). */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div data-surface="marketing" className="flex min-h-screen flex-col bg-m-bg font-sans text-m-ink">
      <header className="mx-auto flex h-16 w-full max-w-container items-center px-4">
        <Link href="/" aria-label="Helix home">
          <Logo className="h-14 w-auto text-m-ink" />
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pb-24 pt-10">
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
