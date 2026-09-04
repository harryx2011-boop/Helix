'use client';

import * as React from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppGrid } from './app-grid';
import { CommandPalette } from './command-palette/command-palette';

export function AppShell({ selectedEndpoints, children }: { selectedEndpoints: readonly string[]; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar selectedEndpoints={selectedEndpoints} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
          {/*
           * One grid behind every /app screen, as a backdrop that stays put while
           * content scrolls over it. Three details make that work without touching
           * the pages: the layer is sticky with zero height so it takes no space;
           * it is sized with `cqh` against `main` (a size container) rather than
           * the viewport, so it covers exactly the scroll area under the bar; and
           * it sits at z-[-1] inside `isolate`, so it paints below in-flow content
           * (an absolutely positioned sibling would otherwise paint on top of any
           * page whose root is not positioned). Children keep their `h-full` and
           * `min-h-full` semantics because nothing wraps them.
           */}
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
