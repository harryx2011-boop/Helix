'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { CommandPalette } from '@/components/site/command-palette';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const LINKS = [
  { href: '/convert', label: 'Convert' },
  { href: '/compress', label: 'Compress' },
  { href: '/record', label: 'Record' },
  { href: '/tools', label: 'Tools' },
] as const;

/**
 * Slim top bar, identical on every page: wordmark · Convert Compress Tools ·
 * ⌘K search · theme toggle. No menus. Sticky, hairline appears on scroll.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <>
      <header
        className={`sticky top-0 z-40 border-b bg-p-bg/80 backdrop-blur transition-colors duration-200 ease-out ${
          scrolled ? 'border-p-line' : 'border-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-baseline gap-2">
            <Link href="/" className="text-lead font-semibold tracking-tight text-p-ink">
              Converter API
            </Link>
            <a
              href="https://helixapi-dev.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="hidden text-note text-p-ink-3 transition-colors duration-150 ease-out hover:text-p-ink-2 sm:inline"
            >
              by Helix
            </a>
          </div>

          <nav aria-label="Primary" className="flex items-center gap-0.5 sm:gap-1">
            {LINKS.map((l) => {
              const current = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={current ? 'page' : undefined}
                  className={`inline-flex h-11 items-center rounded-pill px-2.5 text-sm font-medium transition-colors duration-150 ease-out hover:bg-p-code hover:text-p-ink sm:px-3 ${
                    current ? 'text-p-ink' : 'text-p-ink-2'
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search tools"
              aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
              className="ml-1 inline-flex h-11 items-center gap-2 rounded-pill px-3 text-sm text-p-ink-2 transition-colors duration-150 ease-out hover:bg-p-code hover:text-p-ink sm:border sm:border-p-line-2 sm:pl-3 sm:pr-2"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded-pill bg-p-code px-1.5 py-0.5 font-mono text-micro text-p-ink-3 sm:inline">
                {isMac ? '⌘K' : 'Ctrl K'}
              </kbd>
            </button>

            <ThemeToggle size="md" className="w-11 px-0" />
          </nav>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </>
  );
}

