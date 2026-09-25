import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/shell/logo';

const LINKS = [
  { label: 'Convert', href: '/convert' },
  { label: 'Compress', href: '/convert/compress' },
  { label: 'Record', href: '/convert/record' },
  { label: 'History', href: '/convert/history' },
  { label: 'Checks', href: '/checks' },
] as const;

/**
 * The browser-side tools keep the light `--m-*` surface they were designed on;
 * only the marketing chrome around them is gone, so the header links back to
 * the app instead.
 */
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="marketing" className="relative isolate min-h-screen bg-m-bg font-sans text-m-ink">
      <header className="border-b border-m-border-faint">
        <div className="mx-auto flex h-14 max-w-container items-center gap-6 px-5 sm:px-8">
          <Link href="/app" aria-label="Helix app" className="flex shrink-0 items-center">
            <Logo className="h-9 w-auto text-m-ink" />
          </Link>
          <nav aria-label="Tools" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 rounded-pill px-3 py-1.5 text-[14px] text-m-ink/64 transition-colors duration-150 ease-out hover:bg-m-ink/[0.039]hover:text-m-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/app"
            className="flex shrink-0 items-center gap-1.5 text-[14px] text-m-ink/64 transition-colors duration-150 ease-out hover:text-m-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Back to app</span>
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
