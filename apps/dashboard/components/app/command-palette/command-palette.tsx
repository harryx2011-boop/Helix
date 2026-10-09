'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CircleAlert,
  Clock,
  Cpu,
  Eye,
  FileText,
  KeyRound,
  ListChecks,
  PanelLeft,
  Plug,
  Plus,
  Search,
  SlidersHorizontal,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { endpointById } from '@/lib/catalog';
import { buildNavGroups } from '@/components/app/sidebar-nav';
import { useAppSession } from '@/components/app/session-provider';
import { Skeleton } from '@/components/ui/skeleton';
import { setupPrompt } from '@/lib/setup-prompt';
import { formatRelativeTime } from '@/lib/format';
import { clearRecentRuns, useRecentRuns } from '@/lib/recent-runs';
import { loadInstanceData, type InstanceData, type Section } from '@/lib/instance-data';
import {
  GROUP_LABELS,
  GROUP_ORDER,
  search,
  type DocIndexEntry,
  type PaletteGroup,
  type PaletteItem,
  type PaletteSection,
} from '@/lib/palette-search';
import { loadDocIndex } from './doc-index';
import { closePalette, requestSidebarToggle, setPaletteOpen, togglePalette, usePaletteOpen } from './store';

const PER_GROUP = 6;
const RECENT_SHOWN = 5;
const JOB_LOOKUPS = 5;
const DATA_TIMEOUT_MS = 6000;

type Loadable<T> = { status: 'loading' } | { status: 'ok'; value: T } | { status: 'error'; reason: string };
type Note = { kind: 'loading' } | { kind: 'unavailable'; reason: string } | { kind: 'empty'; reason: string };

function isEditable(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function CommandPalette({ selectedEndpoints }: { selectedEndpoints: readonly string[] }) {
  const open = usePaletteOpen();

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      // Someone typing in a form keeps their Ctrl+K; only the palette's own input may toggle it.
      if (isEditable(e.target) && e.target.dataset.paletteInput === undefined) return;
      e.preventDefault();
      togglePalette();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setPaletteOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-fade-in motion-reduce:animate-none" />
        {/*
         * The portal lands outside the app layout's `dark` / `data-surface`
         * wrapper, so both are repeated here: one for the hsl tokens, one so
         * the global reduced-motion rule reaches the rows inside.
         */}
        <DialogPrimitive.Content
          data-surface="app"
          className="dark fixed left-1/2 top-[8vh] z-50 grid max-h-[min(32rem,calc(92vh-1rem))] w-[calc(100vw-2rem)] min-w-0 max-w-xl -translate-x-1/2 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-card border border-border bg-card text-foreground shadow-lg focus-within:ring-1 focus-within:ring-ring/40 data-[state=open]:animate-slide-up motion-reduce:animate-none sm:top-[12vh] sm:max-h-[min(32rem,calc(88vh-1rem))]"
        >
          <DialogPrimitive.Description className="sr-only">
            Type to search pages, docs, keys, monitors and jobs. Use the arrow keys to move and Enter to open.
          </DialogPrimitive.Description>
          {open && <PaletteBody selectedEndpoints={selectedEndpoints} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteBody({ selectedEndpoints }: { selectedEndpoints: readonly string[] }) {
  const router = useRouter();
  const { apiKey } = useAppSession();
  const recentRuns = useRecentRuns();
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const [docs, setDocs] = React.useState<Loadable<DocIndexEntry[]>>({ status: 'loading' });
  const [data, setData] = React.useState<Loadable<InstanceData>>({ status: 'loading' });
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  React.useEffect(() => {
    let cancelled = false;
    loadDocIndex().then(
      (value) => {
        if (!cancelled) setDocs({ status: 'ok', value });
      },
      (err: unknown) => {
        if (!cancelled) setDocs({ status: 'error', reason: err instanceof Error ? err.message : 'The docs index failed to load.' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // One deadline for every live lookup: a section that has not answered by
  // then reports that, rather than a skeleton that never resolves.
  const jobIds = React.useMemo(
    () => recentRuns.filter((r) => r.endpoint === 'crawl' && r.id).slice(0, JOB_LOOKUPS).map((r) => r.id!),
    [recentRuns],
  );
  React.useEffect(() => {
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), DATA_TIMEOUT_MS);
    loadInstanceData(apiKey, jobIds, controller.signal).then(
      (value) => setData({ status: 'ok', value }),
      (err: unknown) => setData({ status: 'error', reason: err instanceof Error ? err.message : 'Unexpected error.' }),
    );
    return () => {
      window.clearTimeout(deadline);
      controller.abort();
    };
    // Deliberately not re-fetched as recent runs change under it: one fetch per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const go = React.useCallback((href: string) => () => router.push(href), [router]);

  const items = React.useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];

    for (const run of recentRuns) {
      const def = endpointById(run.endpoint);
      if (!def) continue;
      out.push({
        id: `recent:${run.endpoint}:${run.url}`,
        group: 'recent',
        title: run.url,
        subtitle: `${def.name} · ${formatRelativeTime(run.at)}`,
        keywords: [def.name, def.sidebarLabel],
        icon: def.icon,
        run: go(`/app/playground?tab=${run.endpoint}&url=${encodeURIComponent(run.url)}`),
      });
    }
    if (recentRuns.length > 0) {
      out.push({ id: 'action:clear-recent', group: 'actions', title: 'Clear recent runs', keywords: ['history', 'forget'], icon: Trash2, run: clearRecentRuns });
    }

    for (const group of buildNavGroups(selectedEndpoints)) {
      for (const row of group.rows) {
        const tab = row.href.includes('?tab=') ? endpointById(row.href.split('?tab=')[1] ?? '') : undefined;
        out.push({
          id: `nav:${row.href}`,
          group: 'navigate',
          title: tab ? `${row.label} playground` : row.label,
          ...(group.heading ? { subtitle: group.heading } : {}),
          keywords: tab ? [tab.name, tab.productName, tab.tagline, tab.path] : [],
          icon: row.icon,
          run: go(row.href),
        });
      }
    }
    out.push(
      { id: 'nav:settings-providers', group: 'navigate', title: 'AI Providers', subtitle: 'Settings', keywords: ['llm', 'anthropic', 'openai', 'ollama', 'byok', 'api key'], icon: Cpu, run: go('/app/settings#providers') },
      { id: 'nav:settings-instance', group: 'navigate', title: 'Instance Settings', subtitle: 'Settings', keywords: ['engine', 'proxy', 'browser', 'guarded', 'restart'], icon: SlidersHorizontal, run: go('/app/settings#instance') },
      { id: 'nav:settings-preferences', group: 'navigate', title: 'Preferences', subtitle: 'Settings', keywords: ['appearance', 'theme', 'reduce motion', 'default endpoint', 'sidebar'], icon: SlidersHorizontal, run: go('/app/settings#preferences') },
    );

    out.push(
      { id: 'action:create-key', group: 'actions', title: 'Create API key', keywords: ['mint', 'new key', 'generate', 'token'], icon: Plus, run: go('/app/keys?new=1') },
      {
        id: 'action:copy-setup',
        group: 'actions',
        title: 'Copy setup prompt',
        subtitle: 'Paste into a coding agent to wire Helix in',
        keywords: ['agent', 'skill', 'claude', 'cursor', 'clipboard'],
        icon: Terminal,
        run: async () => {
          try {
            await navigator.clipboard.writeText(setupPrompt());
            toast.success('Setup prompt copied.');
          } catch {
            toast.error('Could not write to the clipboard.');
          }
        },
      },
      { id: 'action:connect', group: 'actions', title: 'Set up an agent', keywords: ['mcp', 'connect', 'cli', 'claude code', 'cursor'], icon: Plug, run: go('/app?connect=1') },
      { id: 'action:open-docs', group: 'actions', title: 'Open docs', keywords: ['documentation', 'reference', 'help'], icon: BookOpen, run: go('/docs') },
      { id: 'action:toggle-sidebar', group: 'actions', title: 'Toggle sidebar', keywords: ['collapse', 'expand', 'navigation', 'menu'], icon: PanelLeft, run: requestSidebarToggle },
    );

    if (docs.status === 'ok') {
      for (const entry of docs.value) {
        out.push({
          id: `doc:${entry.path}`,
          group: 'docs',
          title: entry.title,
          subtitle: entry.description || entry.href,
          meta: entry.kind === 'capability' ? 'page' : 'docs',
          keywords: entry.headings,
          body: entry.body,
          icon: entry.kind === 'capability' ? FileText : BookOpen,
          run: go(entry.href),
        });
      }
    }

    if (data.status === 'ok') {
      const { keys, monitors, jobs } = data.value;
      if (keys.status === 'ok') {
        for (const key of keys.items) {
          out.push({
            id: `key:${key.id}`,
            group: 'keys',
            title: key.name,
            subtitle: key.masked,
            meta: key.revoked ? 'revoked' : key.lastUsedAt ? `used ${formatRelativeTime(key.lastUsedAt)}` : 'never used',
            keywords: ['key', 'api key', key.masked],
            icon: KeyRound,
            run: go('/app/keys'),
          });
        }
      }
      if (monitors.status === 'ok') {
        for (const m of monitors.items) {
          out.push({
            id: `monitor:${m.id}`,
            group: 'monitors',
            title: m.url,
            subtitle: `${m.status} · every ${m.schedule}${m.lastChangeAt ? ` · changed ${formatRelativeTime(m.lastChangeAt)}` : ''}`,
            keywords: ['monitor', 'watch', m.id, m.status],
            icon: Eye,
            run: go(`/app/playground?tab=monitor&url=${encodeURIComponent(m.url)}`),
          });
        }
      }
      if (jobs.status === 'ok') {
        for (const job of jobs.items) {
          const progress = job.total !== undefined ? `${job.completed ?? 0}/${job.total}` : undefined;
          out.push({
            id: `job:${job.id}`,
            group: 'jobs',
            title: `${job.type ?? 'job'} ${job.id}`,
            subtitle: job.status,
            ...(progress ? { meta: progress } : {}),
            keywords: ['job', 'crawl', job.status],
            icon: ListChecks,
            run: go('/app/playground?tab=crawl'),
          });
        }
      }
    }

    return out;
  }, [recentRuns, selectedEndpoints, docs, data, go]);

  // Sections that cannot list anything still get a row saying why, but only
  // once there is a query: on an empty palette that would be noise.
  const notes = React.useMemo<Partial<Record<PaletteGroup, Note>>>(() => {
    if (!query.trim()) return {};
    const out: Partial<Record<PaletteGroup, Note>> = {};
    if (docs.status === 'loading') out.docs = { kind: 'loading' };
    else if (docs.status === 'error') out.docs = { kind: 'unavailable', reason: docs.reason };

    const sectionNote = (section: Section<unknown> | undefined, group: PaletteGroup): void => {
      if (data.status === 'loading') out[group] = { kind: 'loading' };
      else if (data.status === 'error') out[group] = { kind: 'unavailable', reason: data.reason };
      else if (section?.status === 'unavailable') out[group] = { kind: 'unavailable', reason: section.reason };
      else if (section?.status === 'empty') out[group] = { kind: 'empty', reason: section.reason };
    };
    const value = data.status === 'ok' ? data.value : undefined;
    sectionNote(value?.keys, 'keys');
    sectionNote(value?.monitors, 'monitors');
    sectionNote(value?.jobs, 'jobs');
    return out;
  }, [query, docs, data]);

  const sections = React.useMemo<PaletteSection[]>(() => {
    if (!query.trim()) {
      const recent = items.filter((i) => i.group === 'recent').slice(0, RECENT_SHOWN);
      return [
        ...(recent.length > 0 ? [{ group: 'recent' as const, items: recent }] : []),
        { group: 'actions' as const, items: items.filter((i) => i.group === 'actions') },
        { group: 'navigate' as const, items: items.filter((i) => i.group === 'navigate') },
      ];
    }
    const matched = search(items, query, PER_GROUP);
    const present = new Set(matched.map((s) => s.group));
    const noteOnly = GROUP_ORDER.filter((g) => notes[g] && !present.has(g)).map((group) => ({ group, items: [] }));
    return [...matched, ...noteOnly];
  }, [items, query, notes]);

  const flat = React.useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const activeItem = flat[activeIndex];

  React.useEffect(() => {
    if (!activeItem) return;
    listRef.current?.querySelector<HTMLElement>(`[data-option-id="${CSS.escape(activeItem.id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeItem]);

  const activate = (item: PaletteItem): void => {
    closePalette();
    void item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      if (flat.length > 0) setActive((activeIndex + 1) % flat.length);
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      if (flat.length > 0) setActive((activeIndex - 1 + flat.length) % flat.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(flat.length - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeItem) activate(activeItem);
    }
  };

  const optionId = (item: PaletteItem): string => `${listId}-${item.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const isPending = Object.values(notes).some((n) => n?.kind === 'loading');
  const nothing = flat.length === 0 && Object.keys(notes).length === 0;

  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <DialogPrimitive.Title className="text-sm font-medium text-foreground">Quick Search</DialogPrimitive.Title>
        <DialogPrimitive.Close className="rounded-card p-1 text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </div>

      <div className="min-w-0 px-3 pt-3">
        <div className="flex min-w-0 items-center gap-2.5 rounded-card border border-border bg-background px-3 focus-within:border-primary/50">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            data-palette-input=""
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
            aria-label="Search pages, docs, keys, monitors and jobs"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search pages and sections…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground caret-primary placeholder:text-muted-foreground focus-visible:outline-none"
          />
        </div>
      </div>

      <div ref={listRef} id={listId} role="listbox" aria-label="Results" aria-busy={isPending} className="min-h-0 overflow-y-auto overflow-x-hidden p-2">
        {nothing && (
          <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
            {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing to show yet. Run something in the playground and it will appear here.'}
          </p>
        )}
        {sections.map((section) => {
          const headingId = `${listId}-${section.group}-label`;
          const note = notes[section.group];
          return (
            <div key={section.group} role="group" aria-labelledby={headingId} className="flex flex-col gap-0.5 pb-2">
              <div id={headingId} role="presentation" className="px-2.5 pb-1 pt-2 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {GROUP_LABELS[section.group]}
              </div>
              {section.items.map((item) => (
                <OptionRow
                  key={item.id}
                  id={optionId(item)}
                  item={item}
                  active={item === activeItem}
                  onHover={() => setActive(flat.indexOf(item))}
                  onSelect={() => activate(item)}
                />
              ))}
              {note?.kind === 'loading' && (
                <div className="flex flex-col gap-1 px-2.5 py-1" aria-label="Loading">
                  <Skeleton className="h-8 w-full rounded-card" />
                  <Skeleton className="h-8 w-2/3 rounded-card" />
                </div>
              )}
              {note?.kind === 'unavailable' && (
                <div className="flex items-start gap-3 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                  <span className="min-w-0">Unavailable: {note.reason}</span>
                </div>
              )}
              {note?.kind === 'empty' && (
                <div className="px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">{note.reason}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><Key>↑</Key><Key>↓</Key> Navigate</span>
        <span className="flex items-center gap-1.5"><Key>Enter</Key> Select</span>
        <span className="flex items-center gap-1.5"><Key>Esc</Key> Close</span>
        {recentRuns.length > 0 && (
          <span className="ml-auto hidden items-center gap-1.5 sm:flex">
            <Clock className="h-3 w-3" aria-hidden="true" /> {recentRuns.length} recent
          </span>
        )}
      </div>
      <div aria-live="polite" className="sr-only">
        {query.trim() ? `${flat.length} results` : ''}
      </div>
    </>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-card border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground">
      {children}
    </kbd>
  );
}

function OptionRow({ id, item, active, onHover, onSelect }: { id: string; item: PaletteItem; active: boolean; onHover: () => void; onSelect: () => void }) {
  const Icon = item.icon;
  return (
    <div
      id={id}
      data-option-id={item.id}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 cursor-default items-center gap-3 rounded-card px-2.5 py-2 text-sm',
        active ? 'bg-secondary text-foreground' : 'text-foreground/80',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} strokeWidth={2} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate leading-tight">{item.title}</span>
        {item.subtitle && <span className="truncate text-xs leading-tight text-muted-foreground">{item.subtitle}</span>}
      </span>
      {item.meta && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{item.meta}</span>}
    </div>
  );
}
