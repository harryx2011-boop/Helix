'use client';

import Link from 'next/link';
import { Bell, CircleHelp, Menu, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HOSTED, PUBLIC_API_URL } from '@/lib/mode';
import { useAppSession } from '@/components/app/session-provider';

function truncateUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

function WorkspacePill() {
  const { profile } = useAppSession();

  if (HOSTED) {
    const label = profile?.email?.[0]?.toUpperCase() ?? 'P';
    return (
      <div className="flex items-center gap-2 rounded-pill border border-border px-2.5 py-1.5 text-[13px] text-foreground">
        <span className="flex h-5 w-5 items-center justify-center rounded-card bg-primary/12 font-mono text-[11px] text-primary">
          {label}
        </span>
        Personal
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-pill border border-border px-2.5 py-1.5 text-[13px] text-foreground">
      <span className="flex h-5 w-5 items-center justify-center rounded-card bg-primary/12 font-mono text-[11px] text-primary">
        S
      </span>
      Self-host
      <span className="font-mono text-[11px] text-muted-foreground">{truncateUrl(PUBLIC_API_URL)}</span>
    </div>
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
