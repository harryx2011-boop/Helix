'use client';

import * as React from 'react';
import { Code2, ExternalLink, FileText } from 'lucide-react';
import type {
  CrawlResponse,
  Document,
  Estimate,
  InteractResponse,
  JobAccepted,
  MapResponse,
  ParseResponse,
  ScrapeResponse,
  SearchResponse,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MetadataStrip } from '@/components/result/metadata-strip';
import { MarkdownView } from '@/components/result/markdown-view';
import { JsonView } from '@/components/result/json-view';
import { FailurePanel } from '@/components/result/failure-panel';

export type PlaygroundResult =
  | { kind: 'scrape'; response: ScrapeResponse }
  | { kind: 'map'; response: MapResponse }
  | { kind: 'search'; response: SearchResponse }
  | { kind: 'crawl'; response: CrawlResponse }
  | { kind: 'parse'; response: ParseResponse }
  | { kind: 'interact'; response: InteractResponse }
  | { kind: 'monitor'; response: unknown }
  | { kind: 'handoff'; jobId: string }
  | { kind: 'coming' };

type ViewMode = 'rendered' | 'raw';

interface ResultsProps {
  result: PlaygroundResult | undefined;
  loading: boolean;
  timingMs: number | undefined;
  error: string | undefined;
}

function isJobAccepted(response: CrawlResponse): response is JobAccepted {
  return typeof (response as JobAccepted).id === 'string';
}

function EstimateCard({ estimate }: { estimate: Estimate }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pages" value={estimate.pages} />
        <Stat label="From cache" value={estimate.pagesFromCache} />
        <Stat label="Est. seconds" value={estimate.estimatedSeconds} />
        <Stat
          label="Est. provider cost"
          value={
            estimate.estimatedProviderCost?.amount !== undefined
              ? `$${estimate.estimatedProviderCost.amount.toFixed(4)}`
              : undefined
          }
        />
      </div>
      {estimate.tierBreakdown && Object.keys(estimate.tierBreakdown).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(estimate.tierBreakdown).map(([tier, count]) => (
            <Badge key={tier} variant="secondary" className="font-mono text-[11px]">
              {tier}: {count}
            </Badge>
          ))}
        </div>
      )}
      {estimate.assumptions && estimate.assumptions.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {estimate.assumptions.map((assumption, i) => (
            <li key={i}>&middot; {assumption}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionStrip({ sessionId, sessionOpen, url, timingMs }: { sessionId?: string | undefined; sessionOpen?: boolean | undefined; url?: string | undefined; timingMs?: number | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
      {sessionId && <span>{sessionId}</span>}
      {sessionOpen !== undefined && (
        <Badge variant={sessionOpen ? 'default' : 'secondary'} className="font-mono text-[10px] uppercase tracking-wide">
          {sessionOpen ? 'open' : 'closed'}
        </Badge>
      )}
      {url && <span className="truncate">{url}</span>}
      {timingMs !== undefined && <span>{timingMs}ms round-trip</span>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm text-foreground">{value ?? '—'}</span>
    </div>
  );
}

function ResultTabs({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-1 self-start rounded-md bg-muted p-1">
      <Button
        type="button"
        variant={mode === 'rendered' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs"
        onClick={() => onChange('rendered')}
      >
        <FileText className="h-3.5 w-3.5" />
        Rendered
      </Button>
      <Button
        type="button"
        variant={mode === 'raw' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs"
        onClick={() => onChange('raw')}
      >
        <Code2 className="h-3.5 w-3.5" />
        Raw JSON
      </Button>
    </div>
  );
}

function DocumentResult({ data, timingMs }: { data: Document; timingMs: number | undefined }) {
  const [mode, setMode] = React.useState<ViewMode>('rendered');
  const hasMarkdown = typeof data.markdown === 'string';

  return (
    <div className="flex flex-col gap-4">
      {data.metadata && <MetadataStrip metadata={data.metadata} timingMs={timingMs} contentHash={data.metadata.contentHash} />}
      <ResultTabs mode={mode} onChange={setMode} />
      {mode === 'rendered' && hasMarkdown && data.markdown && <MarkdownView content={data.markdown} />}
      {mode === 'rendered' && !hasMarkdown && (
        <p className="text-sm text-muted-foreground">No markdown in this response — check Raw JSON.</p>
      )}
      {mode === 'raw' && <JsonView data={data} />}
      {data.screenshot && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Screenshot</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring URL from the API */}
          <img src={data.screenshot} alt="Page screenshot" className="rounded-card border border-border" />
        </div>
      )}
    </div>
  );
}

export function Results({ result, loading, timingMs, error }: ResultsProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-destructive">Request failed</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
          Fill in the form and run the request. Results — including a typed failure with its next step — appear here.
        </p>
      </div>
    );
  }

  if (result.kind === 'coming') {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">This endpoint is not available yet.</p>
      </div>
    );
  }

  if (result.kind === 'handoff') {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
          <span className="text-sm font-medium text-foreground">Handed off to Activity Logs</span>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This is an async job. Track progress and results in Activity Logs.
          </p>
          <span className="font-mono text-xs text-muted-foreground">Job {result.jobId}</span>
          <Button variant="secondary" size="sm" className="w-fit gap-1.5" asChild>
            <a href={`/app/activity/${result.jobId}`}>
              <ExternalLink className="h-3.5 w-3.5" />
              View in Activity Logs
            </a>
          </Button>
        </div>
      </div>
    );
  }

  const wrapperClass = 'flex h-full flex-col gap-4 overflow-y-auto p-4';

  switch (result.kind) {
    case 'scrape': {
      const response = result.response;
      if (!response.success) {
        return (
          <div className={wrapperClass}>
            {timingMs !== undefined && <span className="font-mono text-xs text-muted-foreground">{timingMs}ms round-trip</span>}
            <FailurePanel failure={response.failure} />
          </div>
        );
      }
      return (
        <div className={wrapperClass}>
          <DocumentResult data={response.data} timingMs={timingMs} />
        </div>
      );
    }

    case 'parse': {
      const response = result.response;
      if (!response.success) {
        return (
          <div className={wrapperClass}>
            <FailurePanel failure={response.failure} />
          </div>
        );
      }
      return (
        <div className={wrapperClass}>
          <DocumentResult
            data={{
              ...(response.data.markdown !== undefined ? { markdown: response.data.markdown } : {}),
              ...(response.data.json !== undefined ? { json: response.data.json } : {}),
            }}
            timingMs={timingMs}
          />
        </div>
      );
    }

    case 'interact': {
      const response = result.response;
      if (!response.success) {
        const { actionIndex, actionType } = response.failure;
        return (
          <div className={wrapperClass}>
            <SessionStrip sessionId={response.sessionId} sessionOpen={response.sessionOpen} />
            <p className="text-xs text-muted-foreground">
              {actionIndex === null || actionIndex === undefined
                ? 'Failed during the initial navigation, before any action ran.'
                : `Failed at action ${actionIndex}${actionType ? ` (${actionType})` : ''}. Earlier actions already ran.`}
            </p>
            <FailurePanel failure={response.failure} />
          </div>
        );
      }
      return (
        <div className={wrapperClass}>
          <SessionStrip sessionId={response.sessionId} sessionOpen={response.sessionOpen} url={response.url} timingMs={timingMs} />
          {response.output && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Output</span>
              <p className="text-sm leading-relaxed">{response.output}</p>
            </div>
          )}
          {response.screenshot && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Screenshot</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL from the API */}
              <img src={response.screenshot} alt="Page screenshot" className="rounded-card border border-border" />
            </div>
          )}
          {response.sessionOpen && response.liveViewUrl && (
            <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
              <span className="text-sm font-medium text-foreground">Session open</span>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Paste the session ID into the form to continue on this page.
                {response.idleExpiresAt ? ` Closes at ${new Date(response.idleExpiresAt).toLocaleTimeString()} if nothing else happens.` : ''}
              </p>
              <Button variant="secondary" size="sm" className="w-fit gap-1.5" asChild>
                <a href={response.liveViewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open live view
                </a>
              </Button>
            </div>
          )}
          <JsonView data={response} />
        </div>
      );
    }

    case 'map': {
      const response = result.response;
      const links = response.links ?? [];
      return (
        <div className={wrapperClass}>
          <span className="text-xs text-muted-foreground">
            {links.length} URL{links.length === 1 ? '' : 's'} discovered{response.truncated ? ' (truncated)' : ''}
          </span>
          <div className="flex flex-col divide-y divide-border overflow-x-auto rounded-card border border-border">
            {links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col gap-0.5 px-3 py-2 text-sm transition-colors duration-150 ease-out hover:bg-accent"
              >
                <span className="truncate font-mono text-xs text-primary">{link.url}</span>
                {link.title && <span className="truncate text-xs text-muted-foreground">{link.title}</span>}
              </a>
            ))}
            {links.length === 0 && <span className="px-3 py-4 text-sm text-muted-foreground">No URLs discovered.</span>}
          </div>
        </div>
      );
    }

    case 'search': {
      const response = result.response;
      const results = response.results ?? [];
      return (
        <div className={wrapperClass}>
          <span className="text-xs text-muted-foreground">{results.length} result{results.length === 1 ? '' : 's'}</span>
          <div className="flex flex-col gap-3">
            {results.map((item, i) => (
              <div key={`${item.url}-${i}`} className="flex flex-col gap-1 rounded-card border border-border p-3">
                <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                  {item.title ?? item.url}
                </a>
                <span className="truncate font-mono text-xs text-muted-foreground">{item.url}</span>
                {item.snippet && <p className="text-sm text-muted-foreground leading-relaxed">{item.snippet}</p>}
                {item.markdown && <MarkdownView content={item.markdown} />}
              </div>
            ))}
            {results.length === 0 && <span className="text-sm text-muted-foreground">No results.</span>}
          </div>
        </div>
      );
    }

    case 'crawl': {
      const response = result.response;
      if (isJobAccepted(response)) {
        return (
          <div className={wrapperClass}>
            <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
              <span className="text-sm font-medium text-foreground">Crawl started</span>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Crawls run in the background. Track progress and results in Activity Logs.
              </p>
              <span className="font-mono text-xs text-muted-foreground">Job {response.id}</span>
              <Button variant="secondary" size="sm" className="w-fit gap-1.5" asChild>
                <a href={`/app/activity/${response.id}`}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  View in Activity Logs
                </a>
              </Button>
            </div>
          </div>
        );
      }
      return (
        <div className={wrapperClass}>
          <EstimateCard estimate={response} />
        </div>
      );
    }

    case 'monitor':
      return (
        <div className={wrapperClass}>
          <JsonView data={result.response} />
        </div>
      );
  }
}
