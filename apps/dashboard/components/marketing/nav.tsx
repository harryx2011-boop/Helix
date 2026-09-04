'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Logo } from '@/components/shell/logo';
import { GITHUB_URL } from '@/lib/github-stars';
import { cn } from '@/lib/utils';
import { PillButton } from './pill-button';
import { GithubMark } from './github-mark';
import {
  CapabilitiesPanel,
  DocsPanel,
  UtilitiesPanel,
  MenuRowItem,
  ENDPOINT_ROWS,
  SURFACE_ROWS,
  DOCS_ROWS,
  UTILITY_ROWS,
  type MenuId,
  type MenuRow,
} from './nav-menus';

const HOSTED = process.env.NEXT_PUBLIC_HELIX_HOSTED === '1';

const MENUS: readonly { id: MenuId; label: string }[] = [
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'docs', label: 'Docs' },
  { id: 'utilities', label: 'Utilities' },
];

const topLinkClass =
  'flex items-center gap-1 rounded-card px-3 py-2 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink focus-visible:text-m-ink';

export interface NavProps {
  /** Formatted star count (`1.2K`) or `null` when the repo is private or the fetch failed. */
  stars?: string | null;
}

/**
 * WEBSITE.md §4.1, LANDING-REVAMP-2 "Nav". Sticky, blends with page bg, bottom
 * hairline. Three full-width panels under the bar; one open at a time.
 */
export function Nav({ stars = null }: NavProps) {
  const [open, setOpen] = React.useState<MenuId | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRefs = React.useRef<Partial<Record<MenuId, HTMLButtonElement | null>>>({});
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const trigger = triggerRefs.current[open];
      setOpen(null);
      trigger?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = React.useCallback(() => setOpen(null), []);

  const onRootBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(null);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-m-border-faint bg-m-bg">
      <div
        ref={rootRef}
        onMouseLeave={close}
        onBlur={onRootBlur}
        className="relative mx-auto flex h-16 max-w-container items-center justify-between px-4"
      >
        <span aria-hidden="true" className="absolute left-0 top-0 h-3 w-3 border-b border-l border-violet/40" />
        <span aria-hidden="true" className="absolute right-0 top-0 h-3 w-3 border-b border-r border-violet/40" />

        <Link href="/" aria-label="Helix home" onMouseEnter={close} className="flex items-center">
          <Logo className="h-12 w-auto text-m-ink" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {MENUS.map((menu, i) => (
            <React.Fragment key={menu.id}>
              <div onMouseEnter={() => setOpen(menu.id)}>
                <button
                  ref={(el) => {
                    triggerRefs.current[menu.id] = el;
                  }}
                  type="button"
                  id={`nav-${menu.id}-trigger`}
                  aria-haspopup="true"
                  aria-expanded={open === menu.id}
                  aria-controls={`nav-${menu.id}-panel`}
                  onClick={() => setOpen((v) => (v === menu.id ? null : menu.id))}
                  className={cn(topLinkClass, open === menu.id && 'text-m-ink')}
                >
                  {menu.label}
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform duration-150 ease-out', open === menu.id && 'rotate-180')}
                    aria-hidden
                  />
                </button>
                {open === menu.id && (
                  <div
                    id={`nav-${menu.id}-panel`}
                    role="region"
                    aria-labelledby={`nav-${menu.id}-trigger`}
                    className="absolute inset-x-0 top-full animate-fade-in-up overflow-hidden rounded-b-panel border border-t-0 border-m-border-muted bg-m-surface shadow-card"
                  >
                    {menu.id === 'capabilities' && <CapabilitiesPanel onNavigate={close} />}
                    {menu.id === 'docs' && <DocsPanel onNavigate={close} />}
                    {menu.id === 'utilities' && <UtilitiesPanel onNavigate={close} />}
                  </div>
                )}
              </div>
              {i === 0 && (
                <Link href="/status" onMouseEnter={close} className={topLinkClass}>
                  Status
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>

        <div onMouseEnter={close} className="hidden items-center gap-3 lg:flex">
          <Link
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={stars ? `Helix on GitHub, ${stars} stars` : 'Helix on GitHub'}
            className="flex items-center gap-2 rounded-card px-3 py-2 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink"
          >
            <GithubMark className="h-4 w-4" />
            {stars ? <span className="font-mono text-[13px] tabular-nums">{stars}</span> : 'GitHub'}
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
          aria-expanded={mobileOpen}
          aria-controls="nav-mobile"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-card text-m-ink lg:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div
          id="nav-mobile"
          className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-m-border-faint bg-m-bg px-4 py-3 lg:hidden"
        >
          <div className="flex flex-col">
            <MobileGroup label="Capabilities" rows={[...ENDPOINT_ROWS, ...SURFACE_ROWS]} onNavigate={() => setMobileOpen(false)} />
            <Link
              href="/status"
              onClick={() => setMobileOpen(false)}
              className="border-b border-m-border-faint px-1 py-3 text-[14px] font-medium text-m-ink"
            >
              Status
            </Link>
            <MobileGroup label="Docs" rows={DOCS_ROWS} onNavigate={() => setMobileOpen(false)} />
            <MobileGroup label="Utilities" rows={UTILITY_ROWS} onNavigate={() => setMobileOpen(false)} />
            <Link
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 border-b border-m-border-faint px-1 py-3 text-[14px] font-medium text-m-ink"
            >
              <GithubMark className="h-4 w-4" />
              {stars ? <span className="font-mono text-[13px] tabular-nums">{stars}</span> : 'GitHub'}
            </Link>
            <div className="pt-3">
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

function MobileGroup({ label, rows, onNavigate }: { label: string; rows: readonly MenuRow[]; onNavigate: () => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const id = `nav-mobile-${label.toLowerCase()}`;
  return (
    <div className="border-b border-m-border-faint">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-1 py-3 text-[14px] font-medium text-m-ink"
      >
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-150 ease-out', expanded && 'rotate-180')} aria-hidden />
      </button>
      {expanded && (
        <div id={id} className="-mx-1 pb-2">
          {rows.map((row) => (
            <MenuRowItem key={row.label} row={row} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
