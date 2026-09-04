'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import type { FileKind } from '@/lib/jobs/types';
import { OUTPUT_TARGETS } from '@/lib/formats';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// Likely targets first; `all` feeds the searchable popover. Move to
// lib/formats.ts once the /convert/[pair] manifest lands.
/** The API's accepted targets, so the picker can never offer a 400. */
export const TARGETS = OUTPUT_TARGETS;

const LABEL: Record<string, string> = {
  mp4: 'MP4 · H.264 video',
  webm: 'WebM · VP9 video',
  mov: 'MOV · QuickTime',
  mkv: 'MKV · Matroska',
  avi: 'AVI',
  m4v: 'M4V · Apple video',
  mpg: 'MPG · MPEG-2',
  ts: 'TS · MPEG transport stream',
  '3gp': '3GP · mobile video',
  gif: 'GIF · animated',
  apng: 'APNG · animated PNG',
  mp3: 'MP3',
  m4a: 'M4A · AAC audio',
  aac: 'AAC',
  wav: 'WAV · lossless',
  flac: 'FLAC · lossless',
  ogg: 'OGG · Vorbis',
  opus: 'Opus',
  aiff: 'AIFF · lossless',
  wma: 'WMA',
  jpg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  avif: 'AVIF',
  heic: 'HEIC',
  tiff: 'TIFF',
  bmp: 'BMP',
};

type Props = {
  kind: FileKind;
  value: string;
  onChange: (to: string) => void;
  labelId: string;
};

export function FormatPicker({ kind, value, onChange, labelId }: Props) {
  const targets = TARGETS[kind];
  const row = targets.likely.includes(value) ? targets.likely : [...targets.likely, value];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets.all;
    return targets.all.filter((f) => f.includes(q) || (LABEL[f] ?? '').toLowerCase().includes(q));
  }, [query, targets]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, options.indexOf(value)));
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onPointer);
    };
    // Only re-run when the popover opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, options.length - 1)));
  }, [options]);

  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`${listId}-${activeIndex}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, listId]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (restoreFocus) triggerRef.current?.focus();
  };

  const choose = (f: string) => {
    onChange(f);
    close(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter': {
        e.preventDefault();
        const f = options[activeIndex];
        if (f) choose(f);
        break;
      }
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  return (
    <div className="relative">
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {row.map((f) => {
          const selected = f === value;
          return (
            <PillButton
              key={f}
              type="button"
              size="md"
              variant={selected ? 'primary' : 'secondary'}
              aria-pressed={selected}
              onClick={() => onChange(f)}
            >
              <span className="font-mono uppercase">{f}</span>
            </PillButton>
          );
        })}
        <PillButton
          ref={triggerRef}
          type="button"
          size="md"
          variant="ghost"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => (open ? close(true) : setOpen(true))}
        >
          More
          <ChevronDown aria-hidden="true" className={cx('h-4 w-4 transition-transform duration-150', open && 'rotate-180')} />
        </PillButton>
      </div>

      {open && (
        <div
          ref={popRef}
          className="absolute left-0 top-full z-20 mt-2 w-72 origin-top-left animate-fade-up rounded-card border border-p-line bg-p-surface p-2 shadow-card"
          onKeyDown={onKeyDown}
        >
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-p-ink-3" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={options.length ? `${listId}-${activeIndex}` : undefined}
              aria-label="Search formats"
              placeholder="Type a format"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              className="h-11 w-full rounded-pill border border-p-line bg-p-bg pl-9 pr-3 text-sm text-p-ink placeholder:text-p-ink-3"
            />
          </div>
          <ul id={listId} role="listbox" aria-labelledby={labelId} className="mt-2 max-h-64 overflow-auto">
            {options.length === 0 && <li className="px-3 py-2 text-sm text-p-ink-3">No format matches.</li>}
            {options.map((f, i) => {
              const selected = f === value;
              const active = i === activeIndex;
              return (
                <li
                  key={f}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  onPointerMove={() => setActiveIndex(i)}
                  onClick={() => choose(f)}
                  className={cx(
                    'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-card px-3 text-sm',
                    active ? 'bg-p-code text-p-ink' : 'text-p-ink-2',
                  )}
                >
                  <span className={cx('font-mono uppercase', selected && 'font-semibold text-p-ink')}>{f}</span>
                  <span className="truncate text-xs text-p-ink-3">{LABEL[f] ?? ''}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
