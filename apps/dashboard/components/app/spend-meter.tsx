'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface UsageSummary {
  monthToDateUsd: number;
  budgetUsd: number | null;
}

/**
 * Estimated provider spend, month to date, thin violet bar against a
 * user-set budget when one exists (WEBSITE.md §7.1). Fetches
 * GET /api/app/usage/summary; renders zeros if the request fails so the
 * shell never breaks on a transient error.
 */
export function SpendMeter({ collapsed }: { collapsed: boolean }) {
  const [summary, setSummary] = React.useState<UsageSummary>({ monthToDateUsd: 0, budgetUsd: null });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/app/usage/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSummary({
          monthToDateUsd: typeof data.monthToDateUsd === 'number' ? data.monthToDateUsd : 0,
          budgetUsd: typeof data.budgetUsd === 'number' ? data.budgetUsd : null,
        });
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const pct = summary.budgetUsd ? Math.min(100, (summary.monthToDateUsd / summary.budgetUsd) * 100) : 0;

  if (collapsed) {
    return (
      <div className="flex justify-center px-2 py-2" title={`$${summary.monthToDateUsd.toFixed(2)} est. · month to date`}>
        <div className="h-1 w-6 rounded-pill bg-muted">
          {summary.budgetUsd !== null && <div className="h-1 rounded-pill bg-primary" style={{ width: `${pct}%` }} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-2">
      <div className={cn('font-mono text-xs text-muted-foreground', loading && 'animate-pulse')}>
        <span className="text-foreground">${summary.monthToDateUsd.toFixed(2)}</span> est. · month to date
      </div>
      {summary.budgetUsd !== null && (
        <div className="h-1 w-full overflow-hidden rounded-pill bg-muted">
          <div className="h-full rounded-pill bg-primary transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
