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
          title="Model providers"
          description="Bring your own keys. Requests made with your Helix API key use these providers for JSON extraction and the Agent."
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
          <span className="text-sm text-muted-foreground">{error}</span>
          <Button variant="outline" size="sm" onClick={load} className="rounded-pill">
            Retry
          </Button>
        </FrameRow>
      )}

      {!loading && !error && statuses && (
        <>
          {PROVIDER_META.map((meta, index) => (
            <ProviderRow
              key={meta.id}
              meta={meta}
              status={statuses[meta.id]}
              apiKey={apiKey}
              flush={index === PROVIDER_META.length - 1}
              onChanged={(next) => setStatuses((prev) => (prev ? { ...prev, [meta.id]: next } : prev))}
            />
          ))}
        </>
      )}
    </>
  );
}
