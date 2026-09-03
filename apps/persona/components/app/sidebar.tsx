'use client';

import * as React from 'react';
import Link from 'next/link';
import { PanelLeftClose, PanelLeftOpen, Search as SearchIcon, Settings as SettingsIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/store';
import type { Role } from '@/lib/catalog';
import { SidebarSearch } from './sidebar-search';
import { SidebarSettings } from './sidebar-settings';

const MIN_WIDTH = 240;
const MAX_WIDTH = 400;
const COLLAPSE_THRESHOLD = 200;
const COLLAPSED_WIDTH = 64;

function SidebarBody({ roles }: { roles: Role[] }) {
  return (
    <Tabs defaultValue="search" className="flex h-full flex-col">
      <TabsList className="mx-4 mt-3 grid grid-cols-2 rounded-card bg-p-code p-1">
        <TabsTrigger value="search" className="gap-1.5 rounded-[8px] text-[12.5px] data-[state=active]:bg-p-surface data-[state=active]:shadow-card-sm">
          <SearchIcon className="h-3.5 w-3.5" />
          Search
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-1.5 rounded-[8px] text-[12.5px] data-[state=active]:bg-p-surface data-[state=active]:shadow-card-sm">
          <SettingsIcon className="h-3.5 w-3.5" />
          Settings
        </TabsTrigger>
      </TabsList>
      <div className="flex-1 overflow-y-auto">
        <TabsContent value="search" className="mt-0">
          <SidebarSearch roles={roles} />
        </TabsContent>
        <TabsContent value="settings" className="mt-0">
          <SidebarSettings />
        </TabsContent>
      </div>
    </Tabs>
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
      className="sticky top-0 relative hidden h-screen shrink-0 border-r border-p-line bg-p-surface transition-[width] duration-150 ease-out lg:flex lg:flex-col"
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

      {!collapsed ? (
        <div className="min-h-0 flex-1">
          <SidebarBody roles={roles} />
        </div>
      ) : null}

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
