import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { RunRow } from '@/lib/supabase/types';
import type { Tier } from '@/lib/api';
import { endpointById } from '@/lib/catalog';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/app/status-badge';
import { FetchLadder } from '@/components/ladder/fetch-ladder';
import { JsonView } from '@/components/result/json-view';

export const dynamic = 'force-dynamic';

interface RunDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const profile = await requireProfile();
  const { id } = await params;

  if (!supabaseConfigured()) notFound();

  const { data } = await supabaseAdmin().from('runs').select('*').eq('profile_id', profile.id).eq('id', id).maybeSingle();
  const run = data as RunRow | null;
  if (!run) notFound();

  const def = endpointById(run.endpoint);
  const Icon = def?.icon;
  const tier = run.tier_resolved as Tier | null;

  return (
    <div className="relative flex flex-col gap-6 bg-background p-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/app/activity"
          className="flex w-fit items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Activity Logs
        </Link>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
          <h1 className="text-xl font-semibold leading-tight">{def?.name ?? run.endpoint}</h1>
          <StatusBadge status={run.status} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
          <span>Started {formatRelativeTime(run.started_at)}</span>
          <span>Duration {run.duration_ms !== null ? formatDuration(run.duration_ms) : '—'}</span>
          <span>Est. cost ${Number(run.est_provider_cost_usd).toFixed(4)} est.</span>
          {run.job_id && <span>Job {run.job_id}</span>}
        </div>
      </div>

      {tier && (
        <Card>
          <CardHeader>
            <CardTitle>Fetch ladder walked</CardTitle>
          </CardHeader>
          <CardContent>
            <FetchLadder tiersAttempted={[tier]} resolvedTier={run.status === 'success' ? tier : undefined} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cost breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Tokens in</dt>
              <dd>{run.tokens_in ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Tokens out</dt>
              <dd>{run.tokens_out ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Provider</dt>
              <dd>{run.provider ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Model</dt>
              <dd>{run.model ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {run.failure_reason && (
        <Card>
          <CardHeader>
            <CardTitle>Failure reason</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-sm uppercase tracking-wide text-destructive">{run.failure_reason}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Request</CardTitle>
        </CardHeader>
        <CardContent>
          {run.request ? <JsonView data={run.request} /> : <p className="text-sm text-muted-foreground">No request body stored.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response</CardTitle>
        </CardHeader>
        <CardContent>
          {run.response_ref ? (
            <p className="font-mono text-xs text-muted-foreground">Stored at {run.response_ref}</p>
          ) : (
            <p className="text-sm text-muted-foreground">not stored</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
