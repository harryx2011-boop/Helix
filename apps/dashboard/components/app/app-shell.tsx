'use client';

import * as React from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppGrid } from './app-grid';
import { CommandPalette } from './command-palette/command-palette';

export function AppShell({
  selectedEndpoints,
  children,
}: {
  selectedEndpoints: readonly string[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar selectedEndpoints={selectedEndpoints} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="relative isolate flex-1 overflow-y-auto overflow-x-hidden [container-type:size]">
            <div aria-hidden="true" className="pointer-events-none sticky top-0 z-[-1] h-0">
              <AppGrid className="h-[100cqh]" sparkles={3} density={12} clusters={[{ col: 1, row: 2, size: 3 }, { col: 9, row: 5, size: 4 }]} />
            </div>
            {children}
          </main>
        </div>
      </div>
      <CommandPalette selectedEndpoints={selectedEndpoints} />
    </TooltipProvider>
  );
}
