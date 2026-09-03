'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/** Sticky top nav: wordmark + Helix credit, library links, and the primary CTA pill. */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-p-bg/80 backdrop-blur transition-colors duration-200 ease-out ${
        scrolled ? 'border-p-line' : 'border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-baseline gap-2">
          <Link href="/" className="text-[17px] font-semibold tracking-tight text-p-ink">
            Persona
          </Link>
          <a
            href="https://helixapi-dev.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-p-ink-3 transition-colors duration-150 ease-out hover:text-p-ink-2"
          >
            by Helix
          </a>
        </div>

        <nav className="flex items-center gap-6">
          <Link
            href="/roles"
            className="hidden text-[14px] font-medium text-p-ink-2 transition-colors duration-150 ease-out hover:text-p-ink sm:inline"
          >
            Library
          </Link>
          <a
            href="#how"
            className="hidden text-[14px] font-medium text-p-ink-2 transition-colors duration-150 ease-out hover:text-p-ink sm:inline"
          >
            How it works
          </a>
          <Link
            href="/roles"
            className="inline-flex h-9 items-center rounded-pill bg-p-ink px-4 text-[13px] font-medium text-p-bg transition-transform duration-150 ease-out hover:-translate-y-0.5"
          >
            Browse the library
          </Link>
        </nav>
      </div>
    </header>
  );
}
