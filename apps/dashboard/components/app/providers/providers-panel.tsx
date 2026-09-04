'use client';

import * as React from 'react';
import { FrameRow, FrameHeading } from '@/components/app/page-frame';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOptionalApiKey } from '@/components/shell/api-key-provider';
import { HelixApiError } from '@/lib/api';
import { listProviders } from '@/lib/providers';
import type { ProviderId, ProviderStatus } from '@/lib/providers';
import { ProviderRow, PROVIDER_META } from './provider-row';

function emptyStatus(provider: ProviderId): ProviderStatus {
  return { provider, configured: false, source: 'none' };
}

export function ProvidersPanel() {
  const apiKeyCtx = useOptionalApiKey();
  const apiKey = apiKeyCtx?.apiKey ?? null;
  const [statuses, setStatuses] = React.useState<Record<ProviderId, ProviderStatus> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listProviders(apiKey);
      const next = Object.fromEntries(PROVIDER_META.map((m) => [m.id, emptyStatus(m.id)])) as Record<ProviderId, ProviderStatus>;
      for (const status of result.providers) {
        next[status.provider] = status;
      }
      setStatuses(next);
    } catch (err) {
      setError(err instanceof HelixApiError ? err.message : 'Could not load providers.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <FrameRow>
        <FrameHeading
          title="AI Providers"
          description="Helix uses your own AI account for the features that need one, so you are billed directly and your keys stay yours. You can also point at a model running on your own machine."
        />
      </FrameRow>

      {loading && (
        <FrameRow flush className="flex flex-col gap-3 p-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </FrameRow>
      )}

      {!loading && error && (
        <FrameRow flush className="flex flex-col items-start gap-3 p-6">
          <span className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">{error}</span>
          {/* The panel cannot tell a wrong key from an absent service, and the
              second is far likelier on a fresh checkout — so it names the step
              rather than leaving someone re-typing a credential that was fine. */}
          <span className="max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground/80">
            Provider credentials are stored by the Helix API, not by this dashboard. If it is not running,
            start it with <span className="font-mono text-foreground">pnpm dev</span> from the repo root and try again.
          </span>
          <Button variant="outline" size="sm" onClick={load} className="rounded-pill">
            Retry
          </Button>
        </FrameRow>
      )}

      {!loading && !error && statuses && (
        <>
          {PROVIDER_META.map((meta, index) => {
            const previous = PROVIDER_META[index - 1];
            const enteringLocal = meta.local && !previous?.local;
            return (
              <React.Fragment key={meta.id}>
                {enteringLocal && (
                  <FrameRow className="px-6 py-2.5">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">On your own machine</span>
                  </FrameRow>
                )}
                <ProviderRow
                  meta={meta}
                  status={statuses[meta.id]}
                  apiKey={apiKey}
                  flush={index === PROVIDER_META.length - 1}
                  onChanged={(next) => setStatuses((prev) => (prev ? { ...prev, [meta.id]: next } : prev))}
                />
              </React.Fragment>
            );
          })}
        </>
      )}
    </>
  );
}
