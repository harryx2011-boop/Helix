'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { endpointById } from '@/lib/catalog';
import type { RunRow } from '@/lib/supabase/types';

const RECENT_LIMIT = 6;

const STATUS_VARIANT: Record<RunRow['status'], 'success' | 'destructive' | 'secondary' | 'outline'> = {
  success: 'success',
  failure: 'destructive',
  running: 'secondary',
  cancelled: 'outline',
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

  if (failed || runs?.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Recent Runs</h2>
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Recent Runs</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {runs === undefined
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)
          : runs.map((run) => {
              const def = endpointById(run.endpoint);
              return (
                <Link
                  key={run.id}
                  href={`/app/activity/${run.id}`}
                  className="flex flex-col gap-1.5 rounded-card border border-border bg-card p-3 transition-colors duration-150 ease-out hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{def?.name ?? run.endpoint}</span>
                    <Badge variant={STATUS_VARIANT[run.status]} className="font-mono text-[10px]">
                      {run.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                    <span>{relativeTime(run.started_at)}</span>
                    {run.formats.length > 0 && <span>{run.formats.join(', ')}</span>}
                    <span>${Number(run.est_provider_cost_usd).toFixed(4)}</span>
                  </div>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
