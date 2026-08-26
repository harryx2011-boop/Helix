'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UrlList } from './url-list';
import { OutputToggle, type AgentOutputFormat } from './output-toggle';
import { cn } from '@/lib/utils';

interface RefineBarProps {
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
  outputFormat: AgentOutputFormat;
  onOutputFormatChange: (format: AgentOutputFormat) => void;
  refineValue: string;
  onRefineValueChange: (value: string) => void;
  onRefine: () => void;
  refining: boolean;
  onRun: () => void;
  running: boolean;
  className?: string;
}

export function RefineBar({
  urls,
  onUrlsChange,
  outputFormat,
  onOutputFormatChange,
  refineValue,
  onRefineValueChange,
  onRefine,
  refining,
  onRun,
  running,
  className,
}: RefineBarProps) {
  const [urlsOpen, setUrlsOpen] = React.useState(urls.length > 0);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (refineValue.trim().length > 0 && !refining) onRefine();
    }
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 rounded-pill px-2.5 text-xs text-muted-foreground"
          onClick={() => setUrlsOpen((open) => !open)}
        >
          + Add URLs
        </Button>
        <OutputToggle value={outputFormat} onChange={onOutputFormatChange} />
      </div>
      {urlsOpen && <UrlList urls={urls} onChange={onUrlsChange} />}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={refineValue}
          onChange={(event) => onRefineValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe changes to the schema…"
          className="h-9 min-w-0 flex-1 rounded-card border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-pill"
          disabled={refineValue.trim().length === 0 || refining}
          onClick={onRefine}
        >
          {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Refine ↵
        </Button>
        <Button type="button" size="sm" className="gap-1.5 rounded-pill px-4" disabled={running} onClick={onRun}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {running ? 'Running…' : 'Run agent  ⌘↵'}
        </Button>
      </div>
    </div>
  );
}
