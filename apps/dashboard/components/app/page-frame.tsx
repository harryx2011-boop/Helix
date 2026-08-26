import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * The /app page skeleton: a centred column whose vertical hairlines run the
 * full height of the page, with horizontal hairlines that bleed past the
 * column edges so rows read as one grid rather than stacked cards. Every
 * app screen composes these; nothing here fetches.
 */

export function PageFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative min-h-full overflow-x-hidden px-4 lg:px-10', className)}>
      <div className="relative mx-auto min-h-full max-w-[1180px] border-x border-border">{children}</div>
    </div>
  );
}

interface FrameRowProps {
  children: React.ReactNode;
  className?: string;
  /** Draw the bottom hairline past the column edges (the crossing-lines look). */
  bleed?: boolean;
  /** Skip the bottom hairline (last row before the page ends). */
  flush?: boolean;
}

export function FrameRow({ children, className, bleed = true, flush }: FrameRowProps) {
  return (
    <div className={cn('relative', !flush && 'border-b border-border', className)}>
      {bleed && !flush && <span aria-hidden className="pointer-events-none absolute -left-[100vw] -right-[100vw] bottom-[-1px] h-px bg-border" />}
      {children}
    </div>
  );
}

/** Title + one-line description at the top of a row, optionally with an action on the right. */
export function FrameHeading({ title, description, action, className }: { title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-6 py-5', className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-medium leading-tight tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Equal cells separated by hairlines; collapses to one column below `md`. */
export function FrameCells({ cols = 3, children, className }: { cols?: 2 | 3 | 4; children: React.ReactNode; className?: string }) {
  const colClass = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[cols];
  return (
    <div className={cn('grid grid-cols-1 divide-y divide-border md:divide-x md:divide-y-0', colClass, className)}>
      {children}
    </div>
  );
}

/** Mono `[ LIVE ]`-style tag used beside row titles. */
export function FrameTag({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'accent' }) {
  return (
    <span className={cn('font-mono text-[11px] uppercase tracking-wide', tone === 'accent' ? 'text-primary' : 'text-muted-foreground')}>
      [ {children} ]
    </span>
  );
}
