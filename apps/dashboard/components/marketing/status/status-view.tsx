'use client';

import * as React from 'react';
import { CircleCheck, CircleAlert, CircleX, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HOSTED } from '@/lib/mode';
import {
  getStoredInstanceUrl,
  resolveStatusApiUrl,
  serviceLabel,
  setStoredInstanceUrl,
  type HealthResponse,
  type ServiceHistory,
  normalizeInstanceUrl,
} from '@/lib/status';
import { useReducedMotion } from '@/components/marketing/ambient';
import { PillButton } from '@/components/marketing/pill-button';
import { HeroField } from '@/components/marketing/hero-field';
import { HistoryBars } from './history-bars';
import {
  averageUptime,
  collectIncidents,
  formatLastUpdated,
  indexHistory,
  orderServices,
  overallCopy,
  useHealthPolling,
  useHistory,
} from './status-data';

function InstanceUrlForm({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [value, setValue] = React.useState('');
  const [invalid, setInvalid] = React.useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const url = normalizeInstanceUrl(value);
        if (url) onSubmit(url);
        else setInvalid(true);
      }}
      className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap"
    >
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'instance-url-error' : undefined}
        placeholder="https://your-instance.example.com"
        className="min-w-0 flex-1 rounded-card border border-m-border-muted bg-m-bg px-3.5 py-2.5 font-mono text-[13px] text-m-ink placeholder:text-m-ink/40 focus:border-violet-40 focus:outline-none aria-[invalid]:border-destructive"
      />
      <PillButton type="submit" variant="primary">
        Point status here
      </PillButton>
      {invalid && (
        <p id="instance-url-error" className="w-full font-mono text-[12px] text-destructive">
          Enter a full http or https URL, like https://helix.example.com
        </p>
      )}
    </form>
  );
}

function ServiceRow({
  service,
  status,
  history,
  reduced,
}: {
  service: string;
  status: HealthResponse['services'][string] | undefined;
  history: ServiceHistory | undefined;
  reduced: boolean;
}) {
  const ok = status?.status === 'ok';
  const uptime = averageUptime(history);

  return (
    <div className="flex flex-col gap-3 border-b border-m-border-faint px-5 py-4 last:border-b-0 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              status === undefined ? 'bg-m-ink/24' : ok ? 'bg-success' : 'bg-destructive',
            )}
          />
          <span className="truncate text-[14px] font-medium text-m-ink">{serviceLabel(service)}</span>
          {status?.latencyMs !== undefined && (
            <span className="shrink-0 font-mono text-[11px] text-m-ink/48">{status.latencyMs}ms</span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-m-ink/56">
          {uptime === null ? '—' : `${uptime.toFixed(2)}%`}
        </span>
      </div>
      {history && (
        <div>
          <HistoryBars days={history.days} reduced={reduced} />
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-m-ink/40">
            <span>90 days ago</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceRowSkeleton() {
  return (
    <div className="flex flex-col gap-3 border-b border-m-border-faint px-5 py-4 last:border-b-0 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-m-ink/12" />
          <span className="h-3.5 w-24 animate-pulse rounded-card bg-m-ink/[0.06]" />
        </div>
        <span className="h-3 w-12 animate-pulse rounded-card bg-m-ink/[0.06]" />
      </div>
      <span className="h-8 animate-pulse rounded-card bg-m-ink/[0.04]" />
    </div>
  );
}

export function StatusView() {
  const reduced = useReducedMotion();
  const [storedUrl, setStoredUrlState] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setStoredUrlState(getStoredInstanceUrl());
    setHydrated(true);
  }, []);

  const apiUrl = hydrated ? resolveStatusApiUrl(storedUrl) : null;
  const baseUrl = apiUrl ? `${apiUrl}/v1` : null;
  const { health, error, loading, lastUpdated } = useHealthPolling(baseUrl);
  const { history } = useHistory(baseUrl);

  function connectInstance(url: string) {
    setStoredInstanceUrl(url);
    setStoredUrlState(url);
  }

  const historyByService = React.useMemo(() => indexHistory(history), [history]);
  const services = React.useMemo(() => orderServices(health, historyByService), [health, historyByService]);

  const incidents = React.useMemo(() => collectIncidents(history?.services ?? []), [history]);

  if (hydrated && !apiUrl) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-20 text-center">
        <div className="relative">
          <HeroField motif="cloud" seed={53} className="top-1/2 -translate-y-1/2" />
          <h1 className="relative text-[28px] font-normal leading-tight tracking-tight">No instance connected</h1>
        </div>
        <p className="relative mx-auto mt-3 max-w-[480px] text-[15px] leading-relaxed text-m-ink/64">
          The hosted app has no Helix instance behind it yet. Point this page at a self-hosted deployment&rsquo;s
          API to see its live status.
        </p>
        <div className="relative">
          <InstanceUrlForm onSubmit={connectInstance} />
        </div>
      </div>
    );
  }

  if (!loading && error && !health) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-20 text-center">
        <div className="relative">
          <HeroField motif="cloud" seed={53} className="top-1/2 -translate-y-1/2" />
          <div className="relative">
            <CircleX className="mx-auto h-10 w-10 text-destructive" strokeWidth={1.5} aria-hidden />
            <h1 className="mt-4 text-[28px] font-normal leading-tight tracking-tight">Instance unreachable</h1>
          </div>
        </div>
        <p className="relative mx-auto mt-3 max-w-[480px] text-[15px] leading-relaxed text-m-ink/64">
          Could not reach <span className="font-mono text-m-ink/80">{apiUrl}</span>.
        </p>
        {HOSTED && (
          <div className="relative">
            <InstanceUrlForm onSubmit={connectInstance} />
          </div>
        )}
      </div>
    );
  }

  const overall = overallCopy(health?.status ?? 'ok');
  const Icon = health?.status === 'ok' || !health ? CircleCheck : health.status === 'degraded' ? CircleAlert : CircleX;

  return (
    <div className="px-4 pb-24 pt-16 lg:pt-20">
      <div className="relative mx-auto max-w-[640px] text-center">
        <HeroField motif="cloud" seed={53} className="top-1/2 -translate-y-1/2" />
        <div className="relative">
          <Icon className={cn('mx-auto h-12 w-12', overall.tone)} strokeWidth={1.5} aria-hidden />
          <h1 className="mt-4 text-[30px] font-normal leading-tight tracking-tight lg:text-[36px]">{overall.title}</h1>
          <p className="mt-2 font-mono text-[12px] text-m-ink/48">
            {lastUpdated ? `Last updated on ${formatLastUpdated(lastUpdated)}` : 'Connecting…'}
          </p>
        </div>
      </div>

      <nav className="mt-8 flex justify-center gap-2 font-mono text-[12px]">
        <a href="#status" className="rounded-pill bg-m-ink/[0.039] px-3.5 py-1.5 text-m-ink/72 hover:bg-m-ink/[0.059]">
          Status
        </a>
        <a href="#incidents" className="rounded-pill px-3.5 py-1.5 text-m-ink/56 hover:bg-m-ink/[0.039]">
          Incidents
        </a>
      </nav>

      <section id="status" className="mx-auto mt-10 max-w-[720px] scroll-mt-24">
        <div className="flex items-center justify-between rounded-t-panel border border-b-0 border-m-border-muted bg-m-surface px-5 py-3.5 sm:px-6">
          <span className="text-[14px] font-medium text-m-ink">Current status by service</span>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-pill px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide',
                overall.tone,
                health?.status === 'ok' || !health ? 'bg-success/10' : health.status === 'degraded' ? 'bg-warning/10' : 'bg-destructive/10',
              )}
            >
              {health?.status === 'ok' || !health ? 'Operational' : health.status === 'degraded' ? 'Degraded' : 'Down'}
            </span>
            <ChevronDown className="h-4 w-4 text-m-ink/40" strokeWidth={1.75} aria-hidden />
          </div>
        </div>
        <div className="overflow-hidden rounded-b-panel border border-m-border-muted bg-m-bg shadow-card-sm">
          {loading && !health
            ? Array.from({ length: 4 }, (_, i) => <ServiceRowSkeleton key={i} />)
            : services.map((service) => (
                <ServiceRow
                  key={service}
                  service={service}
                  status={health?.services[service]}
                  history={historyByService.get(service)}
                  reduced={reduced}
                />
              ))}
        </div>
      </section>

      <section id="incidents" className="mx-auto mt-12 max-w-[720px] scroll-mt-24">
        <h2 className="text-[18px] font-medium text-m-ink">Previous incidents</h2>
        {incidents.length === 0 ? (
          <p className="mt-3 rounded-panel border border-m-border-muted bg-m-surface px-5 py-6 text-[14px] text-m-ink/56 shadow-card-sm">
            No incidents in the last 90 days.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {incidents.map((incident) => (
              <div
                key={`${incident.day}-${incident.service}`}
                className="rounded-panel border border-m-border-muted bg-m-surface p-5 shadow-card-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-medium text-m-ink">
                    {serviceLabel(incident.service)} degraded — {incident.day}
                  </p>
                  <span className="rounded-pill bg-success/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-success">
                    Resolved
                  </span>
                </div>
                <div className="mt-3 rounded-card bg-m-bg px-3.5 py-2.5 font-mono text-[12px] text-m-ink/64">
                  Resolved: uptime was {incident.okPct.toFixed(1)}% for {serviceLabel(incident.service)} on {incident.day}.
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
