import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { endpointById } from '@/lib/catalog';
import type { Endpoint } from '@/lib/endpoints';
import { cn } from '@/lib/utils';
import { IconTile } from './icon-tile';

export interface EndpointCardItem {
  id: Endpoint;
  /** One or two lines. The catalog tagline is written for rows, not centred cells. */
  blurb: string;
  fresh?: boolean;
}

export interface EndpointCardsProps {
  items: readonly EndpointCardItem[];
  className?: string;
}

/**
 * One hairline row of endpoint cells: centred tile, name, a two-line blurb and
 * a "Learn more" line. The whole cell is the link. Four across at lg, two at
 * sm, stacked below. The parent needs no `data-reveal-group`; the row is one.
 */
export function EndpointCards({ items, className }: EndpointCardsProps) {
  return (
    <div
      data-reveal-group
      className={cn(
        'grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => {
        const def = endpointById(item.id);
        if (!def) return null;
        return (
          <Link
            key={def.id}
            href={def.route}
            data-reveal-item
            className={cn(
              'group flex min-w-0 flex-col items-center border-m-border-faint px-6 py-8 text-center transition-colors duration-200 ease-out hover:bg-m-ink/[0.031]',
              'focus-visible:bg-m-ink/[0.031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet/40',
              'border-b last:border-b-0 sm:[&:nth-child(2n+1)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0',
            )}
          >
            <IconTile icon={def.icon} size="lg" />
            <span className="mt-4 flex items-center gap-2 text-[16px] font-medium leading-tight tracking-tight text-m-ink">
              {def.name}
              {item.fresh && (
                <span className="rounded-pill bg-violet-12 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-violet">New</span>
              )}
            </span>
            <span className="mt-2 max-w-[240px] text-[14px] leading-relaxed text-m-ink/64">{item.blurb}</span>
            <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-violet transition-colors duration-150 ease-out group-hover:text-violet-hover">
              Learn more
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
