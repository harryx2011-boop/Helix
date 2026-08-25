'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, Github, Menu, X } from 'lucide-react';
import { Logo } from '@/components/shell/logo';
import { PRODUCTS } from '@/lib/catalog';
import { PillButton } from './pill-button';

const HOSTED = process.env.NEXT_PUBLIC_HELIX_HOSTED === '1';

/** WEBSITE.md §4.1. Sticky, blends with page bg, bottom hairline. Capabilities dropdown from PRODUCTS. */
export function Nav() {
  const [capabilitiesOpen, setCapabilitiesOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-m-border-faint bg-m-bg">
      <div className="relative mx-auto flex h-16 max-w-container items-center justify-between px-4">
        <span aria-hidden="true" className="absolute left-0 top-0 h-3 w-3 border-b border-l border-violet/40" />
        <span aria-hidden="true" className="absolute right-0 top-0 h-3 w-3 border-b border-r border-violet/40" />

        <Link href="/" aria-label="Helix home" className="flex items-center">
          <Logo className="h-12 w-auto text-m-ink" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setCapabilitiesOpen(true)}
            onMouseLeave={() => setCapabilitiesOpen(false)}
          >
            <button
              type="button"
              onClick={() => setCapabilitiesOpen((v) => !v)}
              aria-expanded={capabilitiesOpen}
              className="flex items-center gap-1 rounded-md px-3 py-2 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink"
            >
              Capabilities
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            {capabilitiesOpen && (
              <div className="absolute left-1/2 top-full w-[320px] -translate-x-1/2 pt-2">
                <div className="grid gap-1 rounded-panel border border-m-border-muted bg-m-surface p-2 shadow-card">
                  {PRODUCTS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <Link
                        key={p.id}
                        href={p.route}
                        className="flex items-start gap-3 rounded-card px-3 py-2.5 transition-colors duration-150 ease-out hover:bg-m-ink/[0.039]"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-hidden />
                        <span>
                          <span className="flex items-center gap-2 text-[14px] font-medium text-m-ink">
                            {p.name}
                            {p.status === 'coming' && (
                              <span className="rounded-pill bg-violet-12 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-violet">
                                coming
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-snug text-m-ink/56">{p.tagline}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <Link href="/docs" className="rounded-md px-3 py-2 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink">
            Docs
          </Link>
          <Link href="/architecture" className="rounded-md px-3 py-2 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink">
            Architecture
          </Link>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="https://github.com/helix-dev/helix"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink"
          >
            <Github className="h-4 w-4" aria-hidden />
            helix
          </Link>
          {HOSTED ? (
            <PillButton href="/sign-in" variant="secondary">
              Sign in
            </PillButton>
          ) : (
            <PillButton href="/app" variant="primary">
              Open app
            </PillButton>
          )}
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-m-ink lg:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-m-border-faint bg-m-bg px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            <p className="px-1 pb-1 font-mono text-[12px] uppercase tracking-wide text-m-ink/40">Capabilities</p>
            {PRODUCTS.map((p) => (
              <Link
                key={p.id}
                href={p.route}
                onClick={() => setMobileOpen(false)}
                className="rounded-card px-3 py-2 text-[14px] text-m-ink/72 hover:bg-m-ink/[0.039]"
              >
                {p.name}
              </Link>
            ))}
            <div className="my-2 h-px bg-m-border-faint" />
            <Link href="/docs" onClick={() => setMobileOpen(false)} className="rounded-card px-3 py-2 text-[14px] text-m-ink/72 hover:bg-m-ink/[0.039]">
              Docs
            </Link>
            <Link href="/architecture" onClick={() => setMobileOpen(false)} className="rounded-card px-3 py-2 text-[14px] text-m-ink/72 hover:bg-m-ink/[0.039]">
              Architecture
            </Link>
            <Link href="https://github.com/helix-dev/helix" className="rounded-card px-3 py-2 text-[14px] text-m-ink/72 hover:bg-m-ink/[0.039]">
              GitHub
            </Link>
            <div className="mt-2">
              {HOSTED ? (
                <PillButton href="/sign-in" variant="secondary" className="w-full">
                  Sign in
                </PillButton>
              ) : (
                <PillButton href="/app" variant="primary" className="w-full">
                  Open app
                </PillButton>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
