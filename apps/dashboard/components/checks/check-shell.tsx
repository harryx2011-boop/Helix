'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleAlert, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiKey } from '@/lib/auth';
import { CHECK_TABS, TAB_LABELS, type CheckTab } from '@/lib/checks-tabs';

/**
 * Checks calls the instance directly and needs the operator's own key, which
 * `(tools)` does not mount an ApiKeyProvider for — this reads the same
 * `localStorage` entry that provider does.
 */
export function useCheckKey(): { apiKey: string | null; ready: boolean } {
  const [apiKey, setKey] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    setKey(getApiKey());
    setReady(true);
  }, []);
  return { apiKey, ready };
}

/** Without the browser-held key there is nothing to call with. */
export function needsKey(apiKey: string | null): boolean {
  return !apiKey;
}

export function CheckTabs({ active }: { active: CheckTab }) {
  return (
    <nav aria-label="Checks" className="flex flex-wrap gap-1 border-b border-m-border-faint">
      {CHECK_TABS.map((tab) => {
        const current = tab === active;
        return (
          <Link
            key={tab}
            href={`/checks/${tab}`}
            aria-current={current ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 font-sans text-[14px] transition-colors duration-150 ease-out',
              current
                ? 'border-violet text-m-ink'
                : 'border-transparent text-m-ink/56 hover:border-m-border-muted hover:text-m-ink',
            )}
          >
            {TAB_LABELS[tab]}
          </Link>
        );
      })}
    </nav>
  );
}

export function CheckPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-card border border-m-border-muted bg-m-bg', className)}>{children}</div>;
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="font-mono text-[12px] uppercase tracking-wide text-m-ink/56">
      {children}
    </label>
  );
}

export const inputClass =
  'min-w-0 flex-1 rounded-card border border-m-border-muted bg-m-bg px-3.5 py-2.5 font-mono text-[13px] text-m-ink placeholder:text-m-ink/40 focus:border-violet-40 focus:outline-none aria-[invalid]:border-destructive';

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 font-mono text-[12px] text-destructive">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function KeyNote() {
  return (
    <p className="font-mono text-[12px] text-m-ink/56">
      Add an API key in{' '}
      <Link href="/app/keys" className="text-violet underline underline-offset-2">
        Keys
      </Link>{' '}
      to run checks against your instance.
    </p>
  );
}

/** Busy state for a submit button; the label stays put so the row does not reflow. */
export function RunLabel({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </span>
  );
}

export function ResultRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-m-border-faint px-5 py-3 last:border-b-0">
      <span className="w-32 shrink-0 font-mono text-[12px] uppercase tracking-wide text-m-ink/56">{label}</span>
      <span className="min-w-0 flex-1 font-mono text-[13px] text-m-ink">{children}</span>
    </div>
  );
}

/** A verdict headline: one word, then the detail underneath. */
export function Verdict({ tone, headline, detail }: { tone: 'good' | 'bad' | 'warn'; headline: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-m-border-faint px-5 py-4">
      <span
        className={cn(
          'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
          tone === 'good' && 'bg-success',
          tone === 'bad' && 'bg-destructive',
          tone === 'warn' && 'bg-amber-500',
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="font-sans text-[18px] font-medium text-m-ink">{headline}</p>
        {detail && <p className="mt-1 font-mono text-[12px] text-m-ink/56">{detail}</p>}
      </div>
    </div>
  );
}
