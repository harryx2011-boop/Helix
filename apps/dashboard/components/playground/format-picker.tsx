'use client';

import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, FileText, X } from 'lucide-react';
import type { Format } from '@/lib/api';
import { FORMAT_CARDS, summarizeFormats, toggleFormat, type FormatCard, type FormatIllustration } from '@/lib/formats';
import { cn } from '@/lib/utils';

export type PromptSurface = 'hero' | 'app';

/**
 * Class vocabulary per surface. The hero sits on the light marketing tokens,
 * `/app` on the dark shadcn tokens; the box and picker are one component
 * rendered on both, so every colour is looked up here rather than written
 * inline.
 */
export const SURFACE: Record<
  PromptSurface,
  {
    box: string;
    hairline: string;
    ink: string;
    muted: string;
    faint: string;
    chip: string;
    outlined: string;
    tile: string;
    tileStroke: string;
    tileStrokeStrong: string;
    tileInner: string;
    selected: string;
    accent: string;
    accentFill: string;
    primary: string;
    secondary: string;
    popover: string;
  }
> = {
  hero: {
    box: 'bg-m-surface shadow-card',
    hairline: 'border-m-border-faint',
    ink: 'text-m-ink',
    muted: 'text-m-ink/56',
    faint: 'text-m-ink/40',
    chip: 'border border-m-border-faint bg-m-bg text-m-ink/56',
    outlined: 'border border-m-border-muted bg-m-surface text-m-ink hover:bg-m-bg',
    tile: 'bg-m-bg',
    tileStroke: 'bg-m-illus-muted',
    tileStrokeStrong: 'bg-m-illus-default',
    tileInner: 'bg-m-surface',
    selected: 'border-violet',
    accent: 'text-violet',
    accentFill: 'bg-violet text-white',
    primary: 'bg-violet text-white shadow-btn hover:shadow-btn-hover',
    secondary: 'bg-m-ink/[0.039] text-m-ink hover:bg-m-ink/[0.059]',
    popover: 'border border-m-border-muted bg-m-surface shadow-card',
  },
  app: {
    box: 'border border-border bg-card',
    hairline: 'border-border',
    ink: 'text-foreground',
    muted: 'text-muted-foreground',
    faint: 'text-muted-foreground',
    chip: 'bg-secondary text-muted-foreground',
    outlined: 'border border-border bg-card text-foreground hover:bg-secondary',
    tile: 'bg-secondary',
    tileStroke: 'bg-border',
    tileStrokeStrong: 'bg-muted-foreground',
    tileInner: 'bg-card',
    selected: 'border-primary',
    accent: 'text-primary',
    accentFill: 'bg-primary text-primary-foreground',
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    popover: 'border border-border bg-popover shadow-sm',
  },
};

interface FormatPickerProps {
  surface: PromptSurface;
  formats: readonly Format[];
  onChange: (formats: Format[]) => void;
}

/**
 * The toolbar's `Format: Markdown` button and the card grid it opens. Cards
 * are the API's own format ids (lib/formats.ts); the HTML card carries the
 * cleaned / raw pair as a variant row. Multi-select, order kept stable.
 */
export function FormatPicker({ surface, formats, onChange }: FormatPickerProps) {
  const s = SURFACE[surface];
  const [open, setOpen] = React.useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-card px-3 text-[13px] font-medium transition-colors duration-150 ease-out',
            s.outlined,
          )}
        >
          <FileText className="h-4 w-4" aria-hidden />
          <span>
            <span className={s.muted}>{formats.length > 1 ? 'Formats: ' : 'Format: '}</span>
            {summarizeFormats(formats)}
          </span>
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform duration-150 ease-out', s.muted, open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label="Format"
          data-surface={surface === 'hero' ? 'marketing' : 'app'}
          // The marketing surface rule paints its own background after the utilities; the popover is the white card, not the page.
          style={surface === 'hero' ? { background: 'var(--m-surface)' } : undefined}
          className={cn(
            'z-50 w-[min(calc(100vw-32px),632px)] rounded-panel p-4 outline-none animate-slide-up',
            surface === 'app' && 'dark',
            s.popover,
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className={cn('text-[14px] font-medium', s.ink)}>Format</h3>
            <Popover.Close
              aria-label="Close"
              className={cn('flex h-7 w-7 items-center justify-center rounded-card transition-colors duration-150 ease-out', s.outlined)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Popover.Close>
          </div>

          <div role="group" aria-label="Formats" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FORMAT_CARDS.map((card) => (
              <FormatCardView key={card.id} card={card} surface={surface} formats={formats} onChange={onChange} />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function FormatCardView({
  card,
  surface,
  formats,
  onChange,
}: {
  card: FormatCard;
  surface: PromptSurface;
  formats: readonly Format[];
  onChange: (formats: Format[]) => void;
}) {
  const s = SURFACE[surface];
  const selectedVariants = card.variants.filter((v) => formats.includes(v.id));
  const selected = selectedVariants.length > 0;
  const first = card.variants[0]!;

  const toggleCard = () => {
    if (selected) {
      onChange(selectedVariants.reduce<Format[]>((acc, v) => toggleFormat(acc, v.id), [...formats]));
    } else {
      onChange(toggleFormat(formats, first.id));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={card.label}
        onClick={toggleCard}
        className={cn(
          'relative h-[120px] w-full overflow-hidden rounded-card border transition-colors duration-150 ease-out',
          s.tile,
          selected ? s.selected : 'border-transparent',
        )}
      >
        <Illustration kind={card.illustration} surface={surface} />
        {selected && (
          <span
            className={cn('absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-pill', s.accentFill)}
            aria-hidden
          >
            <Check className="h-3 w-3" strokeWidth={2.5} />
          </span>
        )}
      </button>

      <span className={cn('text-[13px] font-medium leading-tight', s.ink)}>{card.label}</span>

      {card.variants.length > 1 ? (
        <div className="flex items-center gap-1.5 font-mono text-[11px] leading-none">
          {card.variants.map((v, i) => {
            const on = formats.includes(v.id);
            return (
              <React.Fragment key={v.id}>
                {i > 0 && (
                  <span className={s.faint} aria-hidden>
                    ·
                  </span>
                )}
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(toggleFormat(formats, v.id))}
                  className={cn('transition-colors duration-150 ease-out', on ? s.accent : cn(s.muted, 'hover:underline'))}
                >
                  {v.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      ) : card.hint ? (
        <span className={cn('font-mono text-[11px] leading-none', s.faint)}>{card.hint}</span>
      ) : null}
    </div>
  );
}

const LIST_WIDTHS = ['w-10/12', 'w-8/12', 'w-11/12', 'w-7/12'];

/** Schematic drawn with the surface's illustration tokens. Decorative only. */
function Illustration({ kind, surface }: { kind: FormatIllustration; surface: PromptSurface }) {
  const s = SURFACE[surface];
  const line = cn('h-1 rounded-pill', s.tileStroke);
  const lineStrong = cn('h-1.5 rounded-pill', s.tileStrokeStrong);

  switch (kind) {
    case 'page':
      return (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <div className={cn('flex w-[62px] flex-col gap-1.5 rounded-card border p-2.5', s.tileInner, s.hairline)}>
            <span className={cn(lineStrong, 'w-7')} />
            <span className={cn(line, 'w-full')} />
            <span className={cn(line, 'w-10/12')} />
            <span className={cn(line, 'w-full')} />
            <span className={cn(line, 'w-7/12')} />
          </div>
        </div>
      );
    case 'html':
      return (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <pre className={cn('font-mono text-[11px] leading-[1.5]', s.muted)}>{'<html>\n  <body>\n    <h1/>\n  </body>\n</html>'}</pre>
        </div>
      );
    case 'text':
      return (
        <div aria-hidden className="absolute inset-0 flex flex-col justify-center gap-2 px-6">
          <span className={cn(line, 'w-full')} />
          <span className={cn(line, 'w-11/12')} />
          <span className={cn(line, 'w-full')} />
          <span className={cn(line, 'w-9/12')} />
          <span className={cn(line, 'w-5/12')} />
        </div>
      );
    case 'list':
      return (
        <div aria-hidden className="absolute inset-0 flex flex-col justify-center gap-2.5 px-6">
          {LIST_WIDTHS.map((w) => (
            <span key={w} className="flex items-center gap-2">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-pill', s.tileStrokeStrong)} />
              <span className={cn(line, w)} />
            </span>
          ))}
        </div>
      );
    case 'viewport':
      return (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <div className={cn('w-[78px] overflow-hidden rounded-card border', s.hairline, s.tileInner)}>
            <div className={cn('flex items-center gap-1 px-1.5 py-1', s.tile)}>
              <span className={cn('h-1 w-1 rounded-pill', s.tileStrokeStrong)} />
              <span className={cn('h-1 w-1 rounded-pill', s.tileStrokeStrong)} />
              <span className={cn('h-1 w-1 rounded-pill', s.tileStrokeStrong)} />
            </div>
            <div className="flex flex-col gap-1.5 p-2">
              <span className={cn(lineStrong, 'w-6')} />
              <span className={cn(line, 'w-full')} />
              <span className={cn(line, 'w-8/12')} />
            </div>
          </div>
        </div>
      );
    case 'braces':
      return (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-mono text-[34px] leading-none', s.muted)}>{'{ }'}</span>
        </div>
      );
    case 'chunks':
      return (
        <div aria-hidden className="absolute inset-0 flex flex-col justify-center gap-1.5 px-7">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn('flex flex-col gap-1 rounded-card border p-1.5', s.hairline, s.tileInner)}>
              <span className={cn(line, i === 1 ? 'w-8/12' : 'w-full')} />
              <span className={cn(line, 'w-5/12')} />
            </div>
          ))}
        </div>
      );
  }
}
