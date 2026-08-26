'use client';

import * as React from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { TooltipProvider } from '@/components/ui/tooltip';

export function AppShell({ selectedEndpoints, children }: { selectedEndpoints: readonly string[]; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar selectedEndpoints={selectedEndpoints} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="relative flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
