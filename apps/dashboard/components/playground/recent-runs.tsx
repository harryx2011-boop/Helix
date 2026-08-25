'use client';

import * as React from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { endpointById } from '@/lib/catalog';
import type { RunRow } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';

const RECENT_LIMIT = 6;

const STATUS_LABEL: Record<RunRow['status'], string> = {
  success: 'SUCCESS',
  failure: 'FAILURE',
  running: 'RUNNING',
  cancelled: 'CANCELLED',
};

const STATUS_CLASS: Record<RunRow['status'], string> = {
  success: 'text-success',
  failure: 'text-destructive',
  running: 'text-primary',
  cancelled: 'text-muted-foreground',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-1.5 first:border-t-0">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-[11px] text-foreground">{value}</span>
    </div>
  );
}

export function RecentRuns() {
  const [runs, setRuns] = React.useState<RunRow[] | undefined>(undefined);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/app/runs')
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.json() as Promise<{ runs: RunRow[] }>;
      })
      .then((data) => {
        if (!cancelled) setRuns(data.runs.slice(0, RECENT_LIMIT));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const empty = failed || runs?.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 border-b border-border pb-1.5">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Recent Runs</h2>
      </div>

      {empty && <p className="text-sm text-muted-foreground">Run a request above and it will show up here.</p>}

      {!empty && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {runs === undefined
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-card" />)
            : runs.map((run) => {
                const def = endpointById(run.endpoint);
                const Icon = def?.icon;
                return (
                  <Link
                    key={run.id}
                    href={`/app/activity/${run.id}`}
                    className="flex flex-col overflow-hidden rounded-card border border-border bg-card transition-colors duration-150 ease-out hover:bg-accent"
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                        {def?.name ?? run.endpoint}
                      </span>
                      <span className={cn('font-mono text-[11px]', STATUS_CLASS[run.status])}>
                        [ {STATUS_LABEL[run.status]} ]
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <Row label="Endpoint" value={def?.sidebarLabel ?? run.endpoint} />
                      <Row label="Status" value={run.status} />
                      <Row label="Started" value={relativeTime(run.started_at)} />
                      <Row label="Formats" value={run.formats.length > 0 ? run.formats.join(', ') : '—'} />
                      <Row label="Est. provider cost" value={`$${Number(run.est_provider_cost_usd).toFixed(4)}`} />
                    </div>
                  </Link>
                );
              })}
        </div>
      )}
    </div>
  );
}
