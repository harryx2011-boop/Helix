import Link from 'next/link';
import { Logo } from '@/components/shell/logo';

/** Light marketing surface (WEBSITE.md §6.2) — same tokens as AuthFrame, minimal chrome. */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="marketing" className="min-h-screen bg-m-bg font-sans text-m-ink">
      <header className="mx-auto flex h-16 w-full max-w-container items-center px-4">
        <Link href="/" aria-label="Helix home">
          <Logo className="h-7 w-auto text-m-ink" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-container px-4 pb-24 pt-4">{children}</main>
    </div>
  );
}
