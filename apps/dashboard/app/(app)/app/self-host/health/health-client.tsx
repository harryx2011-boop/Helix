'use client';

import * as React from 'react';
import { CircleAlert, CircleCheck, CircleDashed, CircleX, RotateCw } from 'lucide-react';
import { PageFrame, FrameRow, FrameHeading, FrameCells, FrameTag } from '@/components/app/page-frame';
import { PROVIDER_META, ProviderIcon } from '@/components/app/providers/provider-row';
import { AsciiOrbit } from '@/components/shared/ascii-fields';
import { useReducedMotion } from '@/components/shared/ambient';
import { HistoryBars } from '@/components/shared/status/history-bars';
import {
  averageUptime,
  collectIncidents,
  indexHistory,
  orderServices,
  useHealthPolling,
  useHistory,
} from '@/components/shared/status/status-data';
import { useOptionalApiKey } from '@/components/shell/api-key-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { UsageEndpoint } from '@/lib/account';
import { HelixApiError, resolveBaseUrl } from '@/lib/api';
import type { HealthProviders, HealthService, HealthStatus } from '@/lib/api';
import { RUNNABLE } from '@/lib/catalog';
import { listProviders } from '@/lib/providers';
import type { ProviderId, ProviderStatus } from '@/lib/providers';
import { serviceLabel } from '@/lib/status';
import type { ServiceHistory } from '@/lib/status';
import {
  DEPENDENCY_LABEL,
  dependenciesOf,
  deriveUtilities,
  endpointFamily,
  measuredUptime,
  padDays,
  successRate,
} from '@/lib/utility-health';
import type { DependencyId, UtilityRow as UtilityRowData, UtilityState } from '@/lib/utility-health';
import { cn } from '@/lib/utils';

const STATUS_META: Record<
  HealthStatus,
  { label: string; dot: string; text: string; badge: 'success' | 'warning' | 'destructive'; Icon: typeof CircleCheck }
> = {
  ok: { label: 'Operational', dot: 'bg-success', text: 'text-success', badge: 'success', Icon: CircleCheck },
  degraded: { label: 'Degraded', dot: 'bg-warning', text: 'text-warning', badge: 'warning', Icon: CircleAlert },
  unhealthy: { label: 'Down', dot: 'bg-destructive', text: 'text-destructive', badge: 'destructive', Icon: CircleX },
};

/**
 * Ready is a hollow ring rather than a filled dot: its dependencies are up but
 * no request has proven the route, and a filled green would claim it had.
 */
const UTILITY_META: Record<
  UtilityState,
  { label: string; dot: string; text: string; badge: 'success' | 'warning' | 'destructive' | 'secondary'; Icon: typeof CircleCheck; rank: number }
> = {
  working: { label: 'Working', dot: 'bg-success', text: 'text-success', badge: 'success', Icon: CircleCheck, rank: 0 },
  ready: { label: 'Ready', dot: 'border border-success bg-transparent', text: 'text-success', badge: 'success', Icon: CircleDashed, rank: 1 },
  not_configured: { label: 'Not configured', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground', badge: 'secondary', Icon: CircleDashed, rank: 2 },
  unverified: { label: 'Unverified', dot: 'border border-muted-foreground/50 bg-transparent', text: 'text-muted-foreground', badge: 'secondary', Icon: CircleDashed, rank: 3 },
  degraded: { label: 'Degraded', dot: 'bg-warning', text: 'text-warning', badge: 'warning', Icon: CircleAlert, rank: 4 },
  down: { label: 'Down', dot: 'bg-destructive', text: 'text-destructive', badge: 'destructive', Icon: CircleX, rank: 5 },
};

const EMPTY_BAR = 'bg-muted-foreground/20';

function formatChecked(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

/** The API this build was pointed at, resolved after hydration because it reads `window.location`. */
function useInstanceBase(): { baseUrl: string | null; hydrated: boolean } {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  return { baseUrl: hydrated ? resolveBaseUrl() : null, hydrated };
}

type OutcomesState =
  | { kind: 'loading' }
  | { kind: 'ready'; endpoints: UsageEndpoint[]; since: string }
  | { kind: 'unavailable'; message: string };

const SELF_HOST_NO_OUTCOMES =
  'This build is a static export with no usage route, and the instance’s /v1/usage reports errors in total rather than per tool.';

/** Per-tool outcomes came from the hosted dashboard's usage route, which left with hosted mode. */
function useOutcomes(enabled: boolean): OutcomesState {
  const [state, setState] = React.useState<OutcomesState>({ kind: 'loading' });

  React.useEffect(() => {
    if (enabled) setState({ kind: 'unavailable', message: SELF_HOST_NO_OUTCOMES });
  }, [enabled]);

  return state;
}

function Stat({ value, label, tone = 'text-foreground' }: { value: string; label: string; tone?: string }) {
  return (
    <div className="min-w-[7.5rem]">
      <p className={cn('font-mono text-[15px] leading-none tabular-nums', tone)}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="min-w-[7.5rem]">
      <Skeleton className="h-[15px] w-14" />
      <Skeleton className="mt-1.5 h-[11px] w-24" />
    </div>
  );
}

function UtilityStats({ row, outcomes }: { row: UtilityRowData; outcomes: OutcomesState }) {
  if (outcomes.kind === 'loading') {
    return (
      <>
        <StatSkeleton />
        <StatSkeleton />
      </>
    );
  }
  if (outcomes.kind === 'unavailable' || !row.outcomes) {
    return (
      <>
        <Stat value="—" label="Success, 7 days" tone="text-muted-foreground" />
        <Stat value="—" label="Uptime, 90 days" tone="text-muted-foreground" />
      </>
    );
  }

  const o = row.outcomes;

  if (row.state === 'not_configured') {
    // Every call answers 503 until a backend is set; counting those as failures
    // would report an outage that is really an unset variable.
    return (
      <>
        <Stat
          value="n/a"
          label={o.recent.requests > 0 ? `${o.recent.requests.toLocaleString()} calls answered 503 by design` : 'No requests in 7 days'}
          tone="text-muted-foreground"
        />
        <Stat value="n/a" label="Not measured while unconfigured" tone="text-muted-foreground" />
      </>
    );
  }

  const rate = successRate(o);
  const uptime = measuredUptime(o);
  const answered = o.recent.ok + o.recent.failed;
  const extras = [
    o.recent.clientErrors > 0 ? `${o.recent.clientErrors.toLocaleString()} client errors` : null,
    o.recent.rateLimited > 0 ? `${o.recent.rateLimited.toLocaleString()} rate limited` : null,
  ].filter(Boolean);

  return (
    <>
      {rate === null ? (
        <Stat
          value="No requests"
          label={extras.length > 0 ? `In 7 days: ${extras.join(', ')}` : 'In the last 7 days'}
          tone="text-muted-foreground"
        />
      ) : (
        <Stat
          value={`${rate.toFixed(rate === 100 ? 0 : 1)}%`}
          label={[`${answered.toLocaleString()} answered, ${o.recent.failed.toLocaleString()} failed`, ...extras].join(', ')}
          tone={rate === 100 ? 'text-foreground' : o.recent.failed > 0 && o.recent.ok === 0 ? 'text-destructive' : 'text-warning'}
        />
      )}
      {uptime === null ? (
        <Stat value="No requests" label="In the last 90 days" tone="text-muted-foreground" />
      ) : (
        <Stat
          value={`${uptime.toFixed(uptime === 100 ? 0 : 2)}%`}
          label={`${o.badHours.toLocaleString()} bad of ${o.observedHours.toLocaleString()} observed hours`}
          tone={uptime === 100 ? 'text-foreground' : uptime >= 95 ? 'text-warning' : 'text-destructive'}
        />
      )}
    </>
  );
}

function UtilityRow({ row, outcomes, reduced }: { row: UtilityRowData; outcomes: OutcomesState; reduced: boolean }) {
  const meta = UTILITY_META[row.state];
  const Icon = row.def.icon;
  const bars = row.outcomes && row.state !== 'not_configured' ? padDays(row.outcomes.days) : null;

  return (
    <FrameRow className="px-6 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full transition-colors duration-150 ease-out', meta.dot)} />
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            <span className="text-[14px] font-medium text-foreground">{row.def.name}</span>
            <span className={cn('font-mono text-[11px] uppercase tracking-wide', meta.text)}>{meta.label}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{endpointFamily(row.def)}</span>
          </div>
          {row.reasons.map((reason) => (
            <p key={reason} className={cn('mt-1.5 pl-[18px] text-[12px] leading-snug', meta.text)}>
              {reason}
            </p>
          ))}
          {row.note && <p className="mt-1.5 pl-[18px] text-[12px] leading-snug text-muted-foreground">{row.note}</p>}
        </div>
        <div className="flex shrink-0 gap-6 pl-[18px] md:pl-0">
          <UtilityStats row={row} outcomes={outcomes} />
        </div>
      </div>
      {bars && (
        <div className="mt-3 pl-[18px]">
          <HistoryBars days={bars} reduced={reduced} emptyClassName={EMPTY_BAR} />
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground/70">
            <span>90 days ago</span>
            <span>measured from request outcomes</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </FrameRow>
  );
}

function UtilityRowSkeleton() {
  return (
    <FrameRow className="flex flex-col gap-3 px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <div className="flex gap-6">
          <StatSkeleton />
          <StatSkeleton />
        </div>
      </div>
      <Skeleton className="h-8 w-full" />
    </FrameRow>
  );
}

/** Which tools stand on a dependency, so a red row here reads as the cause of a red row above. */
const NEEDED_BY: Record<DependencyId, { hard: string[]; soft: string[] }> = (() => {
  const out: Record<DependencyId, { hard: string[]; soft: string[] }> = {
    postgres: { hard: [], soft: [] },
    fetch: { hard: [], soft: [] },
    extract: { hard: [], soft: [] },
    browser: { hard: [], soft: [] },
  };
  for (const def of RUNNABLE) {
    const deps = dependenciesOf(def.id);
    for (const dep of deps.hard) out[dep].hard.push(def.name);
    for (const dep of deps.soft) out[dep].soft.push(def.name);
  }
  return out;
})();

function isDependencyId(service: string): service is DependencyId {
  return service in DEPENDENCY_LABEL;
}

function ServiceRow({
  service,
  status,
  history,
  reduced,
  flush,
}: {
  service: string;
  status: HealthService | undefined;
  history: ServiceHistory | undefined;
  reduced: boolean;
  flush: boolean;
}) {
  const meta = status ? STATUS_META[status.status] : null;
  const uptime = averageUptime(history);
  const neededBy = isDependencyId(service) ? NEEDED_BY[service] : null;

  return (
    <FrameRow flush={flush} className="px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              'h-2 w-2 shrink-0 rounded-full transition-colors duration-150 ease-out',
              meta ? meta.dot : 'bg-muted-foreground/30',
            )}
          />
          <span className="truncate text-[14px] font-medium text-foreground">{serviceLabel(service)}</span>
          {status && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{status.latencyMs}ms</span>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {uptime === null ? '—' : `${uptime.toFixed(2)}%`}
          </span>
          <span className={cn('font-mono text-[11px] uppercase tracking-wide', meta ? meta.text : 'text-muted-foreground')}>
            {meta ? meta.label : 'No check'}
          </span>
        </div>
      </div>
      {status?.detail && (
        <p className={cn('mt-1.5 pl-[18px] font-mono text-[12px]', status.status === 'ok' ? 'text-muted-foreground' : meta?.text)}>
          {status.detail}
        </p>
      )}
      {neededBy && (neededBy.hard.length > 0 || neededBy.soft.length > 0) && (
        <p className="mt-1.5 pl-[18px] text-[12px] leading-snug text-muted-foreground">
          {neededBy.hard.length > 0 && `Needed by ${neededBy.hard.join(', ')}`}
          {neededBy.hard.length > 0 && neededBy.soft.length > 0 && '; '}
          {neededBy.soft.length > 0 && `${neededBy.hard.length > 0 ? 'o' : 'O'}ptional for ${neededBy.soft.join(', ')}`}
          .
        </p>
      )}
      {history && (
        <div className="mt-3">
          <HistoryBars days={history.days} reduced={reduced} emptyClassName={EMPTY_BAR} />
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground/70">
            <span>90 days ago</span>
            <span>sampled every minute</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </FrameRow>
  );
}

function ServiceRowSkeleton({ flush }: { flush: boolean }) {
  return (
    <FrameRow flush={flush} className="flex flex-col gap-3 px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="h-8 w-full" />
    </FrameRow>
  );
}

function instanceProviderLine(configured: boolean, model?: string): { text: string; className: string } {
  if (!configured) return { text: 'Not configured', className: 'text-muted-foreground' };
  if (!model) return { text: 'Configured', className: 'font-mono text-success' };
  return { text: model === 'unset' ? 'Configured · no model set' : `Configured · ${model}`, className: 'font-mono text-success' };
}

function InstanceProviderCell({ name, configured, model }: { name: string; configured: boolean; model?: string }) {
  const line = instanceProviderLine(configured, model);
  return (
    <div className="flex flex-col gap-0.5 px-6 py-4">
      <span className="text-[13px] font-medium text-foreground">{name}</span>
      <span className={cn('truncate text-xs', line.className)}>{line.text}</span>
    </div>
  );
}

function InstanceProviders({ providers }: { providers: HealthProviders }) {
  return (
    <FrameRow>
      <FrameCells cols={4}>
        <InstanceProviderCell name="LLM" configured={providers.llm.configured} model={providers.llm.model} />
        <InstanceProviderCell name="Embedding" configured={providers.embedding.configured} model={providers.embedding.model} />
        <InstanceProviderCell name="Proxy" configured={providers.proxy.configured} />
        <InstanceProviderCell name="Search" configured={providers.search.configured} />
      </FrameCells>
    </FrameRow>
  );
}

function keyProviderLine(status: ProviderStatus): { text: string; className: string } {
  if (status.source === 'key') return { text: 'Connected with your key', className: 'font-mono text-success' };
  if (status.source === 'instance') return { text: "Using the instance's key", className: 'text-muted-foreground' };
  return { text: 'Not connected', className: 'text-muted-foreground' };
}

function KeyProviderRows({ apiKey, flushLast }: { apiKey: string | null; flushLast: boolean }) {
  const [statuses, setStatuses] = React.useState<Record<ProviderId, ProviderStatus> | null>(null);
  const [loading, setLoading] = React.useState(Boolean(apiKey));
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listProviders(apiKey);
      const next = Object.fromEntries(
        PROVIDER_META.map((m) => [m.id, { provider: m.id, configured: false, source: 'none' } satisfies ProviderStatus]),
      ) as Record<ProviderId, ProviderStatus>;
      for (const status of result.providers) next[status.provider] = status;
      setStatuses(next);
    } catch (err) {
      setError(err instanceof HelixApiError ? err.message : 'Could not load providers.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!apiKey) {
    return (
      <FrameRow flush={flushLast} className="px-6 py-4">
        <p className="max-w-[560px] text-[13px] leading-snug text-muted-foreground">
          This browser holds no instance key, so the providers attached to a key cannot be listed.
        </p>
      </FrameRow>
    );
  }

  if (loading) {
    return (
      <FrameRow flush={flushLast} className="flex flex-col gap-3 px-6 py-4">
        {PROVIDER_META.map((m) => (
          <Skeleton key={m.id} className="h-5 w-full" />
        ))}
      </FrameRow>
    );
  }

  if (error || !statuses) {
    return (
      <FrameRow flush={flushLast} className="flex flex-col items-start gap-3 px-6 py-4">
        <span className="text-sm text-muted-foreground">{error ?? 'Could not load providers.'}</span>
        <Button variant="outline" size="sm" onClick={() => void load()} className="rounded-pill">
          Retry
        </Button>
      </FrameRow>
    );
  }

  return (
    <>
      {PROVIDER_META.map((meta, index) => {
        const status = statuses[meta.id];
        const line = keyProviderLine(status);
        return (
          <FrameRow key={meta.id} flush={flushLast && index === PROVIDER_META.length - 1} className="px-6 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <ProviderIcon meta={meta} />
                <span className="truncate text-[13px] font-medium text-foreground">{meta.name}</span>
                <span className={cn('truncate text-xs', line.className)}>{line.text}</span>
              </div>
              {status.model && <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{status.model}</span>}
            </div>
          </FrameRow>
        );
      })}
    </>
  );
}

/**
 * The headline is about the tools, and it only speaks once the live check has
 * answered. It never says "all working" ahead of the evidence: with outcomes
 * still loading it says so, and with none recorded it says "ready".
 */
function headline(rows: UtilityRowData[]): { title: string; state: UtilityState } {
  const worst = rows.reduce<UtilityState>((acc, row) => (UTILITY_META[row.state].rank > UTILITY_META[acc].rank ? row.state : acc), 'working');
  const count = (state: UtilityState) => rows.filter((r) => r.state === state).length;
  const configured = rows.filter((r) => r.state !== 'not_configured');

  if (worst === 'down') return { title: `${count('down')} of ${rows.length} tools ${count('down') === 1 ? 'is' : 'are'} down`, state: worst };
  if (worst === 'degraded') return { title: `${count('degraded')} of ${rows.length} tools ${count('degraded') === 1 ? 'is' : 'are'} degraded`, state: worst };
  if (worst === 'unverified') return { title: `${count('unverified')} of ${rows.length} tools could not be verified`, state: worst };
  const allWorking = configured.every((r) => r.state === 'working');
  const prefix = worst === 'not_configured' ? 'Every configured tool' : 'Every tool';
  return { title: `${prefix} is ${allWorking ? 'working' : 'ready'}`, state: allWorking ? 'working' : 'ready' };
}

interface MeasuredIncident {
  day: string;
  name: string;
  bad: number;
  observed: number;
}

function collectMeasuredIncidents(rows: UtilityRowData[]): MeasuredIncident[] {
  const out: MeasuredIncident[] = [];
  for (const row of rows) {
    if (!row.outcomes || row.state === 'not_configured') continue;
    for (const day of row.outcomes.days) {
      if (day.okPct !== null && day.okPct < 100) {
        out.push({ day: day.day, name: row.def.name, bad: Math.round(day.samples * (1 - day.okPct / 100)), observed: day.samples });
      }
    }
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : -1));
}

export function HealthClient() {
  const reduced = useReducedMotion();
  const apiKey = useOptionalApiKey()?.apiKey ?? null;
  const { baseUrl, hydrated } = useInstanceBase();
  const [nonce, setNonce] = React.useState(0);
  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  const { health, error, loading, fetching, lastUpdated } = useHealthPolling(baseUrl, nonce);
  const { history, error: historyError } = useHistory(baseUrl, nonce);
  const outcomes = useOutcomes(Boolean(baseUrl));

  const historyByService = React.useMemo(() => indexHistory(history), [history]);
  const services = React.useMemo(() => orderServices(health, historyByService), [health, historyByService]);
  const incidents = React.useMemo(() => collectIncidents(history?.services ?? []), [history]);
  const rows = React.useMemo(
    () => (health ? deriveUtilities(health, outcomes.kind === 'ready' ? outcomes.endpoints : null) : null),
    [health, outcomes],
  );
  const measuredIncidents = React.useMemo(() => (rows ? collectMeasuredIncidents(rows) : []), [rows]);

  let body: React.ReactNode;

  if (!hydrated) {
    body = (
      <>
        <UtilityRowSkeleton />
        <UtilityRowSkeleton />
        <UtilityRowSkeleton />
      </>
    );
  } else if (!loading && error && !health) {
    body = (
      <FrameRow flush>
        <div className="flex flex-col gap-5 px-6 py-10">
          <div className="max-w-[560px]">
            <div className="flex items-center gap-2.5">
              <CircleX className="h-5 w-5 shrink-0 text-destructive" strokeWidth={1.75} aria-hidden />
              <h2 className="text-[17px] font-medium leading-tight tracking-tight text-foreground">Instance unreachable</h2>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              Could not reach <span className="font-mono text-foreground">{baseUrl}</span>.{' '}
              The API is down, or NEXT_PUBLIC_HELIX_API_URL points at the wrong host.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <Button variant="outline" size="sm" onClick={refresh} disabled={fetching} className="w-fit rounded-pill">
              <RotateCw className={cn('h-3.5 w-3.5', fetching && 'animate-spin')} />
              {fetching ? 'Trying…' : 'Try again'}
            </Button>
          </div>
        </div>
      </FrameRow>
    );
  } else {
    const summary = rows ? headline(rows) : null;
    const summaryMeta = summary ? UTILITY_META[summary.state] : null;
    const SummaryIcon = summaryMeta?.Icon ?? CircleDashed;

    body = (
      <>
        <FrameRow>
          <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {summaryMeta ? (
                <SummaryIcon className={cn('h-5 w-5 shrink-0', summaryMeta.text)} strokeWidth={1.75} aria-hidden />
              ) : (
                <Skeleton className="h-5 w-5 rounded-full" />
              )}
              <div className="min-w-0">
                {summary ? (
                  <h2 className="text-[17px] font-medium leading-tight tracking-tight text-foreground">{summary.title}</h2>
                ) : (
                  <Skeleton className="h-[17px] w-48" />
                )}
                <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                  {health ? `Helix ${health.version}` : 'Connecting'}
                  {lastUpdated && ` · checked ${formatChecked(lastUpdated)}`}
                  {health && outcomes.kind === 'loading' && ' · reading request outcomes'}
                  {error && health && (
                    <span className="text-warning"> · the latest check failed, showing the last good result</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {summaryMeta && <Badge variant={summaryMeta.badge}>{summaryMeta.label}</Badge>}
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={fetching || !health}
                className="rounded-pill"
                aria-label="Refresh health"
              >
                <RotateCw className={cn('h-3.5 w-3.5', fetching && 'animate-spin')} />
                {fetching ? 'Checking…' : 'Refresh'}
              </Button>
            </div>
          </div>
        </FrameRow>

        <FrameRow>
          <FrameHeading
            id="tools"
            title="Tools"
            description="One row per tool. The state comes from the live dependency check; the success rate and uptime are measured from requests your keys made, not from probes."
          />
        </FrameRow>
        {rows
          ? rows.map((row) => <UtilityRow key={row.def.id} row={row} outcomes={outcomes} reduced={reduced} />)
          : RUNNABLE.map((def) => <UtilityRowSkeleton key={def.id} />)}
        {outcomes.kind === 'unavailable' && (
          <FrameRow className="px-6 py-3">
            <p className="max-w-[72ch] text-xs leading-snug text-muted-foreground">
              Success rates and measured uptime are unavailable, so the states above rest on the dependency check alone.{' '}
              {outcomes.message}
            </p>
          </FrameRow>
        )}

        <FrameRow>
          <FrameHeading
            id="dependencies"
            title="Dependencies"
            description="What the tools run on. A red row here is why a tool above is down. Each check is timed on its own, and the bars are one-minute probes rather than request outcomes."
          />
        </FrameRow>
        {loading && !health
          ? [0, 1, 2, 3].map((i) => <ServiceRowSkeleton key={i} flush={false} />)
          : services.map((service) => (
              <ServiceRow
                key={service}
                service={service}
                status={health?.services[service]}
                history={historyByService.get(service)}
                reduced={reduced}
                flush={false}
              />
            ))}
        {historyError && (
          <FrameRow className="px-6 py-3">
            <p className="text-xs text-muted-foreground">The 90-day probe history did not load; the rows above show the live check only.</p>
          </FrameRow>
        )}

        <FrameRow>
          <FrameHeading
            id="providers"
            title="Providers"
            description="What the instance's environment configures, then what is attached to your API key. Key material never leaves the server."
          />
        </FrameRow>
        {health ? (
          <InstanceProviders providers={health.providers} />
        ) : (
          <FrameRow className="flex flex-col gap-3 px-6 py-4">
            <Skeleton className="h-5 w-full" />
          </FrameRow>
        )}
        <FrameRow className="px-6 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Your Keys</span>
        </FrameRow>
        <KeyProviderRows apiKey={apiKey} flushLast={false} />

        <FrameRow>
          <FrameHeading
            id="incidents"
            title="Incidents"
            description="Measured: days in the last 90 where a tool answered 5xx in at least one hour. Sampled: days where a dependency's probed uptime fell under 95%."
          />
        </FrameRow>
        <FrameRow className="px-6 py-2.5">
          <FrameTag>Measured</FrameTag>
        </FrameRow>
        {measuredIncidents.length === 0 ? (
          <FrameRow className="px-6 py-4">
            <p className="text-[13px] text-muted-foreground">
              {outcomes.kind === 'loading'
                ? 'Reading request outcomes.'
                : outcomes.kind === 'unavailable'
                  ? 'Request outcomes unavailable.'
                  : 'No tool answered 5xx in the last 90 days of recorded requests.'}
            </p>
          </FrameRow>
        ) : (
          measuredIncidents.map((incident) => (
            <FrameRow key={`${incident.day}-${incident.name}`} className="px-6 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {incident.name} · {incident.day}
                </span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                  {incident.bad} of {incident.observed} hours with 5xx
                </span>
              </div>
            </FrameRow>
          ))
        )}
        <FrameRow className="px-6 py-2.5">
          <FrameTag>Sampled</FrameTag>
        </FrameRow>
        {incidents.length === 0 ? (
          <FrameRow flush className="px-6 py-4">
            <p className="text-[13px] text-muted-foreground">
              {historyError ? 'Probe history unavailable.' : history ? 'No probed dependency fell under 95% in the last 90 days.' : 'Loading probe history.'}
            </p>
          </FrameRow>
        ) : (
          incidents.map((incident, index) => (
            <FrameRow key={`${incident.day}-${incident.service}`} flush={index === incidents.length - 1} className="px-6 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {serviceLabel(incident.service)} · {incident.day}
                </span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                  {incident.okPct.toFixed(1)}% uptime
                </span>
              </div>
            </FrameRow>
          ))
        )}
      </>
    );
  }

  return (
    <PageFrame>
      <div className="relative flex h-44 flex-col justify-center overflow-hidden px-6">
        <AsciiOrbit
          cols={26}
          rows={13}
          seed={7}
          tone="app"
          className="absolute right-6 top-1/2 hidden -translate-y-1/2 lg:block [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]"
        />
        <h1 className="relative truncate text-[32px] font-medium leading-tight tracking-tight text-foreground">Health</h1>
        <p className="relative mt-1 text-sm text-muted-foreground">
          Whether each tool works right now, how its recent requests went, and which dependency to look at when one does not.
        </p>
      </div>
      {body}
    </PageFrame>
  );
}
