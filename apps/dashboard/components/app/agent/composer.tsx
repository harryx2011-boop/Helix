'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FrameTag } from '@/components/app/page-frame';
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
  submitLabel: string;
  loadingLabel: string;
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
  submitLabel,
  loadingLabel,
  className,
}: ComposerProps) {
  const [urlsOpen, setUrlsOpen] = React.useState(urls.length > 0);
  const disabled = value.trim().length === 0 || loading;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!disabled) onSubmit();
    }
  };

  return (
    <div className={cn('flex flex-col gap-3 rounded-panel border border-border bg-card p-4', className)}>
      <textarea
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
      />
      {urlsOpen && <UrlList urls={urls} onChange={onUrlsChange} />}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
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
        <FrameTag>research preview</FrameTag>
        <Button
          type="button"
          size="sm"
          className="ml-auto gap-1.5 rounded-pill px-4"
          disabled={disabled}
          onClick={onSubmit}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {loading ? loadingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}
