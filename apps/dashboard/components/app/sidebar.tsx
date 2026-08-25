'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/shell/logo';
import { SidebarNav } from './sidebar-nav';
import { SpendMeter } from './spend-meter';
import { UserChip } from './user-chip';

const STORAGE_KEY = 'helix.app.sidebarCollapsed';
const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 56;

function SidebarBody({ collapsed, selectedEndpoints }: { collapsed: boolean; selectedEndpoints: readonly string[] }) {
  return (
    <>
      <div className={cn('flex h-14 shrink-0 items-center border-b border-border', collapsed ? 'justify-center px-0' : 'px-4')}>
        <Link href="/app" aria-label="Helix — overview" className="flex items-center">
          {collapsed ? <Logo markOnly className="h-9 w-auto text-foreground" /> : <Logo className="h-12 w-auto text-foreground" />}
        </Link>
      </div>
      <SidebarNav selectedEndpoints={selectedEndpoints} collapsed={collapsed} />
      <div className="mt-auto flex flex-col gap-1 border-t border-border py-2">
        <SpendMeter collapsed={collapsed} />
        <UserChip collapsed={collapsed} />
      </div>
    </>
  );
}

export function Sidebar({
  selectedEndpoints,
  mobileOpen,
  onMobileOpenChange,
}: {
  selectedEndpoints: readonly string[];
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

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <>
      {/* Desktop */}
      <aside
        className="relative hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out lg:flex"
        style={{ width: hydrated ? width : EXPANDED_WIDTH }}
      >
        <SidebarBody collapsed={hydrated && collapsed} selectedEndpoints={selectedEndpoints} />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* Mobile: sheet-style drawer via Dialog */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-fade-in lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card data-[state=open]:animate-slide-up lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <SidebarBody collapsed={false} selectedEndpoints={selectedEndpoints} />
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
