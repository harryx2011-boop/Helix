'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
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
import { useAppSession } from '@/components/app/session-provider';
import { endpointById } from '@/lib/catalog';
import type { Endpoint, InstanceRow } from '@/lib/supabase/types';
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
import { PromptBox } from './prompt-box';

function isJobAcceptedShape(body: unknown): body is { id: string } {
  return Boolean(body && typeof body === 'object' && typeof (body as { id?: unknown }).id === 'string');
}

export function Playground() {
  const router = useRouter();
  const { apiKey } = useAppSession();
  const requestedTab = useSearchParams().get('tab');
  const [activeId, setActiveId] = React.useState<string>(
    requestedTab && endpointById(requestedTab) ? requestedTab : 'scrape',
  );
  const [promptValue, setPromptValue] = React.useState('');
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [source, setSource] = React.useState('hosted');
  const [instances, setInstances] = React.useState<InstanceRow[]>([]);
  const [result, setResult] = React.useState<PlaygroundResult | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [timingMs, setTimingMs] = React.useState<number | undefined>(undefined);
  const [codeDialog, setCodeDialog] = React.useState<{ endpoint: Endpoint; body: Record<string, unknown> } | undefined>(undefined);

  const activeDef = endpointById(activeId) ?? endpointById('scrape')!;

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/app/instances')
      .then((response) => (response.ok ? (response.json() as Promise<{ instances: InstanceRow[] }>) : { instances: [] }))
      .then((data) => {
        if (!cancelled) setInstances(data.instances);
      })
      .catch(() => {
        if (!cancelled) setInstances([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectTab = (id: string) => {
    setActiveId(id);
    setPromptValue('');
    setResult(undefined);
    setError(undefined);
    setTimingMs(undefined);
    router.replace(`/app/playground?tab=${id}`, { scroll: false });
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

  // Each form owns its own submit-ready state (schema validity, actions, etc.); the
  // prompt box's Run button proxies to the mounted form's native submit so that
  // validation stays colocated with the fields that produce it. The form stays
  // mounted (visually collapsed via sr-only) whether or not Options is expanded,
  // so this always finds the current endpoint's form.
  const formsContainerRef = React.useRef<HTMLDivElement>(null);
  const submitActiveForm = () => {
    formsContainerRef.current?.querySelector('form')?.requestSubmit();
  };
  const submitGetCode = () => {
    formsContainerRef.current?.querySelector<HTMLButtonElement>('[data-playground-get-code]')?.click();
  };

  const promptDisabled = promptValue.trim().length === 0;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <PromptBox
        activeId={activeDef.id}
        onSelectTab={selectTab}
        value={promptValue}
        onValueChange={setPromptValue}
        onSubmit={submitActiveForm}
        loading={loading}
        disabled={promptDisabled}
        optionsOpen={optionsOpen}
        onToggleOptions={() => setOptionsOpen((open) => !open)}
        onGetCode={submitGetCode}
        getCodeDisabled={promptDisabled}
        instances={instances}
        source={source}
        onSourceChange={setSource}
      />

      <div className={cn('rounded-card border border-border bg-card', !optionsOpen && 'sr-only')} aria-hidden={!optionsOpen}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Options &mdash; {activeDef.name}</span>
        </div>
        <div ref={formsContainerRef} className="max-h-[520px] overflow-y-auto">
          {activeDef.id === 'scrape' && (
            <ScrapeForm
              url={promptValue}
              loading={loading}
              onSubmit={(request: ScrapeRequest) => run('scrape', 'scrape', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('scrape', body)}
            />
          )}
          {activeDef.id === 'map' && (
            <MapForm
              url={promptValue}
              loading={loading}
              onSubmit={(request: MapRequest) => run('map', 'map', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('map', body)}
            />
          )}
          {activeDef.id === 'search' && (
            <SearchForm
              query={promptValue}
              loading={loading}
              onSubmit={(request: SearchRequest) => run('search', 'search', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('search', body)}
            />
          )}
          {activeDef.id === 'crawl' && (
            <CrawlForm
              url={promptValue}
              loading={loading}
              onSubmit={(request: CrawlRequest) => run('crawl', 'crawl', request as unknown as Record<string, unknown>, !request.estimate)}
              onGetCode={(body) => openCode('crawl', body)}
            />
          )}
          {activeDef.id === 'parse' && (
            <ParseForm
              url={promptValue}
              loading={loading}
              onSubmit={(request: ParseRequest | FormData) => run('parse', 'parse', request instanceof FormData ? request : (request as unknown as Record<string, unknown>), false)}
              onGetCode={(body) => openCode('parse', body)}
            />
          )}
          {activeDef.id === 'interact' && (
            <InteractForm
              url={promptValue}
              loading={loading}
              onSubmit={(request: InteractRequest) => run('interact', 'interact', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('interact', body)}
            />
          )}
          {activeDef.id === 'monitor' && (
            <MonitorForm
              url={promptValue}
              loading={loading}
              onSubmit={(request: MonitorRequest) => run('monitor', 'monitor', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('monitor', body)}
            />
          )}
        </div>
      </div>

      <div className="min-h-[300px] overflow-x-auto rounded-card border border-border bg-background">
        <Results result={result} loading={loading} timingMs={timingMs} error={error} />
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
