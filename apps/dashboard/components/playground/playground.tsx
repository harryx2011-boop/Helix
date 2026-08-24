'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { HelixApiError } from '@/lib/api';
import type {
  CrawlRequest,
  CrawlResponse,
  InteractRequest,
  InteractResponse,
  MapRequest,
  MapResponse,
  MonitorRequest,
  MonitorResponse,
  ParseRequest,
  ParseResponse,
  ScrapeRequest,
  ScrapeResponse,
  SearchRequest,
  SearchResponse,
} from '@/lib/api';
import { runEndpoint } from '@/lib/run-endpoint';
import { useApiKey } from '@/components/shell/api-key-provider';
import { ENDPOINTS, TAB_GROUPS, endpointById } from '@/lib/catalog';
import type { Endpoint } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';
import { ScrapeForm } from './forms/scrape-form';
import { MapForm } from './forms/map-form';
import { SearchForm } from './forms/search-form';
import { CrawlForm } from './forms/crawl-form';
import { ParseForm } from './forms/parse-form';
import { InteractForm } from './forms/interact-form';
import { MonitorForm } from './forms/monitor-form';
import { GetCodeDialog } from './get-code-dialog';
import { Results, type PlaygroundResult } from './results';
import { RecentRuns } from './recent-runs';

interface PlaygroundProps {
  initialTab: string;
}

function isJobAcceptedShape(body: unknown): body is { id: string } {
  return Boolean(body && typeof body === 'object' && typeof (body as { id?: unknown }).id === 'string');
}

export function Playground({ initialTab }: PlaygroundProps) {
  const router = useRouter();
  const { apiKey } = useApiKey();
  const [activeId, setActiveId] = React.useState<string>(endpointById(initialTab) ? initialTab : 'scrape');
  const [result, setResult] = React.useState<PlaygroundResult | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [timingMs, setTimingMs] = React.useState<number | undefined>(undefined);
  const [codeDialog, setCodeDialog] = React.useState<{ endpoint: Endpoint; body: Record<string, unknown> } | undefined>(undefined);

  const activeDef = endpointById(activeId) ?? ENDPOINTS[0]!;

  const selectTab = (id: string) => {
    setActiveId(id);
    setResult(undefined);
    setError(undefined);
    setTimingMs(undefined);
    router.replace(`/app/playground?tab=${id}`, { scroll: false });
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const ids = ENDPOINTS.map((e) => e.id);
    const currentIndex = ids.indexOf(activeId as Endpoint);
    const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % ids.length : (currentIndex - 1 + ids.length) % ids.length;
    selectTab(ids[nextIndex]!);
  };

  const run = React.useCallback(
    async (kind: PlaygroundResult['kind'], endpoint: Endpoint, body: Record<string, unknown> | FormData, async_: boolean) => {
      setLoading(true);
      setError(undefined);
      setResult(undefined);
      const started = performance.now();
      try {
        const { body: responseBody } = await runEndpoint<unknown>(endpoint, body, apiKey);
        setTimingMs(Math.round(performance.now() - started));

        if (async_ && isJobAcceptedShape(responseBody)) {
          setResult({ kind: 'handoff', jobId: responseBody.id });
        } else {
          setResult({ kind, response: responseBody } as PlaygroundResult);
        }
      } catch (err) {
        setResult(undefined);
        setError(err instanceof HelixApiError ? err.message : 'Unexpected error contacting the API.');
      } finally {
        setLoading(false);
      }
    },
    [apiKey],
  );

  const openCode = (endpoint: Endpoint, body: Record<string, unknown>) => setCodeDialog({ endpoint, body });

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
          {TAB_GROUPS.map((group) => {
            const groupEndpoints = ENDPOINTS.filter((e) => e.group === group);
            return (
              <div key={group} className="flex flex-col items-center gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{group}</span>
                <div role="tablist" aria-label={group} onKeyDown={handleTabKeyDown} className="flex items-center gap-1 rounded-pill bg-muted p-1">
                  {groupEndpoints.map((def) => {
                    const Icon = def.icon;
                    const active = def.id === activeId;
                    return (
                      <button
                        key={def.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => selectTab(def.id)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out',
                          active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {def.name}
                        {def.status === 'coming' && (
                          <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">coming</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid min-h-[420px] flex-1 grid-cols-1 overflow-hidden rounded-card border border-border md:grid-cols-[360px_1px_1fr]">
        <div className="overflow-y-auto">
          {activeDef.id === 'scrape' && (
            <ScrapeForm
              loading={loading}
              onSubmit={(request: ScrapeRequest) => run('scrape', 'scrape', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('scrape', body)}
            />
          )}
          {activeDef.id === 'map' && (
            <MapForm
              loading={loading}
              onSubmit={(request: MapRequest) => run('map', 'map', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('map', body)}
            />
          )}
          {activeDef.id === 'search' && (
            <SearchForm
              loading={loading}
              onSubmit={(request: SearchRequest) => run('search', 'search', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('search', body)}
            />
          )}
          {activeDef.id === 'crawl' && (
            <CrawlForm
              loading={loading}
              onSubmit={(request: CrawlRequest) => run('crawl', 'crawl', request as unknown as Record<string, unknown>, !request.estimate)}
              onGetCode={(body) => openCode('crawl', body)}
            />
          )}
          {activeDef.id === 'parse' && (
            <ParseForm
              loading={loading}
              onSubmit={(request: ParseRequest | FormData) => run('parse', 'parse', request instanceof FormData ? request : (request as unknown as Record<string, unknown>), false)}
              onGetCode={(body) => openCode('parse', body)}
            />
          )}
          {activeDef.id === 'interact' && (
            <InteractForm
              loading={loading}
              onSubmit={(request: InteractRequest) => run('interact', 'interact', request as unknown as Record<string, unknown>, request.keepSessionOpen === true)}
              onGetCode={(body) => openCode('interact', body)}
            />
          )}
          {activeDef.id === 'monitor' && (
            <MonitorForm
              loading={loading}
              onSubmit={(request: MonitorRequest) => run('monitor', 'monitor', request as unknown as Record<string, unknown>, true)}
              onGetCode={(body) => openCode('monitor', body)}
            />
          )}
        </div>
        <div className="hidden bg-border md:block" />
        <div className="min-h-[300px] overflow-x-auto">
          <Results result={result} loading={loading} timingMs={timingMs} error={error} />
        </div>
      </div>

      <RecentRuns />

      {codeDialog && (
        <GetCodeDialog
          endpoint={codeDialog.endpoint}
          body={codeDialog.body}
          apiKey={apiKey}
          open={Boolean(codeDialog)}
          onOpenChange={(open) => {
            if (!open) setCodeDialog(undefined);
          }}
        />
      )}
    </div>
  );
}

// Re-export response types consumed by forms/results for convenience.
export type {
  ScrapeResponse,
  MapResponse,
  SearchResponse,
  CrawlResponse,
  ParseResponse,
  InteractResponse,
  MonitorResponse,
};
