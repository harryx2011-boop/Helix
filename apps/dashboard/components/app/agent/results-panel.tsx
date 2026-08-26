'use client';

import * as React from 'react';
import { Check, Copy, Download, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SchemaJson } from './schema-json';
import { toCsv } from '@/lib/agent';
import type { AgentPageResult } from '@/lib/agent';
import { cn } from '@/lib/utils';

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ResultsPanel({
  results,
  onRetry,
  className,
}: {
  results: AgentPageResult[];
  onRetry: (url: string) => void;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const ok = results.filter((r) => r.ok);
  const merged: Record<string, Record<string, unknown> | null | undefined> = {};
  for (const r of ok) merged[r.url] = r.json;

  const rowsForCsv = ok.map((r) => ({ url: r.url, ...(r.json ?? {}) }));

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(merged, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={cn('rounded-panel border border-border bg-card', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium text-foreground">Results</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-card px-2 text-xs"
            onClick={() => downloadFile('results.json', JSON.stringify(merged, null, 2), 'application/json')}
          >
            <Download className="h-3.5 w-3.5" />
            .json
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-card px-2 text-xs"
            onClick={() => downloadFile('results.csv', toCsv(rowsForCsv), 'text/csv')}
          >
            <Download className="h-3.5 w-3.5" />
            .csv
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-card" onClick={copyJson} aria-label="Copy results">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {results.map((result) => (
          <div key={result.url} className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs text-muted-foreground">{result.url}</span>
              {!result.ok && (
                <Button type="button" variant="ghost" size="sm" className="h-6 shrink-0 gap-1 rounded-pill px-2 text-xs" onClick={() => onRetry(result.url)}>
                  <RotateCw className="h-3 w-3" />
                  Retry
                </Button>
              )}
            </div>
            {result.ok ? (
              <SchemaJson value={result.json ?? null} className="overflow-x-auto font-mono text-[13px] leading-relaxed" />
            ) : (
              <p className="text-xs text-destructive">{result.errorMessage ?? 'This page could not be read.'}</p>
            )}
          </div>
        ))}
        {results.length === 0 && <p className="p-4 text-sm text-muted-foreground">No pages produced results.</p>}
      </div>
    </div>
  );
}
