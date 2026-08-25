'use client';

import * as React from 'react';
import { ChevronDown, Code2, Globe, Loader2, Play, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ENDPOINTS, TAB_GROUPS, endpointById } from '@/lib/catalog';
import type { Endpoint } from '@/lib/supabase/types';
import type { InstanceRow } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';

const PLACEHOLDERS: Record<Endpoint, string[]> = {
  scrape: ['https://example.com', 'https://docs.stripe.com/api', 'https://news.ycombinator.com'],
  parse: ['https://example.com/files/report.pdf', 'https://example.com/invoice.docx'],
  search: ['transactional email APIs', 'latest news in AI infrastructure', 'headless browser pricing'],
  map: ['https://example.com', 'https://docs.example.com'],
  crawl: ['https://docs.example.com', 'https://example.com/blog'],
  interact: ['https://example.com/shop', 'https://example.com/login'],
  monitor: ['https://example.com/pricing', 'https://example.com/status'],
};

const RUN_LABEL: Record<Endpoint, string> = {
  scrape: 'Run scrape',
  parse: 'Run parse',
  search: 'Run search',
  map: 'Run map',
  crawl: 'Start crawl',
  interact: 'Run interact',
  monitor: 'Create monitor',
};

interface PromptBoxProps {
  activeId: string;
  onSelectTab: (id: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
  optionsOpen: boolean;
  onToggleOptions: () => void;
  onGetCode: () => void;
  getCodeDisabled: boolean;
  instances: InstanceRow[];
  source: string;
  onSourceChange: (source: string) => void;
}

export function PromptBox({
  activeId,
  onSelectTab,
  value,
  onValueChange,
  onSubmit,
  loading,
  disabled,
  optionsOpen,
  onToggleOptions,
  onGetCode,
  getCodeDisabled,
  instances,
  source,
  onSourceChange,
}: PromptBoxProps) {
  const activeDef = endpointById(activeId) ?? ENDPOINTS[0]!;
  const isSearch = activeDef.id === 'search';
  const placeholders = PLACEHOLDERS[activeDef.id];
  const [placeholderIndex, setPlaceholderIndex] = React.useState(0);
  const [swapping, setSwapping] = React.useState(false);

  React.useEffect(() => {
    setPlaceholderIndex(0);
  }, [activeDef.id]);

  React.useEffect(() => {
    if (value.length > 0) return;
    const interval = setInterval(() => {
      setSwapping(true);
      window.setTimeout(() => {
        setPlaceholderIndex((i) => (i + 1) % placeholders.length);
        setSwapping(false);
      }, 150);
    }, 3200);
    return () => clearInterval(interval);
  }, [placeholders, value]);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const ids = ENDPOINTS.map((e) => e.id);
    const currentIndex = ids.indexOf(activeDef.id as Endpoint);
    const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % ids.length : (currentIndex - 1 + ids.length) % ids.length;
    onSelectTab(ids[nextIndex]!);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!disabled && !loading) onSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3 shadow-sm">
      <style>{`
        @keyframes prompt-placeholder-out { from { opacity: 1; transform: translateY(0); filter: blur(0); } to { opacity: 0; transform: translateY(-4px); filter: blur(2px); } }
        @keyframes prompt-placeholder-in { from { opacity: 0; transform: translateY(4px); filter: blur(2px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }
        .prompt-placeholder-swap { animation: prompt-placeholder-out 150ms ease-in-out both; }
      `}</style>

      <div className="flex items-center gap-3">
        {isSearch ? (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="relative min-w-0 flex-1">
          <input
            type={isSearch ? 'text' : 'url'}
            name={isSearch ? 'query' : 'url'}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={handleKeyDown}
            required
            aria-label={isSearch ? 'Search query' : 'URL'}
            placeholder={placeholders[placeholderIndex]}
            className={cn(
              'w-full min-w-0 border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-foreground',
              swapping && 'prompt-placeholder-swap',
            )}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2.5">
          {TAB_GROUPS.map((group) => {
            const groupEndpoints = ENDPOINTS.filter((e) => e.group === group);
            return (
              <div key={group} className="flex flex-col items-center gap-1">
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{group}</span>
                <div
                  role="tablist"
                  aria-label={group}
                  onKeyDown={handleTabKeyDown}
                  className="flex items-center gap-1 rounded-pill bg-muted p-1"
                >
                  {groupEndpoints.map((def) => {
                    const Icon = def.icon;
                    const active = def.id === activeDef.id;
                    return (
                      <button
                        key={def.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => onSelectTab(def.id)}
                        className={cn(
                          'flex min-h-[32px] items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out',
                          active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {def.name}
                        {def.status === 'coming' && (
                          <span className="rounded-pill bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          aria-expanded={optionsOpen}
          onClick={onToggleOptions}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-150 ease-out', optionsOpen && 'rotate-180')} />
          Options
        </Button>

        <Select value={source} onValueChange={onSourceChange}>
          <SelectTrigger className="h-8 w-auto min-w-[7rem] gap-1.5 text-xs" aria-label="Source">
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Source</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hosted">Hosted</SelectItem>
            {instances.map((instance) => (
              <SelectItem key={instance.id} value={instance.id}>
                {instance.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={onGetCode} disabled={getCodeDisabled}>
            <Code2 className="h-3.5 w-3.5" />
            Get code
          </Button>
          <Button type="button" size="sm" className="gap-1.5" disabled={loading || disabled} onClick={onSubmit}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {RUN_LABEL[activeDef.id]}
          </Button>
        </div>
      </div>
    </div>
  );
}
