'use client';

import * as React from 'react';
import { ArrowRight, Code2, Loader2, Play, Search, SlidersHorizontal } from 'lucide-react';
import type { Format } from '@/lib/api';
import { ENDPOINTS, TAB_GROUPS, endpointById, type EndpointDef } from '@/lib/catalog';
import type { Endpoint } from '@/lib/endpoints';
import { cn } from '@/lib/utils';
import { Segmented, type SegmentedItem } from '@/components/marketing/segmented';
import { FormatPicker, SURFACE, type PromptSurface } from './format-picker';

const PLACEHOLDERS: Record<Endpoint, string[]> = {
  scrape: ['example.com/pricing', 'docs.stripe.com/api', 'news.ycombinator.com'],
  parse: ['example.com/files/report.pdf', 'example.com/invoice.docx'],
  metadata: ['example.com/files/report.pdf', 'example.com/photo.jpg'],
  search: ['transactional email APIs', 'latest news in AI infrastructure', 'headless browser pricing'],
  map: ['example.com', 'docs.example.com'],
  crawl: ['docs.example.com', 'example.com/blog'],
  interact: ['example.com/shop', 'example.com/login'],
  monitor: ['example.com/pricing', 'example.com/status'],
};

export const RUN_LABEL: Record<Endpoint, string> = {
  scrape: 'Start scraping',
  parse: 'Parse file',
  metadata: 'Scan file',
  search: 'Search',
  map: 'Map site',
  crawl: 'Start crawl',
  interact: 'Run actions',
  monitor: 'Create monitor',
};

/** The five tabs the landing shows; the rest live in the Capabilities menu. */
const HERO_TABS: readonly Endpoint[] = ['search', 'map', 'scrape', 'parse', 'crawl'];

/** Endpoints that take a scrape `formats` array, so the Format button applies. */
const FORMAT_TABS: readonly Endpoint[] = ['scrape'];

const SCHEME = /^(https?:\/\/)/i;

function splitScheme(value: string): { scheme: string; rest: string } {
  const match = value.match(SCHEME);
  return match ? { scheme: match[1]!, rest: value.slice(match[1]!.length) } : { scheme: '', rest: value };
}

/**
 * The `/app` shell's dark tokens have no `m-*` values, and `Segmented` is
 * written in them. Rather than a second track component, the track's tokens
 * are re-pointed at the app's own palette for the duration of this subtree.
 */
const APP_TRACK_VARS = {
  '--m-bg': 'hsl(var(--card))',
  '--m-surface': 'hsl(var(--secondary))',
  '--m-ink': 'hsl(var(--foreground))',
  '--m-border-faint': 'hsl(var(--border))',
  '--m-border-muted': 'hsl(var(--border))',
  '--m-border-loud': 'hsl(var(--border))',
  '--violet-100': 'hsl(var(--primary))',
  '--shadow-card-sm': 'none',
} as React.CSSProperties;

function tabsFor(variant: PromptSurface): SegmentedItem<Endpoint>[] {
  const visible: EndpointDef[] = TAB_GROUPS.flatMap((group) => ENDPOINTS.filter((e) => e.group === group));
  return visible
    .filter((e) => variant === 'app' || HERO_TABS.includes(e.id))
    .map((e) => ({ id: e.id, label: e.name, icon: e.icon, group: e.group }));
}

interface PromptBoxProps {
  variant: PromptSurface;
  activeId: string;
  onSelectTab: (id: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
  optionsOpen?: boolean;
  /** Present on the app: the 36px sliders button opens the Options panel. */
  onToggleOptions?: () => void;
  onGetCode?: () => void;
  getCodeDisabled?: boolean;
  /** Present when the caller owns a scrape `formats` array; shows the Format button on scrape. */
  formats?: readonly Format[];
  onFormatsChange?: (formats: Format[]) => void;
  className?: string;
}

/**
 * The one prompt box: group-labelled endpoint track above, then input row,
 * hairline, toolbar. Rendered on the landing (`hero`, light tokens) and on
 * `/app/playground` (`app`, dark tokens). The URL value the parent holds is
 * always the full URL; the `https://` chip is display only.
 */
export function PromptBox({
  variant,
  activeId,
  onSelectTab,
  value,
  onValueChange,
  onSubmit,
  loading,
  disabled,
  optionsOpen = false,
  onToggleOptions,
  onGetCode,
  getCodeDisabled = false,
  formats,
  onFormatsChange,
  className,
}: PromptBoxProps) {
  const s = SURFACE[variant];
  const activeDef = endpointById(activeId) ?? ENDPOINTS[0]!;
  const isSearch = activeDef.id === 'search';
  const placeholders = PLACEHOLDERS[activeDef.id];
  const [placeholderIndex, setPlaceholderIndex] = React.useState(0);
  const [swapping, setSwapping] = React.useState(false);
  const tabs = React.useMemo(() => tabsFor(variant), [variant]);

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

  const { scheme, rest } = isSearch ? { scheme: '', rest: value } : splitScheme(value);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    if (isSearch || next === '' || SCHEME.test(next)) onValueChange(next);
    else onValueChange(`${scheme || 'https://'}${next}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!disabled && !loading) onSubmit();
    }
  };

  const showFormats = formats !== undefined && onFormatsChange !== undefined && FORMAT_TABS.includes(activeDef.id);
  const showLeft = Boolean(onToggleOptions) || showFormats;

  return (
    <div className={cn('flex w-full min-w-0 flex-col items-center gap-4', className)}>
      <style>{`
        @keyframes prompt-placeholder-out { from { opacity: 1; transform: translateY(0); filter: blur(0); } to { opacity: 0; transform: translateY(-4px); filter: blur(2px); } }
        .prompt-placeholder-swap::placeholder { animation: prompt-placeholder-out 150ms ease-in-out both; }
      `}</style>

      <div className="max-w-full overflow-x-auto" style={variant === 'app' ? APP_TRACK_VARS : undefined}>
        <Segmented items={tabs} value={activeDef.id} onChange={onSelectTab} aria-label="Endpoint" />
      </div>

      <div className={cn('w-full min-w-0 overflow-visible rounded-panel', s.box)}>
        <div className={cn('flex min-w-0 items-center gap-2.5 border-b px-4 py-3.5', s.hairline)}>
          {isSearch ? (
            <Search className={cn('h-4 w-4 shrink-0', s.faint)} aria-hidden />
          ) : (
            <span className={cn('shrink-0 rounded-card px-1.5 py-0.5 font-mono text-[12px] leading-tight', s.chip)} aria-hidden>
              {scheme || 'https://'}
            </span>
          )}
          <input
            type="text"
            inputMode={isSearch ? 'search' : 'url'}
            autoComplete="off"
            spellCheck={false}
            name={isSearch ? 'query' : 'url'}
            value={rest}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            aria-label={isSearch ? 'Search query' : 'URL to fetch'}
            placeholder={placeholders[placeholderIndex]}
            className={cn(
              'w-full min-w-0 border-0 bg-transparent p-0 font-mono text-[14px] outline-none placeholder:opacity-40',
              s.ink,
              variant === 'hero' ? 'placeholder:text-m-ink' : 'placeholder:text-foreground',
              swapping && 'prompt-placeholder-swap',
            )}
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2.5">
          {showLeft && (
            <div className="flex min-w-0 items-center gap-2">
              {onToggleOptions && (
                <button
                  type="button"
                  aria-label="Options"
                  aria-expanded={optionsOpen}
                  onClick={onToggleOptions}
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-card transition-colors duration-150 ease-out',
                    s.outlined,
                    optionsOpen && s.accent,
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden />
                </button>
              )}
              {showFormats && <FormatPicker surface={variant} formats={formats} onChange={onFormatsChange} />}
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {onGetCode && (
              <button
                type="button"
                onClick={onGetCode}
                disabled={getCodeDisabled}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-medium transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50',
                  s.secondary,
                )}
              >
                <Code2 className="h-4 w-4" aria-hidden />
                Get code
              </button>
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading || disabled}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-medium transition-[box-shadow,background-color] duration-200 ease-out disabled:pointer-events-none disabled:opacity-50',
                s.primary,
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : variant === 'hero' ? (
                <ArrowRight className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              {RUN_LABEL[activeDef.id]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
