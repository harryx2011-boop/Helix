'use client';

import Link from 'next/link';
import { Bell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function TopBar({ title, onOpenMobileNav }: { title: string; onOpenMobileNav?: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {onOpenMobileNav && (
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
            <Menu className="h-4 w-4" />
          </Button>
        )}
        <h1 className="text-sm font-medium leading-none">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notifications" disabled>
              <Bell className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>No notifications yet</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/docs">Docs</Link>
        </Button>
      </div>
    </header>
  );
}
