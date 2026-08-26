'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_URLS = 10;

export function UrlList({
  urls,
  onChange,
  className,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  className?: string;
}) {
  const addUrl = () => {
    if (urls.length >= MAX_URLS) return;
    onChange([...urls, '']);
  };

  const updateUrl = (index: number, value: string) => {
    const next = [...urls];
    next[index] = value;
    onChange(next);
  };

  const removeUrl = (index: number) => {
    onChange(urls.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {urls.map((url, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(event) => updateUrl(index, event.target.value)}
            placeholder="https://example.com/page"
            aria-label={`URL ${index + 1}`}
            className="h-8 w-full min-w-0 flex-1 rounded-card border border-border bg-transparent px-2.5 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary"
          />
          <button
            type="button"
            onClick={() => removeUrl(index)}
            aria-label={`Remove URL ${index + 1}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {urls.length < MAX_URLS && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit gap-1.5 rounded-pill px-2.5 text-xs text-muted-foreground"
          onClick={addUrl}
        >
          <Plus className="h-3.5 w-3.5" />
          Add URLs
        </Button>
      )}
    </div>
  );
}
