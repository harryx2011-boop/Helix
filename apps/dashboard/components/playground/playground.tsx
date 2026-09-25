'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { usePreferences } from '@/lib/preferences';
import { useRouter } from 'next/navigation';
import { HelixApiError } from '@/lib/api';
import type {
  DocumentRequest,
  ExtractRequest,
  ScreenshotRequest,
  CrawlRequest,
  CrawlResponse,
  Format,
  InteractRequest,
  InteractResponse,
  MapRequest,
  MapResponse,
  MetadataRequest,
  MetadataResponse,
  MetadataScrubResponse,
  MonitorRequest,
  MonitorResponse,
  ParseRequest,
  ParseResponse,
  ScrapeRequest,
  ScrapeResponse,
  SearchRequest,
  SearchResponse,
} from '@/lib/api';
import { runEndpoint, type EndpointMode } from '@/lib/run-endpoint';
import { createLatest } from '@/lib/latest-request';
import { useAppSession } from '@/components/app/session-provider';
import { runnableById } from '@/lib/catalog';
import type { RunnableEndpoint as Endpoint } from '@/lib/endpoints';
import { DEFAULT_FORMATS } from '@/lib/formats';
import { recordRun, subjectOf } from '@/lib/recent-runs';
import { cn } from '@/lib/utils';
import { ScrapeForm } from './forms/scrape-form';
import { MapForm } from './forms/map-form';
import { SearchForm } from './forms/search-form';
import { CrawlForm } from './forms/crawl-form';
import { ParseForm } from './forms/parse-form';
import { MetadataForm } from './forms/metadata-form';
import { DocumentForm } from './forms/document-form';
import { ExtractForm } from './forms/extract-form';
import { ScreenshotForm } from './forms/screenshot-form';
import { InteractForm } from './forms/interact-form';
import { MonitorForm } from './forms/monitor-form';
import { GetCodeDialog } from './get-code-dialog';
import { Results, type PlaygroundResult } from './results';
import { PromptBox } from './prompt-box';

function isJobAcceptedShape(body: unknown): body is { id: string } {
  return Boolean(body && typeof body === 'object' && typeof (body as { id?: unknown }).id === 'string');
}

export function Playground() {
  const router = useRouter();
  const { apiKey } = useAppSession();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const requestedUrl = searchParams.get('url');
  const { preferences, hydrated: prefsHydrated } = usePreferences();
  const [activeId, setActiveId] = React.useState<string>(
    requestedTab && runnableById(requestedTab) ? requestedTab : 'scrape',
  );

  // Preferences arrive after mount (localStorage), so the default endpoint is
  // applied once, and only when the URL did not already name a tab — a link
  // into a specific tab must win over a stored preference.
  const appliedDefault = React.useRef(false);
  React.useEffect(() => {
    if (appliedDefault.current || !prefsHydrated || requestedTab) return;
    appliedDefault.current = true;
    if (runnableById(preferences.defaultEndpoint)) setActiveId(preferences.defaultEndpoint);
  }, [prefsHydrated, requestedTab, preferences.defaultEndpoint]);
  const [promptValue, setPromptValue] = React.useState(requestedUrl ?? '');
  // One file for the box's paperclip and the upload-taking forms alike, so a
  // paste into the box is what the form submits, not a second copy.
  const [attachment, setAttachment] = React.useState<File | null>(null);

  // A sidebar row carries `tab` alone (no `url`), so the tab must follow the
  // URL on every navigation, not just the ones that also bring a url — else
  // the pill row and the sidebar's active row can point at different tabs.
  const lastTab = React.useRef(requestedTab ?? '');
  React.useEffect(() => {
    if (requestedTab === lastTab.current) return;
    lastTab.current = requestedTab ?? '';
    if (requestedTab && runnableById(requestedTab)) {
      setActiveId(requestedTab);
      setAttachment(null);
    }
  }, [requestedTab]);

  // `selectTab` replaces the URL without `url`, so only a link that carries
  // one (the hero, the command palette) re-targets an already-mounted playground.
  const lastDeepLink = React.useRef(`${requestedTab ?? ''}|${requestedUrl ?? ''}`);
  React.useEffect(() => {
    const key = `${requestedTab ?? ''}|${requestedUrl ?? ''}`;
    if (key === lastDeepLink.current) return;
    lastDeepLink.current = key;
    if (!requestedUrl) return;
    if (requestedTab && runnableById(requestedTab)) setActiveId(requestedTab);
    setPromptValue(requestedUrl);
    setAttachment(null);
    setResult(undefined);
    setError(undefined);
    setTimingMs(undefined);
  }, [requestedTab, requestedUrl]);
  const [formats, setFormats] = React.useState<Format[]>([...DEFAULT_FORMATS]);
  const appliedFormat = React.useRef(false);
  React.useEffect(() => {
    if (appliedFormat.current || !prefsHydrated) return;
    appliedFormat.current = true;
    setFormats([preferences.defaultFormat]);
  }, [prefsHydrated, preferences.defaultFormat]);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [result, setResult] = React.useState<PlaygroundResult | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [pending, setPending] = React.useState<{ kind: PlaygroundResult['kind']; filename?: string | undefined } | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [timingMs, setTimingMs] = React.useState<number | undefined>(undefined);
  const [codeDialog, setCodeDialog] = React.useState<
    { endpoint: Endpoint; body: Record<string, unknown>; pathSuffix?: string } | undefined
  >(undefined);
  const runRequest = React.useRef(createLatest());

  const activeDef = runnableById(activeId) ?? runnableById('scrape')!;

  const selectTab = (id: string) => {
    setActiveId(id);
    setPromptValue('');
    setAttachment(null);
    setResult(undefined);
    setError(undefined);
    setTimingMs(undefined);
    router.replace(`/app/playground?tab=${id}`, { scroll: false });
  };

  const clearResult = () => {
    setResult(undefined);
    setError(undefined);
    setTimingMs(undefined);
  };

  // The toolbar's Format picker owns the scrape `formats` array. The Options
  // form still builds `extract` when a schema is set, and that only reaches
  // the API alongside `json`, so the two are merged rather than one winning.
  const withFormats = (request: ScrapeRequest): Record<string, unknown> => {
    const merged = new Set<Format>(formats.length > 0 ? formats : DEFAULT_FORMATS);
    if (request.extract || request.jsonOptions) merged.add('json');
    return { ...request, formats: Array.from(merged) };
  };

  const run = React.useCallback(
    async (
      kind: PlaygroundResult['kind'],
      endpoint: Endpoint,
      body: Record<string, unknown> | FormData,
      async_: boolean,
      mode: EndpointMode = 'scan',
    ) => {
      const requestId = runRequest.current.next();
      setLoading(true);
      setError(undefined);
      setResult(undefined);
      // The filename is only known on the upload path; the animation falls back
      // to its own copy when the request came from a URL.
      const uploaded = body instanceof FormData ? body.get('file') : null;
      setPending({ kind, filename: uploaded instanceof File ? uploaded.name : undefined });
      const started = performance.now();
      try {
        const { body: responseBody } = await runEndpoint<unknown>(endpoint, body, apiKey, mode);
        if (!runRequest.current.isCurrent(requestId)) return;
        setTimingMs(Math.round(performance.now() - started));

        if (async_ && isJobAcceptedShape(responseBody)) {
          setResult({ kind: 'handoff', jobId: responseBody.id });
        } else {
          setResult({ kind, response: responseBody } as PlaygroundResult);
        }

        const subject = subjectOf(body);
        const succeeded = !(responseBody && typeof responseBody === 'object' && (responseBody as { success?: unknown }).success === false);
        if (subject && succeeded) {
          recordRun({ endpoint, url: subject, ...(async_ && isJobAcceptedShape(responseBody) ? { id: responseBody.id } : {}) });
        }
      } catch (err) {
        if (!runRequest.current.isCurrent(requestId)) return;
        setResult(undefined);
        setError(err instanceof HelixApiError ? err.message : 'Unexpected error contacting the API.');
      } finally {
        if (runRequest.current.isCurrent(requestId)) {
          setLoading(false);
          setPending(undefined);
        }
      }
    },
    [apiKey],
  );

  const openCode = (endpoint: Endpoint, body: Record<string, unknown>, mode: EndpointMode = 'scan') =>
    setCodeDialog({ endpoint, body, ...(mode === 'scrub' ? { pathSuffix: '/scrub' } : {}) });

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

  const promptEmpty = promptValue.trim().length === 0;
  const promptDisabled = promptEmpty && attachment === null;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <PromptBox
        variant="app"
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
        getCodeDisabled={promptEmpty}
        formats={formats}
        onFormatsChange={setFormats}
        attachment={attachment}
        onAttachmentChange={setAttachment}
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
              onSubmit={(request: ScrapeRequest) => run('scrape', 'scrape', withFormats(request), false)}
              onGetCode={(body) => openCode('scrape', withFormats(body as unknown as ScrapeRequest))}
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
              file={attachment}
              onFileChange={setAttachment}
              loading={loading}
              onSubmit={(request: ParseRequest | FormData) => run('parse', 'parse', request instanceof FormData ? request : (request as unknown as Record<string, unknown>), false)}
              onGetCode={(body) => openCode('parse', body)}
            />
          )}
          {activeDef.id === 'metadata' && (
            <MetadataForm
              url={promptValue}
              file={attachment}
              onFileChange={setAttachment}
              loading={loading}
              onSubmit={(request: MetadataRequest | FormData, mode: EndpointMode) =>
                run(
                  mode === 'scrub' ? 'metadata-scrub' : 'metadata',
                  'metadata',
                  request instanceof FormData ? request : (request as unknown as Record<string, unknown>),
                  false,
                  mode,
                )
              }
              onGetCode={(body, mode) => openCode('metadata', body, mode)}
            />
          )}
          {activeDef.id === 'document' && (
            <DocumentForm
              url={promptValue}
              loading={loading}
              onSubmit={(request: DocumentRequest) => run('document', 'document', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('document', body)}
            />
          )}
          {activeDef.id === 'extract' && (
            <ExtractForm
              url={promptValue}
              loading={loading}
              onSubmit={(request: ExtractRequest) => run('extract', 'extract', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('extract', body)}
            />
          )}
          {activeDef.id === 'screenshot' && (
            <ScreenshotForm
              url={promptValue}
              loading={loading}
              onSubmit={(request: ScreenshotRequest) => run('screenshot', 'screenshot', request as unknown as Record<string, unknown>, false)}
              onGetCode={(body) => openCode('screenshot', body)}
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
        <Results
          result={result}
          loading={loading}
          timingMs={timingMs}
          error={error}
          pending={pending}
          endpoint={activeDef.id}
          input={promptValue}
          onBack={clearResult}
        />
      </div>

      {codeDialog && (
        <GetCodeDialog
          endpoint={codeDialog.endpoint}
          body={codeDialog.body}
          pathSuffix={codeDialog.pathSuffix}
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
  MetadataResponse,
  MetadataScrubResponse,
  SearchResponse,
  CrawlResponse,
  ParseResponse,
  InteractResponse,
  MonitorResponse,
};
