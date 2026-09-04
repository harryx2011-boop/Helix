'use client';

import * as React from 'react';
import { CircleAlert, CircleCheck, CircleX, RotateCw } from 'lucide-react';
import { PageFrame, FrameRow, FrameHeading, FrameCells } from '@/components/app/page-frame';
import { PROVIDER_META, ProviderIcon } from '@/components/app/providers/provider-row';
import { AsciiOrbit } from '@/components/marketing/ascii-fields';
import { useReducedMotion } from '@/components/marketing/ambient';
import { HistoryBars } from '@/components/marketing/status/history-bars';
import {
  averageUptime,
  collectIncidents,
  indexHistory,
  orderServices,
  overallCopy,
  useHealthPolling,
  useHistory,
} from '@/components/marketing/status/status-data';
import { useOptionalApiKey } from '@/components/shell/api-key-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { HelixApiError, resolveBaseUrl } from '@/lib/api';
import type { HealthProviders, HealthService, HealthStatus } from '@/lib/api';
import { HOSTED } from '@/lib/mode';
import { listProviders } from '@/lib/providers';
import type { ProviderId, ProviderStatus } from '@/lib/providers';
import { getStoredInstanceUrl, normalizeInstanceUrl, serviceLabel, setStoredInstanceUrl } from '@/lib/status';
import type { ServiceHistory } from '@/lib/status';
import { cn } from '@/lib/utils';

const STATUS_META: Record<
  HealthStatus,
  { label: string; dot: string; text: string; badge: 'success' | 'warning' | 'destructive'; Icon: typeof CircleCheck }
> = {
  ok: { label: 'Operational', dot: 'bg-success', text: 'text-success', badge: 'success', Icon: CircleCheck },
  degraded: { label: 'Degraded', dot: 'bg-warning', text: 'text-warning', badge: 'warning', Icon: CircleAlert },
  unhealthy: { label: 'Down', dot: 'bg-destructive', text: 'text-destructive', badge: 'destructive', Icon: CircleX },
};

const EMPTY_BAR = 'bg-muted-foreground/20';

function formatChecked(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

/**
 * Self-host talks to the API this build was pointed at. Hosted has no
 * instance of its own, so it borrows the public status page's setting: a
 * per-browser instance URL, shared under the same storage key.
 */
function useInstanceBase(): { baseUrl: string | null; hydrated: boolean; connect: (origin: string) => void } {
  const [stored, setStored] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setStored(getStoredInstanceUrl());
    setHydrated(true);
  }, []);

  const connect = React.useCallback((origin: string) => {
    setStoredInstanceUrl(origin);
    setStored(origin);
  }, []);

  const baseUrl = !hydrated ? null : HOSTED ? (stored ? `${stored}/v1` : null) : resolveBaseUrl();
  return { baseUrl, hydrated, connect };
}

function InstanceUrlForm({ onSubmit }: { onSubmit: (origin: string) => void }) {
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
      className="flex w-full max-w-[560px] flex-col gap-2 sm:flex-row"
    >
      <Input
        type="url"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        aria-label="Instance URL"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'health-instance-url-error' : undefined}
        placeholder="https://your-instance.example.com"
        autoComplete="off"
        className="font-mono text-[13px] aria-[invalid]:border-destructive"
      />
      <Button type="submit" className="shrink-0 rounded-pill">
        Point health here
      </Button>
      {invalid && (
        <p id="health-instance-url-error" className="w-full text-xs text-destructive sm:basis-full">
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
      {history && (
        <div className="mt-3">
          <HistoryBars days={history.days} reduced={reduced} emptyClassName={EMPTY_BAR} />
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground/70">
            <span>90 days ago</span>
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
          {HOSTED
            ? 'Hosted mode keeps your API key server-side, so the providers attached to it are not listed here yet.'
            : 'This browser holds no instance key, so the providers attached to a key cannot be listed.'}
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

export function HealthClient() {
  const reduced = useReducedMotion();
  const apiKey = useOptionalApiKey()?.apiKey ?? null;
  const { baseUrl, hydrated, connect } = useInstanceBase();
  const [nonce, setNonce] = React.useState(0);
  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  const { health, error, loading, fetching, lastUpdated } = useHealthPolling(baseUrl, nonce);
  const { history, error: historyError } = useHistory(baseUrl, nonce);

  const historyByService = React.useMemo(() => indexHistory(history), [history]);
  const services = React.useMemo(() => orderServices(health, historyByService), [health, historyByService]);
  const incidents = React.useMemo(() => collectIncidents(history?.services ?? []), [history]);

  let body: React.ReactNode;

  if (!hydrated) {
    body = (
      <>
        <ServiceRowSkeleton flush={false} />
        <ServiceRowSkeleton flush={false} />
        <ServiceRowSkeleton flush />
      </>
    );
  } else if (!baseUrl) {
    body = (
      <FrameRow flush>
        <div className="flex flex-col gap-5 px-6 py-10">
          <div className="max-w-[560px]">
            <h2 className="text-[17px] font-medium leading-tight tracking-tight text-foreground">No instance connected</h2>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              Hosted Helix has no instance behind this page. Point it at a self-hosted deployment&apos;s API to see that
              instance&apos;s health; the public status page shares this setting.
            </p>
          </div>
          <InstanceUrlForm onSubmit={connect} />
        </div>
      </FrameRow>
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
              {HOSTED
                ? 'Check the URL, or point this page at another instance.'
                : 'The API is down, or NEXT_PUBLIC_HELIX_API_URL points at the wrong host.'}
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <Button variant="outline" size="sm" onClick={refresh} disabled={fetching} className="w-fit rounded-pill">
              <RotateCw className={cn('h-3.5 w-3.5', fetching && 'animate-spin')} />
              {fetching ? 'Trying…' : 'Try again'}
            </Button>
            {HOSTED && <InstanceUrlForm onSubmit={connect} />}
          </div>
        </div>
      </FrameRow>
    );
  } else {
    const state = health?.status ?? 'ok';
    const meta = STATUS_META[state];
    const overall = overallCopy(state);
    const Icon = meta.Icon;

    body = (
      <>
        <FrameRow>
          <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {health ? (
                <Icon className={cn('h-5 w-5 shrink-0', overall.tone)} strokeWidth={1.75} aria-hidden />
              ) : (
                <Skeleton className="h-5 w-5 rounded-full" />
              )}
              <div className="min-w-0">
                {health ? (
                  <h2 className="text-[17px] font-medium leading-tight tracking-tight text-foreground">{overall.title}</h2>
                ) : (
                  <Skeleton className="h-[17px] w-48" />
                )}
                <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                  {health ? `Helix ${health.version}` : 'Connecting'}
                  {lastUpdated && ` · checked ${formatChecked(lastUpdated)}`}
                  {error && health && (
                    <span className="text-warning"> · the latest check failed, showing the last good result</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {health && <Badge variant={meta.badge}>{meta.label}</Badge>}
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
            title="Dependencies"
            description="Each check is timed on its own, so a slow service shows as latency before it becomes an outage. Sampled every minute for the history."
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
            <p className="text-xs text-muted-foreground">The 90-day history did not load; the rows above show the live check only.</p>
          </FrameRow>
        )}

        <FrameRow>
          <FrameHeading
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
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Your keys</span>
        </FrameRow>
        <KeyProviderRows apiKey={apiKey} flushLast={false} />

        <FrameRow>
          <FrameHeading title="Incidents" description="Days in the last 90 where a service's sampled uptime fell under 95%." />
        </FrameRow>
        {incidents.length === 0 ? (
          <FrameRow flush className="px-6 py-4">
            <p className="text-[13px] text-muted-foreground">
              {historyError ? 'History unavailable.' : history ? 'No incidents in the last 90 days.' : 'Loading history.'}
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
        <h1 className="relative text-[32px] font-medium leading-tight tracking-tight text-foreground">Health</h1>
        <p className="relative mt-1 text-sm text-muted-foreground">
          Every service this instance depends on, how fast each answers, and which providers are configured.
        </p>
      </div>
      {body}
    </PageFrame>
  );
}
