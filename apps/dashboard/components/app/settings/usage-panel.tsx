'use client';

import * as React from 'react';
import { FrameRow, FrameHeading, FrameCells } from '@/components/app/page-frame';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AccountError, getUsage, type Usage, type UsageKey } from '@/lib/account';

/**
 * Requests over time, the per-endpoint split, and the keys that made them.
 *
 * Every figure here is a stored count from `request_usage`. Nothing is
 * estimated or interpolated: an hour with no rows is drawn as zero because
 * zero is what was recorded, and when the table is missing entirely the panel
 * says so instead of rendering an empty chart that reads as "no traffic".
 */

const RANGES = [
  { hours: 24, label: '24 hours' },
  { hours: 24 * 7, label: '7 days' },
  { hours: 24 * 30, label: '30 days' },
] as const;

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Fills the gaps between recorded hours with explicit zeroes.
 *
 * Plotting only the hours that have rows would draw a continuous line across a
 * quiet weekend and make it look like steady traffic. The zeroes are real: the
 * absence of a bucket means no requests, not unknown.
 */
function densify(series: { bucketStart: string; requests: number }[], since: string, until: string, cap = 720) {
  const start = new Date(since).getTime();
  const end = new Date(until).getTime();
  const hour = 60 * 60 * 1000;
  const buckets = Math.min(Math.ceil((end - start) / hour), cap);
  if (buckets <= 0) return [];

  const found = new Map(series.map((p) => [new Date(p.bucketStart).setMinutes(0, 0, 0), p.requests]));
  const out: { at: number; requests: number }[] = [];
  const firstBucket = new Date(end - buckets * hour).setMinutes(0, 0, 0);
  for (let i = 0; i < buckets; i++) {
    const at = firstBucket + i * hour;
    out.push({ at, requests: found.get(at) ?? 0 });
  }
  return out;
}

/** Bars, not a line: hourly counts are discrete events, and a smoothed curve would imply values between hours that were never measured. */
function Chart({ points }: { points: { at: number; requests: number }[] }) {
  const peak = points.reduce((max, p) => Math.max(max, p.requests), 0);

  if (peak === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-card border border-dashed border-border">
        <p className="text-[13px] text-muted-foreground">No requests in this window.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-32 items-end gap-px" role="img" aria-label={`Requests per hour, peak ${peak}`}>
        {points.map((point) => (
          <div
            key={point.at}
            className="min-w-px flex-1 bg-primary/70"
            style={{ height: `${Math.max((point.requests / peak) * 100, point.requests > 0 ? 2 : 0)}%` }}
            title={`${new Date(point.at).toLocaleString()} — ${point.requests}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>{points[0] ? new Date(points[0].at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
        <span>peak {peak}/h</span>
        <span>now</span>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-6 py-5">
      <p className="text-[13px] leading-snug text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-mono text-[22px] leading-none text-foreground">{value}</p>
      {hint && <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function KeyRow({ apiKey, last }: { apiKey: UsageKey; last: boolean }) {
  const revoked = apiKey.revokedAt !== null;
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4 px-6 py-4', !last && 'border-b border-border')}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-foreground">{apiKey.name}</span>
          {revoked && <Badge variant="outline">Revoked</Badge>}
        </div>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{apiKey.keyPrefix}…</p>
      </div>
      <div className="text-right">
        <p className="text-[13px] text-foreground">{formatRelative(apiKey.lastUsedAt)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{apiKey.rateLimit.toLocaleString()} req/min limit</p>
      </div>
    </div>
  );
}

export function UsagePanel() {
  const [hours, setHours] = React.useState<number>(24 * 7);
  const [usage, setUsage] = React.useState<Usage | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [unavailable, setUnavailable] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(null);
    getUsage(hours)
      .then((next) => {
        if (!cancelled) setUsage(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setUsage(null);
        // A 503 here means the instance has no usage table, which is an
        // operator state rather than an error the reader caused. Both cases
        // land in the same place: say what is missing, show no numbers.
        setUnavailable(err instanceof AccountError ? err.message : 'Could not load usage.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hours]);

  const ranges = (
    <div className="flex gap-1">
      {RANGES.map((range) => (
        <button
          key={range.hours}
          type="button"
          onClick={() => setHours(range.hours)}
          aria-pressed={hours === range.hours}
          className={cn(
            'rounded-pill px-3 py-1 text-[13px] transition-colors duration-150 ease-out',
            hours === range.hours
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <FrameRow>
        <FrameHeading
          id="usage"
          title="Usage and API Keys"
          description="How much you have used Helix, and when each of your keys was last used."
          action={ranges}
        />
      </FrameRow>

      {loading && (
        <FrameRow flush className="flex flex-col gap-3 p-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-16 w-full" />
        </FrameRow>
      )}

      {!loading && unavailable && (
        <FrameRow flush className="px-6 py-5">
          <p className="max-w-[60ch] text-[13px] leading-snug text-muted-foreground">
            Usage is unavailable. {unavailable}
          </p>
        </FrameRow>
      )}

      {!loading && !unavailable && usage && (
        <>
          <FrameRow>
            <div className="px-6 py-5">
              <Chart points={densify(usage.series, usage.since, usage.until)} />
            </div>
          </FrameRow>

          <FrameRow>
            <FrameCells cols={3}>
              <Metric label="Requests" value={usage.total.toLocaleString()} hint="In the selected window." />
              <Metric
                label="Rate limited"
                value={usage.rateLimited.toLocaleString()}
                hint={
                  usage.rateLimited > 0
                    ? 'Requests refused for exceeding a key limit.'
                    : 'No request hit a limit in this window.'
                }
              />
              <Metric
                label="Errors"
                value={usage.errors.toLocaleString()}
                hint="Responses in the 4xx and 5xx range."
              />
            </FrameCells>
          </FrameRow>

          <FrameRow>
            <FrameHeading
              id="usage-endpoints"
              title="By Tool"
              description="Which parts of Helix your keys actually call."
            />
          </FrameRow>
          <FrameRow>
            {usage.byEndpoint.length === 0 ? (
              <p className="px-6 py-5 text-[13px] text-muted-foreground">Nothing recorded in this window.</p>
            ) : (
              <div className="divide-y divide-border">
                {usage.byEndpoint.map((row) => {
                  const share = usage.total > 0 ? (row.requests / usage.total) * 100 : 0;
                  return (
                    <div key={row.endpoint} className="flex items-center gap-4 px-6 py-3">
                      <span className="w-40 shrink-0 truncate font-mono text-[13px] text-foreground">
                        {row.endpoint}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${share}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right font-mono text-[13px] text-muted-foreground">
                        {row.requests.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </FrameRow>

          <FrameRow>
            <FrameHeading
              id="usage-keys"
              title="Your API Keys"
              description="Rate limits are enforced per key, per minute."
            />
          </FrameRow>
          <FrameRow flush>
            {usage.keys.length === 0 ? (
              <p className="px-6 py-5 text-[13px] text-muted-foreground">You have no keys yet.</p>
            ) : (
              usage.keys.map((apiKey, index) => (
                <KeyRow key={apiKey.id} apiKey={apiKey} last={index === usage.keys.length - 1} />
              ))
            )}
          </FrameRow>
        </>
      )}
    </>
  );
}
