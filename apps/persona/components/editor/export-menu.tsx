'use client';

import * as React from 'react';
import { ChevronDown, Download, FileJson, FileText, Printer } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadFork } from '@/lib/export';
import type { Fork } from '@/lib/store';

/** Export menu: .md / .txt / .json download, .pdf via the print route in a new tab. */
export function ExportMenu({ fork }: { fork: Fork }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-p-line bg-p-surface px-3 text-sm text-p-ink transition-colors duration-150 ease-out hover:bg-p-code focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-ring"
        >
          <Download className="h-3.5 w-3.5" />
          Export
          <ChevronDown className="h-3.5 w-3.5 text-p-ink-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-card border-p-line p-1">
        <DropdownMenuItem className="gap-2 rounded-card text-sm" onSelect={() => downloadFork(fork, 'md')}>
          <FileText className="h-4 w-4 text-p-ink-3" />
          Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-card text-sm" onSelect={() => downloadFork(fork, 'txt')}>
          <FileText className="h-4 w-4 text-p-ink-3" />
          Plain text (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-card text-sm" onSelect={() => downloadFork(fork, 'json')}>
          <FileJson className="h-4 w-4 text-p-ink-3" />
          JSON (.json)
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-card text-sm"
          onSelect={() => window.open(`/editor/${fork.id}/print`, '_blank', 'noopener,noreferrer')}
        >
          <Printer className="h-4 w-4 text-p-ink-3" />
          PDF (print)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
