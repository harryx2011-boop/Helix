'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useForks, useSettings } from '@/lib/store';
import type { Role } from '@/lib/catalog';
import { SidebarSearch } from './sidebar-search';
import { SidebarEditor } from './sidebar-editor';
import { ThemeToggle } from './sidebar-settings';

const MIN_WIDTH = 240;
const MAX_WIDTH = 400;
const COLLAPSE_THRESHOLD = 200;
const COLLAPSED_WIDTH = 64;

/** Your forks, under the search: a collapsible group with a count, so the sidebar has one job and one shelf. */
function SidebarLibrary({ roles }: { roles: Role[] }) {
  const { forks } = useForks();
  const [open, setOpen] = React.useState(true);
  return (
    <section className="border-t border-p-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-p-code"
      >
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-p-ink-3">Library</span>
          <span className="rounded-pill bg-p-code px-1.5 font-mono text-[11px] text-p-ink-2">{forks.length}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-p-ink-3 transition-transform duration-200 ease-out', !open && '-rotate-90')} />
      </button>
      {open ? <SidebarEditor roles={roles} /> : null}
    </section>
  );
}

function SidebarFooter() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-t border-p-line px-4">
      <a
        href="https://helixapi-dev.vercel.app"
        target="_blank"
        rel="noreferrer"
        className="text-[12px] text-p-ink-3 transition-colors duration-150 ease-out hover:text-p-ink"
      >
        by Helix
      </a>
      <ThemeToggle />
    </div>
  );
}

/** Search and filters, then the fork library, then the footer control. Shared with the mobile sheet. */
export function SidebarBody({ roles }: { roles: Role[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarSearch roles={roles} />
        <SidebarLibrary roles={roles} />
      </div>
      <SidebarFooter />
    </div>
  );
}

/** Desktop sticky sidebar: resizable via a drag handle, collapses to a 64px rail. */
export function Sidebar({ roles }: { roles: Role[] }) {
  const { settings, update } = useSettings();
  const [dragWidth, setDragWidth] = React.useState<number | null>(null);
  const draggingRef = React.useRef(false);

  const collapsed = settings.sidebarCollapsed;
  const width = dragWidth ?? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, settings.sidebarWidth));

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      const next = e.clientX;
      setDragWidth(Math.max(COLLAPSE_THRESHOLD - 40, Math.min(MAX_WIDTH, next)));
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragWidth((current) => {
        if (current === null) return null;
        if (current < COLLAPSE_THRESHOLD) {
          update({ sidebarCollapsed: true });
        } else {
          update({ sidebarWidth: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, current)), sidebarCollapsed: false });
        }
        return null;
      });
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [update]);

  const startDrag = React.useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : width;

  return (
    <aside
      className="sticky top-0 relative hidden h-dvh shrink-0 border-r border-p-line bg-p-surface transition-[width] duration-150 ease-out lg:flex lg:flex-col"
      style={{ width: effectiveWidth }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-p-line px-4">
        {!collapsed ? (
          <Link href="/" className="flex flex-col leading-none">
            <span className="font-mono text-[14px] font-semibold text-p-ink">Persona</span>
            <span className="text-[10.5px] text-p-ink-3">by Helix</span>
          </Link>
        ) : (
          <Link href="/" className="font-mono text-[14px] font-semibold text-p-ink">
            P
          </Link>
        )}
        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => update({ sidebarCollapsed: !collapsed })}
          className="flex h-7 w-7 items-center justify-center rounded-card text-p-ink-3 transition-colors hover:bg-p-code hover:text-p-ink"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed ? <SidebarBody roles={roles} /> : null}

      {!collapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={startDrag}
          className={cn(
            'absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-soft',
          )}
        />
      ) : null}
    </aside>
  );
}
