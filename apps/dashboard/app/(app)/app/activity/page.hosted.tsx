import Link from 'next/link';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { Endpoint, RunRow, RunStatus } from '@/lib/supabase/types';
import { endpointById } from '@/lib/catalog';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/app/status-badge';
import { ActivityFilters } from '@/components/app/activity-filters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface ActivityPageProps {
  searchParams: Promise<{ endpoint?: string; status?: string; from?: string; to?: string; cursor?: string }>;
}

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const profile = await requireProfile();
  const params = await searchParams;

  let runs: RunRow[] = [];
  let nextCursor: string | null = null;

  if (supabaseConfigured()) {
    let query = supabaseAdmin()
      .from('runs')
      .select('*')
      .eq('profile_id', profile.id)
      .order('started_at', { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (params.endpoint) query = query.eq('endpoint', params.endpoint as Endpoint);
    if (params.status) query = query.eq('status', params.status as RunStatus);
    if (params.from) query = query.gte('started_at', params.from);
    if (params.to) query = query.lte('started_at', params.to);
    if (params.cursor) query = query.lt('started_at', params.cursor);

    const { data } = await query;
    const rows = (data as RunRow[]) ?? [];
    const hasMore = rows.length > PAGE_SIZE;
    runs = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    nextCursor = hasMore ? runs[runs.length - 1]?.started_at ?? null : null;
  }

  const nextParams = new URLSearchParams();
  if (params.endpoint) nextParams.set('endpoint', params.endpoint);
  if (params.status) nextParams.set('status', params.status);
  if (params.from) nextParams.set('from', params.from);
  if (params.to) nextParams.set('to', params.to);
  if (nextCursor) nextParams.set('cursor', nextCursor);

  return (
    <div className="relative flex flex-col gap-6 bg-background p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold leading-tight">Activity Logs</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">Every request made against your keys.</p>
      </div>

      <ActivityFilters
        endpoint={params.endpoint}
        status={params.status}
        from={params.from}
        to={params.to}
      />

      <Card>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <p className="text-sm text-muted-foreground">No runs match these filters yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Est. cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const def = endpointById(run.endpoint);
                  const Icon = def?.icon;
                  return (
                    <TableRow key={run.id} className="cursor-pointer">
                      <TableCell>
                        <Link href={`/app/activity/${run.id}`} className="flex items-center gap-2 font-mono text-sm">
                          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                          {def?.name ?? run.endpoint}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatRelativeTime(run.started_at)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {run.duration_ms !== null ? formatDuration(run.duration_ms) : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {run.tier_resolved ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        ${Number(run.est_provider_cost_usd).toFixed(4)}
                        <span className="ml-1 text-muted-foreground">est.</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {nextCursor && (
        <Link
          href={`/app/activity?${nextParams.toString()}`}
          className="self-center font-mono text-xs uppercase tracking-wide text-primary hover:underline"
        >
          Load older runs
        </Link>
      )}
    </div>
  );
}
