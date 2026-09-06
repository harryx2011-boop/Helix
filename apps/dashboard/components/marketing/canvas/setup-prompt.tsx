'use client';

import * as React from 'react';
import Image from 'next/image';
import { Check, ChevronDown, Copy, ExternalLink, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CANVAS_REPO, canvasSetupPrompt } from '@/lib/canvas';
import { cn } from '@/lib/utils';

interface AgentTarget {
  id: 'claude-code' | 'codex' | 'cursor';
  label: string;
  mark: string;
}

const TARGETS: readonly AgentTarget[] = [
  { id: 'claude-code', label: 'Claude Code', mark: '/agents/claude-code.png' },
  { id: 'codex', label: 'Codex', mark: '/agents/codex.png' },
  { id: 'cursor', label: 'Cursor', mark: '/agents/cursor.png' },
];

/**
 * Canvas Connect's counterpart to the main page's `SetupPrompt`: same split
 * pill, but the copied prompt walks an agent through cloning and running a
 * local MCP server rather than minting a hosted API key.
 */
export function CanvasSetupPrompt({ className }: { className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);

  const copy = React.useCallback(async () => {
    await navigator.clipboard.writeText(canvasSetupPrompt());
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  }, []);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const open = (target: AgentTarget) => {
    void navigator.clipboard.writeText(canvasSetupPrompt());
    window.open(target.id === 'cursor' ? CANVAS_REPO.replace(/\.git$/, '') : '/canvas', '_self');
  };

  return (
    <div
      className={cn(
        'inline-flex h-10 items-stretch overflow-hidden rounded-pill border border-m-border-muted bg-m-surface text-[14px] font-medium text-m-ink shadow-card-sm',
        className,
      )}
    >
      <button
        type="button"
        onClick={copy}
        aria-live="polite"
        className="flex items-center gap-2 pl-4 pr-3.5 transition-colors duration-150 ease-out hover:bg-m-ink/[0.039] active:bg-m-ink/[0.059]"
      >
        <span className="relative h-4 w-4" aria-hidden>
          <Copy className={cn('absolute inset-0 h-4 w-4 transition-opacity duration-150 ease-out', copied && 'opacity-0')} />
          <Check className={cn('absolute inset-0 h-4 w-4 text-violet transition-opacity duration-150 ease-out', !copied && 'opacity-0')} />
        </span>
        {copied ? 'Copied' : 'Copy setup prompt'}
      </button>

      <span className="my-2 w-px bg-m-border-muted" aria-hidden />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Open Canvas Connect in your coding agent"
            className="group flex items-center gap-1.5 pl-3 pr-3 transition-colors duration-150 ease-out hover:bg-m-ink/[0.039] data-[state=open]:bg-m-ink/[0.039]"
          >
            <span className="flex items-center">
              {TARGETS.map((t, i) => (
                <Image
                  key={t.id}
                  src={t.mark}
                  alt=""
                  width={18}
                  height={18}
                  className={cn('h-[18px] w-[18px] rounded-[4px] ring-2 ring-m-surface', i > 0 && '-ml-1.5')}
                />
              ))}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-m-ink/56 transition-transform duration-150 ease-out group-data-[state=open]:rotate-180" aria-hidden />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={8}
          data-surface="marketing"
          style={{ background: 'var(--m-surface)' }}
          className="min-w-[200px] rounded-panel border-m-border-muted p-1.5 text-m-ink shadow-card"
        >
          <DropdownMenuLabel className="px-2 pb-1 pt-1.5 font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-m-ink/56">
            Open in
          </DropdownMenuLabel>
          {TARGETS.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onSelect={() => open(t)}
              className="gap-2.5 rounded-card px-2 py-2 text-[14px] focus:bg-m-ink/[0.039] focus:text-m-ink"
            >
              <Image src={t.mark} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-[4px]" />
              <span className="flex-1">{t.label}</span>
              <ExternalLink className="h-3.5 w-3.5 text-m-ink/40" aria-hidden />
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="my-1.5 bg-m-border-muted" />
          <DropdownMenuItem asChild className="gap-2.5 rounded-card px-2 py-2 text-[14px] focus:bg-m-ink/[0.039] focus:text-m-ink">
            <a href={CANVAS_REPO.replace(/\.git$/, '')} target="_blank" rel="noreferrer">
              <FileText className="h-[18px] w-[18px] text-m-ink/56" aria-hidden />
              <span className="flex-1">Source on GitHub</span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
