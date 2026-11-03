import * as React from 'react';
import { cn } from '@/lib/utils';


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
  bleed?: boolean;
  flush?: boolean;
  transparent?: boolean;
}

export function FrameRow({ children, className, bleed = true, flush, transparent }: FrameRowProps) {
  return (
    <div className={cn('relative', !transparent && 'bg-background', !flush && 'border-b border-border', className)}>
      {bleed && !flush && <span aria-hidden className="pointer-events-none absolute -left-[100vw] -right-[100vw] bottom-[-1px] h-px bg-border" />}
      {children}
    </div>
  );
}

export function FrameHeading({
  title,
  description,
  action,
  field,
  className,
  id,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  field?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={cn('relative flex items-start justify-between gap-4 overflow-hidden px-6 py-5 scroll-mt-16', className)}>
      {field && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {field}
        </div>
      )}
      <div className="relative min-w-0">
        <h2 className="truncate text-[17px] font-medium leading-tight tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="relative shrink-0">{action}</div>}
    </div>
  );
}

export function FrameCells({ cols = 3, children, className }: { cols?: 2 | 3 | 4; children: React.ReactNode; className?: string }) {
  const colClass = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[cols];
  return (
    <div className={cn('grid grid-cols-1 divide-y divide-border md:divide-x md:divide-y-0', colClass, className)}>
      {children}
    </div>
  );
}

export function FrameTag({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'accent' }) {
  return (
    <span className={cn('font-mono text-[11px] uppercase tracking-wide', tone === 'accent' ? 'text-primary' : 'text-muted-foreground')}>
      [ {children} ]
    </span>
  );
}
