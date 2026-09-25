'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, CircleHelp, Menu, Plug, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PUBLIC_API_URL } from '@/lib/mode';
import { openPalette } from './command-palette/store';

function truncateUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

function WorkspacePill() {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-pill border border-border px-2.5 py-1.5 text-[13px] text-foreground">
      <span className="flex h-5 w-5 items-center justify-center rounded-card bg-primary/12 font-mono text-[11px] text-primary">
        H
      </span>
      Instance
      <span className="font-mono text-[11px] text-muted-foreground">{truncateUrl(PUBLIC_API_URL)}</span>
    </div>
  );
}

function PaletteTrigger() {
  // Rendered as Ctrl on the server and swapped after mount, so the markup matches on hydration.
  const [mac, setMac] = React.useState(false);
  React.useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.userAgent)), []);
  return (
    <>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search and commands" aria-keyshortcuts="Control+K Meta+K" onClick={openPalette}>
        <Search className="h-4 w-4" />
      </Button>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search and commands"
        aria-keyshortcuts="Control+K Meta+K"
        className="hidden h-8 items-center gap-2 rounded-pill border border-border px-2.5 text-[13px] text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:flex"
      >
        <Search className="h-3.5 w-3.5" />
        Search
        <kbd className="rounded-card border border-border bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground">{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
    </>
  );
}

export function TopBar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {onOpenMobileNav && (
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
            <Menu className="h-4 w-4" />
          </Button>
        )}
        <WorkspacePill />
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <PaletteTrigger />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notifications" disabled>
              <Bell className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>No notifications yet</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="icon" className="hidden sm:hidden md:inline-flex" aria-label="Help" asChild>
          <Link href="/docs">
            <CircleHelp className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="hidden md:inline-flex" asChild>
          <Link href="/docs">Docs</Link>
        </Button>
        <Button size="icon" className="sm:hidden" aria-label="Set up an agent" asChild>
          <Link href="/app?connect=1">
            <Plug className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button size="sm" className="hidden gap-1.5 sm:inline-flex" asChild>
          <Link href="/app?connect=1">
            <Plug className="h-3.5 w-3.5" />
            Set up an agent
          </Link>
        </Button>
      </div>
    </header>
  );
}
