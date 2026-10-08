'use client';

import * as React from 'react';
import { Code2, FileText } from '@/components/icons/lucide';
import type { ScrapeResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MetadataStrip } from './metadata-strip';
import { MarkdownView } from './markdown-view';
import { JsonView } from './json-view';
import { FailurePanel } from './failure-panel';

type ViewMode = 'rendered' | 'raw';

interface ResultPanelProps {
  result: ScrapeResponse | undefined;
  loading: boolean;
  timingMs: number | undefined;
  error: string | undefined;
}

export function ResultPanel({ result, loading, timingMs, error }: ResultPanelProps) {
  const [mode, setMode] = React.useState<ViewMode>('rendered');

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16" />
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
          Enter a URL and run the request. Results — including a typed failure
          with its next step — appear here.
        </p>
      </div>
    );
  }

  if (!result.success) {
    return (
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        {timingMs !== undefined && (
          <span className="font-mono text-xs text-muted-foreground">{timingMs}ms round-trip</span>
        )}
        <FailurePanel failure={result.failure} />
      </div>
    );
  }

  const { data } = result;
  const hasMarkdown = typeof data.markdown === 'string';

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {data.metadata && (
        <MetadataStrip metadata={data.metadata} timingMs={timingMs} contentHash={data.metadata.contentHash} />
      )}

      <div className="flex items-center gap-1 self-start rounded-card bg-muted p-1">
        <Button
          variant={mode === 'rendered' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          onClick={() => setMode('rendered')}
        >
          <FileText className="h-3.5 w-3.5" />
          Rendered
        </Button>
        <Button
          variant={mode === 'raw' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          onClick={() => setMode('raw')}
        >
          <Code2 className="h-3.5 w-3.5" />
          Raw JSON
        </Button>
      </div>

      {mode === 'rendered' && hasMarkdown && data.markdown && <MarkdownView content={data.markdown} />}
      {mode === 'rendered' && !hasMarkdown && (
        <p className="text-sm text-muted-foreground">
          No markdown in this response — check &ldquo;markdown&rdquo; under Formats, or view Raw JSON.
        </p>
      )}
      {mode === 'raw' && <JsonView data={data} />}

      {data.screenshot && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Screenshot</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring URL from the API; next/image can't optimize a static export against it */}
          <img
            src={data.screenshot}
            alt="Page screenshot"
            className="rounded-card border border-border"
          />
        </div>
      )}
    </div>
  );
}
