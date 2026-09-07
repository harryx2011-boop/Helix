'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/shell/logo';
import { SidebarNav } from './sidebar-nav';
import { UserChip } from './user-chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { onSidebarToggle } from './command-palette/store';

const STORAGE_KEY = 'helix.app.sidebarCollapsed';
const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 64;

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center self-center rounded-card text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Expand sidebar</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Collapse sidebar"
      className="flex h-9 w-full items-center justify-center gap-2 rounded-pill border border-border text-[13px] text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      Collapse
    </button>
  );
}

function SidebarBody({
  collapsed,
  selectedEndpoints,
  localTools,
  onToggle,
}: {
  collapsed: boolean;
  selectedEndpoints: readonly string[];
  localTools: boolean;
  onToggle?: () => void;
}) {
  return (
    <>
      <div className={cn('flex h-14 shrink-0 items-center border-b border-border', collapsed ? 'justify-center px-0' : 'px-4')}>
        <Link href="/" aria-label="Helix home" className="flex items-center">
          {collapsed ? <Logo markOnly className="h-9 w-auto text-foreground" /> : <Logo className="h-12 w-auto text-foreground" />}
        </Link>
      </div>
      <SidebarNav selectedEndpoints={selectedEndpoints} localTools={localTools} collapsed={collapsed} />
      <div className={cn('mt-auto flex flex-col gap-1 border-t border-border px-2 py-2', collapsed && 'items-center px-0')}>
        <UserChip collapsed={collapsed} />
        {onToggle && <CollapseToggle collapsed={collapsed} onToggle={onToggle} />}
      </div>
    </>
  );
}

export function Sidebar({
  selectedEndpoints,
  localTools,
  mobileOpen,
  onMobileOpenChange,
}: {
  selectedEndpoints: readonly string[];
  localTools: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === '1') setCollapsed(true);
    setHydrated(true);
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  // Below lg the desktop rail is not rendered, so "toggle" means the drawer.
  React.useEffect(
    () => onSidebarToggle(() => (window.matchMedia('(min-width: 1024px)').matches ? toggle() : onMobileOpenChange(true))),
    [toggle, onMobileOpenChange],
  );

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <>
      {/* Desktop */}
      <aside
        className="relative hidden shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-out lg:flex"
        style={{ width: hydrated ? width : EXPANDED_WIDTH }}
      >
        <SidebarBody collapsed={hydrated && collapsed} selectedEndpoints={selectedEndpoints} localTools={localTools} onToggle={toggle} />
      </aside>

      {/* Mobile: sheet-style drawer via Dialog */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-fade-in lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-background data-[state=open]:animate-slide-up lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <SidebarBody collapsed={false} selectedEndpoints={selectedEndpoints} localTools={localTools} />
            <DialogPrimitive.Close
              aria-label="Close navigation"
              className="absolute right-3 top-3 rounded-card p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
