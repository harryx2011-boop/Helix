'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Browser-chrome (three dots + URL bar, light) and terminal-chrome (dark, `.dark` tokens)
 * variants sharing one 4-token syntax palette (WEBSITE.md §4.2, §4.5a). Strings are violet.
 */
interface CodePanelProps {
  chrome: 'browser' | 'terminal';
  label?: string;
  tabs?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  copyText?: string;
}

export function CodePanel({ chrome, label, tabs, children, className, copyText }: CodePanelProps) {
  const [copied, setCopied] = React.useState(false);
  const isTerminal = chrome === 'terminal';

  async function handleCopy() {
    if (!copyText) return;
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-panel shadow-card',
        isTerminal ? 'dark bg-background text-foreground' : 'bg-m-surface',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 border-b px-4 py-2.5',
          isTerminal ? 'border-border' : 'border-m-border-faint',
        )}
      >
        <span className="flex gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full', isTerminal ? 'bg-white/15' : 'bg-m-ink/12')} />
          <span className={cn('h-2.5 w-2.5 rounded-full', isTerminal ? 'bg-white/15' : 'bg-m-ink/12')} />
          <span className={cn('h-2.5 w-2.5 rounded-full', isTerminal ? 'bg-white/15' : 'bg-m-ink/12')} />
        </span>
        {label && (
          <span
            className={cn(
              'flex-1 truncate rounded-md px-2 py-0.5 text-center font-mono text-[12px]',
              isTerminal ? 'text-muted-foreground' : 'bg-m-bg text-m-ink/56',
            )}
          >
            {label}
          </span>
        )}
        {tabs && <div className="ml-auto flex items-center gap-1">{tabs}</div>}
        {copyText && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy code"
            className={cn(
              'ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ease-out',
              isTerminal ? 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground' : 'text-m-ink/40 hover:bg-m-ink/[0.039] hover:text-m-ink',
            )}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className="overflow-x-auto px-4 py-4">{children}</div>
    </div>
  );
}

const TOKEN_CLASS: Record<'key' | 'string' | 'punct' | 'plain', string> = {
  key: 'text-m-ink/72',
  string: 'text-violet',
  punct: 'text-m-ink/40',
  plain: 'text-m-ink',
};

/** One syntax token in the shared 4-token palette (key / string / punctuation / plain). Strings are always violet. */
export function CodeToken({ kind, children }: { kind: keyof typeof TOKEN_CLASS; children: React.ReactNode }) {
  return <span className={TOKEN_CLASS[kind]}>{children}</span>;
}

/** Plain pre-formatted code block, coloured by CSS class rather than a tokenizer — matches the reference's static highlighting. */
export function CodeBlock({ children, dark }: { children: string; className?: string; dark?: boolean }) {
  return (
    <pre
      className={cn(
        'whitespace-pre font-mono text-[13px] leading-relaxed',
        dark ? 'text-foreground' : 'text-m-ink',
      )}
    >
      {children}
    </pre>
  );
}
