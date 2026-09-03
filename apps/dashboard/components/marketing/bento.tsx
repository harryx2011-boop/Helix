import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BentoCardProps {
  icon: LucideIcon;
  eyebrow: string;
  lead: string;
  body: string;
  /** On a six-column grid: wide spans four, narrow spans two. Rows alternate wide/narrow then narrow/wide. */
  span: 'wide' | 'narrow';
  /** Bottom slot: a meter panel, a log, or an evidence chip. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * One cell of a hairline bento. Text sits on top, the visual fills the
 * bottom; borders come from the cell itself so the grid needs no gap.
 * The parent grid must carry `data-reveal-group` or the cells stay hidden.
 * Two cells per row at `sm:`; the second in each row gets a left hairline,
 * the last row loses its bottom one.
 */
export function BentoCard({ icon: Icon, eyebrow, lead, body, span, children, className }: BentoCardProps) {
  return (
    <div
      data-reveal-item
      className={cn(
        'flex min-w-0 flex-col border-b border-m-border-faint p-6 transition-colors duration-200 ease-out hover:bg-m-ink/[0.031] sm:p-7',
        'sm:[&:nth-child(2n)]:border-l sm:[&:nth-last-child(-n+2)]:border-b-0',
        span === 'wide' ? 'sm:col-span-4' : 'sm:col-span-2',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 font-mono text-[12px] text-m-ink/56">
        <Icon className="h-3.5 w-3.5 text-violet" strokeWidth={1.75} aria-hidden />
        {eyebrow}
      </div>
      <p className="mt-3 max-w-[520px] text-[18px] leading-snug tracking-tight sm:text-[20px]">
        <span className="font-medium text-m-ink">{lead}</span> <span className="text-m-ink/64">{body}</span>
      </p>
      {children && <div className="mt-auto pt-6">{children}</div>}
    </div>
  );
}

/** The three-dot evidence chip used when a cell has no visual of its own. */
export function EvidenceChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="ml-1 h-2 w-2 shrink-0 rounded-full bg-m-ink/12" aria-hidden />
      <span className="h-2 w-2 shrink-0 rounded-full bg-m-ink/12" aria-hidden />
      <span className="h-2 w-2 shrink-0 rounded-full bg-m-ink/12" aria-hidden />
      <span className="ml-1 min-w-0 flex-1 truncate rounded-card bg-m-bg px-2 py-1 font-mono text-[12px] text-m-ink/56">
        {children}
      </span>
    </div>
  );
}
