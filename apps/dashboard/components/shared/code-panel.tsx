'use client';

import * as React from 'react';
import { Check, Copy } from '@/components/icons/lucide';
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
  /** Line-number gutter for output panels. Hidden below `sm`, where long lines wrap and the numbers would drift. */
  lines?: number;
}

/**
 * Explicit terminal/light flag for CodeToken, read via context rather than the
 * ambient `.dark` CSS class — the site's ThemeProvider toggles `.dark` on
 * `<html>` globally (dark-by-default operator console), so a `dark:` Tailwind
 * variant would leak into every light marketing panel too. Only this
 * CodePanel's own local wrapper decides terminal vs light for its children.
 */
const CodePanelToneContext = React.createContext(false);

export function CodePanel({ chrome, label, tabs, children, className, copyText, lines }: CodePanelProps) {
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
        'w-full min-w-0 max-w-full overflow-hidden rounded-panel shadow-card',
        isTerminal ? 'dark bg-background text-foreground' : 'bg-m-surface',
        className,
      )}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-2 border-b px-4 py-2.5',
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
              'flex-1 truncate rounded-card px-2 py-0.5 text-center font-mono text-[12px]',
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
              'ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-card transition-colors duration-150 ease-out',
              isTerminal ? 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground' : 'text-m-ink/40 hover:bg-m-ink/[0.039] hover:text-m-ink',
            )}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className="flex w-full min-w-0 max-w-full px-4 py-4">
        {lines ? (
          <ol
            aria-hidden="true"
            className={cn(
              'mr-4 hidden shrink-0 select-none text-right font-mono text-[13px] leading-relaxed sm:block',
              isTerminal ? 'text-white/40' : 'text-m-ink/40',
            )}
          >
            {Array.from({ length: lines }, (_, i) => (
              <li key={i}>{i + 1}</li>
            ))}
          </ol>
        ) : null}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <CodePanelToneContext.Provider value={isTerminal}>{children}</CodePanelToneContext.Provider>
        </div>
      </div>
    </div>
  );
}

const TOKEN_CLASS_LIGHT: Record<'key' | 'string' | 'punct' | 'plain', string> = {
  key: 'text-m-ink',
  string: 'text-violet',
  punct: 'text-m-ink/40',
  plain: 'text-m-ink',
};

const TOKEN_CLASS_DARK: Record<'key' | 'string' | 'punct' | 'plain', string> = {
  key: 'text-foreground',
  string: 'text-primary',
  punct: 'text-muted-foreground',
  plain: 'text-foreground',
};

/**
 * One syntax token in the shared 4-token palette (key / string / punctuation
 * / plain). Strings are always violet on light, `text-primary` on dark. Tone
 * comes from the nearest ancestor CodePanel via context, not the ambient
 * `.dark` class (see CodePanelToneContext above) — falls back to light when
 * used outside a CodePanel.
 */
export function CodeToken({ kind, children }: { kind: keyof typeof TOKEN_CLASS_LIGHT; children: React.ReactNode }) {
  const isTerminal = React.useContext(CodePanelToneContext);
  const cls = isTerminal ? TOKEN_CLASS_DARK[kind] : TOKEN_CLASS_LIGHT[kind];
  return <span className={cls}>{children}</span>;
}

/** Plain pre-formatted code block, coloured by CSS class rather than a tokenizer — matches the reference's static highlighting. */
export function CodeBlock({ children, dark }: { children: string; className?: string; dark?: boolean }) {
  return (
    <pre
      className={cn(
        'whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed sm:whitespace-pre sm:break-normal',
        dark ? 'text-foreground' : 'text-m-ink',
      )}
    >
      {children}
    </pre>
  );
}
