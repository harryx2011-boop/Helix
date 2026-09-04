import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconTile } from './icon-tile';

export type BentoSpan = 'wide' | 'narrow' | 'hero' | 'third';

export interface BentoCardProps {
  icon: LucideIcon;
  eyebrow: string;
  lead: string;
  body: string;
  /**
   * Six-column grid. `wide` / `narrow` alternate two per row (four / two
   * columns). `hero` takes the full row with its visual beside the text;
   * `third` is one of three equal cells in the row beneath it.
   */
  span: BentoSpan;
  /** Optional "Read more" line under the lead. Both or neither. */
  href?: string;
  linkLabel?: string;
  /** Bottom slot: a meter panel, a log, or an evidence chip. */
  children?: React.ReactNode;
  className?: string;
}

const SPAN_CLASS: Record<BentoSpan, string> = {
  wide: 'border-b sm:col-span-4 sm:[&:nth-child(2n)]:border-l sm:[&:nth-last-child(-n+2)]:border-b-0',
  narrow: 'border-b sm:col-span-2 sm:[&:nth-child(2n)]:border-l sm:[&:nth-last-child(-n+2)]:border-b-0',
  hero: 'border-b sm:col-span-6 sm:flex-row sm:items-center sm:gap-10',
  third: 'border-b last:border-b-0 sm:col-span-2 sm:border-b-0 sm:[&:nth-child(n+3)]:border-l',
};

/**
 * One cell of a hairline bento. Text sits on top, the visual fills the
 * bottom; borders come from the cell itself so the grid needs no gap.
 * The parent grid must carry `data-reveal-group` or the cells stay hidden.
 */
export function BentoCard({ icon, eyebrow, lead, body, span, href, linkLabel, children, className }: BentoCardProps) {
  const hero = span === 'hero';
  return (
    <div
      data-reveal-item
      className={cn(
        'flex min-w-0 flex-col border-m-border-faint p-6 transition-colors duration-200 ease-out hover:bg-m-ink/[0.031] sm:p-7',
        SPAN_CLASS[span],
        className,
      )}
    >
      <div className={cn('min-w-0', hero && 'sm:flex-1')}>
        <div className="flex items-center gap-2 font-mono text-[12px] text-m-ink/56">
          <IconTile icon={icon} size="sm" />
          {eyebrow}
        </div>
        <p className="mt-3 max-w-[520px] text-[18px] leading-snug tracking-tight sm:text-[20px]">
          <span className="font-medium text-m-ink">{lead}</span> <span className="text-m-ink/64">{body}</span>
        </p>
        {href && linkLabel && (
          <Link
            href={href}
            className="group mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-violet transition-colors duration-150 ease-out hover:text-violet-hover"
          >
            {linkLabel}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}
      </div>
      {children && <div className={cn('mt-auto min-w-0 pt-6', hero && 'sm:w-1/2 sm:shrink-0 sm:pt-0')}>{children}</div>}
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
