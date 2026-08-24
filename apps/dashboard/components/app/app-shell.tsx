'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

const TITLES: Record<string, string> = {
  '/app': 'Overview',
  '/app/playground': 'Playground',
  '/app/self-host': 'Self-host guide',
  '/app/self-host/instances': 'Instances',
  '/app/activity': 'Activity logs',
  '/app/usage': 'Usage',
  '/app/keys': 'API keys',
  '/app/settings': 'Settings',
};

function titleFor(pathname: string): string {
  const exact = TITLES[pathname];
  if (exact) return exact;
  const match = Object.keys(TITLES)
    .filter((p) => p !== '/app' && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return (match && TITLES[match]) || 'Helix';
}

export function AppShell({ selectedEndpoints, children }: { selectedEndpoints: readonly string[]; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar selectedEndpoints={selectedEndpoints} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={titleFor(pathname)} onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
