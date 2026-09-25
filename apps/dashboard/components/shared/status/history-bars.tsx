'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ServiceHistory } from '@/lib/status';

const BAR_COUNT = 90;

function barTone(okPct: number | null, emptyClassName: string): string {
  if (okPct === null) return emptyClassName;
  if (okPct >= 99) return 'bg-success';
  if (okPct >= 95) return 'bg-warning';
  return 'bg-destructive';
}

/**
 * One bar per day over the last 90. The status tokens are shared by both
 * surfaces; only the "no data" bar differs, because the marketing ink tokens
 * paint nothing on the dark app surface.
 */
export function HistoryBars({
  days,
  reduced,
  emptyClassName = 'bg-m-ink/12',
}: {
  days: ServiceHistory['days'];
  reduced: boolean;
  emptyClassName?: string;
}) {
  const [grown, setGrown] = React.useState(reduced);

  React.useEffect(() => {
    if (reduced) return;
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  const padded: (ServiceHistory['days'][number] | undefined)[] =
    days.length >= BAR_COUNT ? days.slice(-BAR_COUNT) : [...Array(BAR_COUNT - days.length).fill(undefined), ...days];

  return (
    <div className="flex h-8 min-w-0 flex-1 items-end gap-[2px]" role="img" aria-label="90-day uptime history">
      {padded.map((bucket, i) => (
        <div
          key={bucket?.day ?? `pad-${i}`}
          title={bucket ? `${bucket.day}: ${bucket.okPct === null ? 'no data' : `${bucket.okPct.toFixed(1)}%`}` : undefined}
          className={cn(
            'min-w-[2px] flex-1 rounded-[1px] transition-[height] duration-300 ease-out motion-reduce:transition-none',
            barTone(bucket?.okPct ?? null, emptyClassName),
          )}
          style={{ height: grown ? '100%' : '10%' }}
        />
      ))}
    </div>
  );
}
