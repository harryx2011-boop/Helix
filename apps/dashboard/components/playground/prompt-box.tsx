'use client';

import * as React from 'react';
import { ArrowRight, Code2, FileText, Loader2, Paperclip, Play, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Format } from '@/lib/api';
import { RUNNABLE, TAB_GROUPS, runnableById, type RunnableEndpointDef } from '@/lib/catalog';
import type { RunnableEndpoint as Endpoint } from '@/lib/endpoints';
import { formatBytes } from '@/lib/format';
import { usePrefersReducedMotion } from '@/lib/preferences';
import { matchCommands, slashQuery } from '@/lib/prompt-commands';
import { uploadAccept } from '@/lib/uploads';
import { cn } from '@/lib/utils';
import { Segmented, type SegmentedItem } from '@/components/shared/segmented';
import { FormatPicker, SURFACE, type PromptSurface } from './format-picker';

const PLACEHOLDERS: Record<Endpoint, string[]> = {
  scrape: ['nextjs.org/docs', 'stripe.com/pricing', 'news.ycombinator.com'],
  parse: ['arxiv.org/pdf/1706.03762', 'sec.gov/files/form10-k.pdf'],
  document: ['arxiv.org/pdf/1706.03762', 'sec.gov/files/form10-k.pdf'],
  extract: ['stripe.com/pricing', 'news.ycombinator.com'],
  screenshot: ['stripe.com/pricing', 'nextjs.org', 'linear.app'],
  metadata: ['upload.wikimedia.org/photo.jpg', 'arxiv.org/pdf/1706.03762'],
  search: ['transactional email APIs', 'headless browser pricing', 'vector databases compared'],
  map: ['nextjs.org', 'docs.anthropic.com'],
  crawl: ['nextjs.org/docs', 'docs.anthropic.com/en/docs'],
  interact: ['news.ycombinator.com/login', 'demo.playwright.dev/todomvc'],
  monitor: ['stripe.com/pricing', 'status.openai.com'],
};

const HOLD_MS = 4200;

/**
 * Rotates through the example URLs, one at a time.
 *
 * Deliberately not a typewriter: a caret redrawing the field every ~50ms reads
 * as flicker in a box someone is trying to read, and it competes with the
 * cursor once they click in. A slow swap makes the same point — here are the
 * kinds of thing this field takes — without moving while anyone looks at it.
 */
function useRotatingPlaceholder(phrases: readonly string[], active: boolean): string {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(0);
  }, [phrases]);

  React.useEffect(() => {
    if (!active || phrases.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % phrases.length), HOLD_MS);
    return () => window.clearInterval(timer);
  }, [phrases, active]);

  return phrases[index % phrases.length] ?? '';
}

export const RUN_LABEL: Record<Endpoint, string> = {
  scrape: 'Start scraping',
  parse: 'Parse file',
  document: 'Run operation',
  extract: 'Extract rows',
  screenshot: 'Take screenshot',
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

/**
 * Only a query can hold a line break. Every other tab takes a URL, which
 * cannot, so there Shift+Enter is swallowed and a pasted newline is dropped;
 * the box still wraps a long URL instead of scrolling it off the right edge.
 */
const MULTILINE_TABS: readonly Endpoint[] = ['search'];

/** Past this the box scrolls rather than growing: eight lines at 20px. */
const MAX_HEIGHT_PX = 160;

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
  const visible: RunnableEndpointDef[] = TAB_GROUPS.flatMap((group) => RUNNABLE.filter((e) => e.group === group));
  return visible
    .filter((e) => variant === 'app' || HERO_TABS.includes(e.id))
    .map((e) => ({ id: e.id, label: e.name, icon: e.icon, group: e.group }));
}

function useObjectUrl(file: File | null): string | undefined {
  const [url, setUrl] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return url;
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
  /**
   * Present on the app: the paperclip and a pasted file both land here, and
   * it is the same file the active tab's form submits. Only tabs listed in
   * `lib/uploads.ts` show the paperclip or accept a paste.
   */
  attachment?: File | null;
  onAttachmentChange?: (file: File | null) => void;
  /** Replaces the per-endpoint run label, for a surface whose submit does not run the request. */
  submitLabel?: string;
  className?: string;
}

/**
 * The one prompt box: group-labelled endpoint track above, then the composer
 * (attachment chip, scheme chip and auto-growing textarea), hairline, toolbar.
 * Rendered on the landing (`hero`, light tokens) and on `/app/playground`
 * (`app`, dark tokens). The URL value the parent holds is always the full
 * URL; the `https://` chip is display only. Enter runs; a leading `/` opens
 * the jump-to-endpoint palette.
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
  attachment = null,
  onAttachmentChange,
  submitLabel,
  className,
}: PromptBoxProps) {
  const s = SURFACE[variant];
  const activeDef = runnableById(activeId) ?? RUNNABLE[0]!;
  const isSearch = activeDef.id === 'search';
  const multiline = MULTILINE_TABS.includes(activeDef.id);
  const placeholders = PLACEHOLDERS[activeDef.id];
  const [focused, setFocused] = React.useState(false);
  const [paletteDismissed, setPaletteDismissed] = React.useState(false);
  const [activeOption, setActiveOption] = React.useState(0);
  const reduceMotion = usePrefersReducedMotion();
  const tabs = React.useMemo(() => tabsFor(variant), [variant]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const hintId = React.useId();

  // Reduced motion gets the first URL as a plain placeholder: the point is to
  // show a real example, and that survives without the animation.
  const rotating = value.length === 0 && !focused && !reduceMotion;
  const placeholder = useRotatingPlaceholder(placeholders, rotating);

  const { scheme, rest } = isSearch ? { scheme: '', rest: value } : splitScheme(value);

  const query = slashQuery(rest);
  const commands = React.useMemo(() => (query === undefined ? [] : matchCommands(tabs, query)), [tabs, query]);
  const paletteOpen = focused && query !== undefined && !paletteDismissed;
  const optionIndex = Math.min(activeOption, Math.max(commands.length - 1, 0));
  const activeCommand = paletteOpen ? commands[optionIndex] : undefined;
  const optionId = (id: string) => `${listId}-${id}`;

  React.useEffect(() => {
    setActiveOption(0);
  }, [query]);

  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [rest]);

  const accept = uploadAccept(activeDef.id);
  const attachable = onAttachmentChange !== undefined && accept !== undefined;
  const thumbnail = useObjectUrl(attachment);

  const pick = (item: SegmentedItem<Endpoint>) => {
    onValueChange('');
    setPaletteDismissed(false);
    onSelectTab(item.id);
  };

  const submit = () => {
    if (!disabled && !loading) onSubmit();
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = event.target.value;
    const next = multiline ? raw : raw.replace(/[\r\n]+/g, '');
    setPaletteDismissed(false);
    if (isSearch || next === '' || SCHEME.test(next)) onValueChange(next);
    else onValueChange(`${scheme || 'https://'}${next}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (paletteOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (commands.length > 0) {
          setActiveOption((optionIndex + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) % commands.length);
        }
        return;
      }
      if (event.key === 'Enter' && activeCommand) {
        event.preventDefault();
        pick(activeCommand);
        return;
      }
      if (event.key === 'Tab' && activeCommand) {
        event.preventDefault();
        pick(activeCommand);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setPaletteDismissed(true);
        return;
      }
    }
    if (event.key !== 'Enter') return;
    if (event.shiftKey && !event.metaKey && !event.ctrlKey) {
      if (!multiline) event.preventDefault();
      return;
    }
    event.preventDefault();
    submit();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!attachable) return;
    if (event.clipboardData.getData('text/plain').trim() !== '') return;
    const file = event.clipboardData.files[0];
    if (!file) return;
    event.preventDefault();
    onAttachmentChange?.(file);
  };

  const showFormats = formats !== undefined && onFormatsChange !== undefined && FORMAT_TABS.includes(activeDef.id);
  const showLeft = Boolean(onToggleOptions) || showFormats || attachable;
  const press = reduceMotion ? undefined : 'active:scale-[0.97]';
  const iconButton = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-card transition-[background-color,transform] duration-fast ease-out';

  return (
    <div className={cn('flex w-full min-w-0 flex-col items-center gap-4', className)}>
      <div className="flex max-w-full flex-col items-center gap-2" style={variant === 'app' ? APP_TRACK_VARS : undefined}>
        <div className="max-w-full overflow-x-auto">
          <Segmented items={tabs} value={activeDef.id} onChange={onSelectTab} aria-label="Endpoint" />
        </div>
        <p
          key={activeDef.id}
          className={cn('max-w-[560px] text-center text-[13px] leading-snug', s.faint, !reduceMotion && 'animate-fade-in')}
        >
          {activeDef.tagline}
        </p>
      </div>

      <div
        aria-busy={loading}
        className={cn(
          'relative z-10 w-full min-w-0 overflow-visible rounded-panel transition-[transform,box-shadow,border-color] duration-200 ease-out-strong',
          s.box,
          s.boxFocus,
          !reduceMotion && 'focus-within:-translate-y-px',
          loading && s.boxBusy,
        )}
      >
        <div className={cn('relative flex min-w-0 flex-col gap-2.5 border-b px-4 py-3.5', s.hairline)}>
          {attachment && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <AttachmentChip surface={variant} file={attachment} thumbnail={thumbnail} onRemove={() => onAttachmentChange?.(null)} />
            </div>
          )}

          <div className="flex min-w-0 items-start gap-2.5">
            {isSearch ? (
              <Search className={cn('mt-0.5 h-4 w-4 shrink-0', s.faint)} aria-hidden />
            ) : (
              <span
                className={cn('inline-flex h-5 shrink-0 items-center rounded-card px-1.5 font-mono text-[12px] leading-none', s.chip)}
                aria-hidden
              >
                {scheme || 'https://'}
              </span>
            )}
            <textarea
              ref={textareaRef}
              rows={1}
              inputMode={isSearch ? 'search' : 'url'}
              autoComplete="off"
              spellCheck={false}
              name={isSearch ? 'query' : 'url'}
              value={rest}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              role="combobox"
              aria-label={isSearch ? 'Search query' : 'URL to fetch'}
              aria-describedby={hintId}
              aria-autocomplete="list"
              aria-expanded={paletteOpen}
              aria-controls={paletteOpen ? listId : undefined}
              aria-activedescendant={activeCommand ? optionId(activeCommand.id) : undefined}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              style={{ maxHeight: MAX_HEIGHT_PX }}
              className={cn(
                'block w-full min-w-0 resize-none border-0 bg-transparent p-0 font-mono text-[14px] leading-5 outline-none placeholder:opacity-40',
                s.ink,
                variant === 'hero' ? 'placeholder:text-m-ink' : 'placeholder:text-foreground',
              )}
            />
          </div>

          {loading && (
            <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden rounded-pill" aria-hidden>
              <div className={cn('h-full', s.bar, reduceMotion ? 'w-full' : 'w-1/3 animate-progress-slide')} />
            </div>
          )}

          {paletteOpen && (
            <div
              id={listId}
              role="listbox"
              aria-label="Jump to endpoint"
              onMouseDown={(event) => event.preventDefault()}
              className={cn('absolute left-3 top-full z-20 mt-1 w-[min(300px,calc(100%-24px))] rounded-panel p-1.5', s.popover)}
            >
              <div role="presentation" className={cn('px-2.5 pb-1 pt-1.5 font-mono text-[11px] uppercase tracking-wide', s.faint)}>
                Jump To
              </div>
              {commands.length === 0 ? (
                <p role="option" aria-selected={false} aria-disabled="true" className={cn('px-2.5 pb-2 pt-1 text-[13px]', s.muted)}>
                  Nothing matches /{query}.
                </p>
              ) : (
                commands.map((item, index) => {
                  const Icon = item.icon;
                  const active = index === optionIndex;
                  return (
                    <div
                      key={item.id}
                      id={optionId(item.id)}
                      role="option"
                      aria-selected={active}
                      onMouseMove={() => setActiveOption(index)}
                      onClick={() => pick(item)}
                      className={cn(
                        'flex min-w-0 cursor-default items-center gap-2.5 rounded-card px-2.5 py-1.5 text-[13px]',
                        active ? s.optionActive : s.option,
                      )}
                    >
                      {Icon && <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? s.accent : s.faint)} aria-hidden />}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className={cn('shrink-0 font-mono text-[11px]', s.faint)}>{runnableById(item.id)?.path}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <p id={hintId} className="sr-only">
          Press Enter to run{multiline ? ', Shift and Enter for a new line' : ''}. Type a slash to jump to another endpoint.
        </p>
        <div aria-live="polite" className="sr-only">
          {paletteOpen ? `${commands.length} endpoints match` : ''}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2.5">
          {showLeft && (
            <div className="flex min-w-0 items-center gap-2">
              {attachable && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={(event) => {
                      onAttachmentChange?.(event.target.files?.[0] ?? null);
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Attach a file"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(iconButton, s.outlined, attachment && s.accent, press)}
                  >
                    <Paperclip className="h-4 w-4" aria-hidden />
                  </button>
                </>
              )}
              {onToggleOptions && (
                <button
                  type="button"
                  aria-label="Options"
                  aria-expanded={optionsOpen}
                  onClick={onToggleOptions}
                  className={cn(iconButton, s.outlined, optionsOpen && s.accent, press)}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden />
                </button>
              )}
              {showFormats && <FormatPicker surface={variant} formats={formats} onChange={onFormatsChange} />}
            </div>
          )}

          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
            <span
              aria-hidden
              className={cn(
                'hidden items-center gap-1.5 text-[11px] transition-opacity duration-fast ease-out md:flex',
                s.faint,
                focused || value.length > 0 ? 'opacity-100' : 'opacity-0',
              )}
            >
              <Kbd surface={variant}>Enter</Kbd> to run
              {multiline && (
                <>
                  <span className="mx-0.5">·</span>
                  <Kbd surface={variant}>Shift</Kbd>
                  <Kbd surface={variant}>Enter</Kbd> new line
                </>
              )}
            </span>
            {onGetCode && (
              <button
                type="button"
                onClick={onGetCode}
                disabled={getCodeDisabled}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-medium transition-[background-color,transform] duration-fast ease-out disabled:pointer-events-none disabled:opacity-50',
                  s.secondary,
                  press,
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
                'flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-medium transition-[box-shadow,background-color,transform] duration-fast ease-out disabled:pointer-events-none disabled:opacity-50',
                s.primary,
                press,
              )}
            >
              <span key={loading ? 'busy' : 'idle'} className={cn('flex h-4 w-4 items-center justify-center', !reduceMotion && 'animate-fade-in')}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : variant === 'hero' ? (
                  <ArrowRight className="h-4 w-4" aria-hidden />
                ) : (
                  <Play className="h-4 w-4" aria-hidden />
                )}
              </span>
              <span key={activeDef.id} className={cn(!reduceMotion && 'animate-fade-in')}>
                {submitLabel ?? RUN_LABEL[activeDef.id]}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kbd({ surface, children }: { surface: PromptSurface; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.5rem] items-center justify-center rounded-card border px-1.5 py-0.5 font-mono text-[10px] leading-none',
        SURFACE[surface].kbd,
      )}
    >
      {children}
    </kbd>
  );
}

function AttachmentChip({
  surface,
  file,
  thumbnail,
  onRemove,
}: {
  surface: PromptSurface;
  file: File;
  thumbnail: string | undefined;
  onRemove: () => void;
}) {
  const s = SURFACE[surface];
  return (
    <div className={cn('flex h-8 max-w-full min-w-0 items-center gap-2 rounded-card pl-1 pr-1 text-[12px]', s.chip)}>
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- object URL for a file still in memory, nothing Next can optimise
        <img src={thumbnail} alt="" className="h-6 w-6 shrink-0 rounded-card object-cover" />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
          <FileText className="h-3.5 w-3.5" />
        </span>
      )}
      <span className={cn('min-w-0 truncate font-medium', s.ink)}>{file.name}</span>
      <span className="shrink-0 font-mono text-[11px]">{formatBytes(file.size)}</span>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-card transition-colors duration-fast ease-out', s.ghost)}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
