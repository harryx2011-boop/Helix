import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconTile } from './icon-tile';

export interface LedgerRow {
  icon: LucideIcon;
  lead: string;
  body: string;
  /** Mono proof on the right: a header, an env line, a JSON fragment. */
  evidence?: string;
}

export interface LedgerProps {
  rows: LedgerRow[];
  className?: string;
}

/**
 * Hairline proof list: one claim per row, its evidence on the right. The
 * wrapper carries `data-reveal-group`, so it must not be nested in another.
 */
export function Ledger({ rows, className }: LedgerProps) {
  return (
    <div
      data-reveal-group
      className={cn('overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm', className)}
    >
      {rows.map((row) => (
        <div
          key={row.lead}
          data-reveal-item
          className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-b border-m-border-faint p-5 transition-colors duration-200 ease-out last:border-b-0 hover:bg-m-ink/[0.031] sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-center sm:px-6"
        >
          <IconTile icon={row.icon} />
          <p className="min-w-0 text-[15px] leading-relaxed">
            <span className="font-medium text-m-ink">{row.lead}</span>{' '}
            <span className="text-m-ink/64">{row.body}</span>
          </p>
          {row.evidence && (
            <div className="col-span-2 min-w-0 overflow-x-auto rounded-card bg-m-bg px-3 py-1.5 sm:col-span-1 sm:max-w-[320px]">
              <span className="whitespace-pre font-mono text-[12px] text-m-ink/48">{row.evidence}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
