'use client';

import * as React from 'react';
import { ArrowUp, Link2, Loader2, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UrlList } from './url-list';
import { OutputToggle, type AgentOutputFormat } from './output-toggle';
import { cn } from '@/lib/utils';

interface ComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
  outputFormat: AgentOutputFormat;
  onOutputFormatChange: (format: AgentOutputFormat) => void;
  onSubmit: () => void;
  loading: boolean;
  placeholder: string;
  className?: string;
}

export function Composer({
  value,
  onValueChange,
  urls,
  onUrlsChange,
  outputFormat,
  onOutputFormatChange,
  onSubmit,
  loading,
  placeholder,
  className,
}: ComposerProps) {
  const [urlsOpen, setUrlsOpen] = React.useState(urls.length > 0);
  const disabled = value.trim().length === 0 || loading;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!disabled) onSubmit();
    }
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex h-14 max-w-[720px] items-center gap-2 rounded-pill border border-border bg-card pl-4 pr-2">
        <Sparkles aria-hidden className="h-[18px] w-[18px] shrink-0 text-primary" />
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
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
        <button
          type="button"
          disabled={disabled}
          onClick={onSubmit}
          aria-label="Run agent"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary text-primary-foreground transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
      {urlsOpen && (
        <div className="max-w-[720px] rounded-panel border border-border bg-card p-3">
          <UrlList urls={urls} onChange={onUrlsChange} />
        </div>
      )}
    </div>
  );
}
