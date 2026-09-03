'use client';

import * as React from 'react';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/catalog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PenLine, Search as SearchIcon, Settings as SettingsIcon } from 'lucide-react';
import { SidebarSearch } from './sidebar-search';
import { SidebarEditor } from './sidebar-editor';
import { SidebarSettings } from './sidebar-settings';

/** < 1024px: the sidebar becomes a sheet toggled from a top bar. */
export function MobileSidebar({ roles }: { roles: Role[] }) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-p-line bg-p-surface px-4 lg:hidden">
        <Link href="/" className="flex flex-col leading-none">
          <span className="font-mono text-[14px] font-semibold text-p-ink">Persona</span>
          <span className="text-[10.5px] text-p-ink-3">by Helix</span>
        </Link>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="Open menu"
            className="flex h-8 w-8 items-center justify-center rounded-card text-p-ink-3 transition-colors hover:bg-p-code hover:text-p-ink"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
        </DialogPrimitive.Trigger>
      </div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-fade-in lg:hidden" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex h-full w-[85vw] max-w-[320px] flex-col border-r border-p-line bg-p-surface shadow-panel lg:hidden',
            'data-[state=open]:animate-fade-in',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Search and settings</DialogPrimitive.Title>
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-p-line px-4">
            <span className="font-mono text-[14px] font-semibold text-p-ink">Persona</span>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="flex h-7 w-7 items-center justify-center rounded-card text-p-ink-3 transition-colors hover:bg-p-code hover:text-p-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <Tabs defaultValue="search" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-3 grid grid-cols-3 rounded-card bg-p-code p-1">
              <TabsTrigger value="search" className="gap-1.5 rounded-[8px] text-[12.5px] data-[state=active]:bg-p-surface data-[state=active]:shadow-card-sm">
                <SearchIcon className="h-3.5 w-3.5" />
                Search
              </TabsTrigger>
              <TabsTrigger value="editor" className="gap-1.5 rounded-[8px] text-[12.5px] data-[state=active]:bg-p-surface data-[state=active]:shadow-card-sm">
                <PenLine className="h-3.5 w-3.5" />
                Editor
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 rounded-[8px] text-[12.5px] data-[state=active]:bg-p-surface data-[state=active]:shadow-card-sm">
                <SettingsIcon className="h-3.5 w-3.5" />
                Settings
              </TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <TabsContent value="search" className="mt-0">
                <SidebarSearch roles={roles} />
              </TabsContent>
              <TabsContent value="editor" className="mt-0">
                <SidebarEditor roles={roles} />
              </TabsContent>
              <TabsContent value="settings" className="mt-0">
                <SidebarSettings />
              </TabsContent>
            </div>
          </Tabs>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
