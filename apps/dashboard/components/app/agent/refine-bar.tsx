'use client';

import * as React from 'react';
import { Link2, Loader2, Play, Wand2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!running) onRun();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (refineValue.trim().length > 0 && !refining) onRefine();
    }
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex h-14 min-w-0 flex-1 items-center gap-2 rounded-pill border border-border bg-card px-4">
          <Wand2 aria-hidden className="h-[18px] w-[18px] shrink-0 text-primary" />
          <input
            value={refineValue}
            onChange={(event) => onRefineValueChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe changes to the schema"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={urlsOpen}
                aria-label="Add URLs"
                onClick={() => setUrlsOpen((open) => !open)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground"
              >
                <Link2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Add URLs</TooltipContent>
          </Tooltip>
          <OutputToggle value={outputFormat} onChange={onOutputFormatChange} />
          {refining && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        <button
          type="button"
          disabled={running}
          onClick={onRun}
          className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-pill bg-primary px-5 text-[15px] font-medium text-primary-foreground transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-40"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Running…' : 'Run agent'}
          {!running && <span className="font-mono text-[11px] text-primary-foreground/70">⌘↵</span>}
        </button>
      </div>
      {urlsOpen && (
        <div className="rounded-panel border border-border bg-card p-3">
          <UrlList urls={urls} onChange={onUrlsChange} />
        </div>
      )}
    </div>
  );
}
