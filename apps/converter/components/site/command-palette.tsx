'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { KIND_LABELS, label, searchPairs, type FormatPair } from '@/lib/formats';

type PageEntry = { kind: 'page'; href: string; title: string; hint: string };
type PairEntry = { kind: 'pair'; href: string; title: string; hint: string; pair: FormatPair };
type Entry = PageEntry | PairEntry;

const PAGES: PageEntry[] = [
  { kind: 'page', href: '/convert', title: 'Convert', hint: 'Open the converter' },
  { kind: 'page', href: '/compress', title: 'Compress', hint: 'Video, audio and image compressors' },
  { kind: 'page', href: '/tools', title: 'All tools', hint: 'Every conversion, grouped by kind' },
  { kind: 'page', href: '/history', title: 'History', hint: 'Jobs from this browser' },
];

function pairHint(p: FormatPair): string {
  if (p.op === 'compress') return `${KIND_LABELS[p.kind]} · compress`;
  return `${KIND_LABELS[p.kind]} · ${label(p.from)} → ${label(p.to)}`;
}

/**
 * ⌘K search over every manifest entry plus the five pages. Opens with no
 * animation (keyboard-initiated, used constantly). Arrow keys move, Enter
 * opens, Esc closes and returns focus to whatever had it.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = q ? PAGES.filter((p) => `${p.title} ${p.hint}`.toLowerCase().includes(q)) : PAGES;
    const pairs: PairEntry[] = searchPairs(query, q ? 12 : 8).map((pair) => ({
      kind: 'pair',
      href: `/convert/${pair.slug}`,
      title: pair.title,
      hint: pairHint(pair),
      pair,
    }));
    return q ? [...pairs, ...pages] : [...pages, ...pairs];
  }, [query]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setActive(0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [entries]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    router.push(entry.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (entries.length ? (i + 1) % entries.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, entries.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(entries[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  const activeId = entries[active] ? `${listId}-${active}` : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-p-ink/20 dark:bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search tools"
        className="relative w-full max-w-lg overflow-hidden rounded-panel border border-p-line bg-p-surface shadow-panel"
      >
        <div className="flex items-center gap-3 border-b border-p-line px-4">
          <Search className="h-4 w-4 shrink-0 text-p-ink-3" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            {...(activeId ? { 'aria-activedescendant': activeId } : {})}
            aria-label="Search converters and pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="mp4 to mp3, heic, compress…"
            autoComplete="off"
            spellCheck={false}
            className="h-14 w-full bg-transparent text-body text-p-ink outline-none placeholder:text-p-ink-3"
          />
          <kbd className="hidden rounded-pill bg-p-code px-1.5 py-0.5 font-mono text-micro text-p-ink-3 sm:inline">
            esc
          </kbd>
        </div>

        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Results"
          className="max-h-[50vh] overflow-y-auto p-2"
        >
          {entries.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-p-ink-3" role="presentation">
              Nothing matches “{query}”. Try a format name, like webm or heic.
            </li>
          )}
          {entries.map((entry, i) => (
            <li
              key={entry.href}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-index={i}
              onMouseMove={() => setActive(i)}
              onClick={() => go(entry)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-card px-3 py-2 ${
                i === active ? 'bg-p-code text-p-ink' : 'text-p-ink-2'
              }`}
            >
              <span className="text-sm font-medium">{entry.title}</span>
              <span className="truncate text-caption text-p-ink-3">{entry.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
