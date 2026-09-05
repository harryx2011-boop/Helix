'use client';

import * as React from 'react';
import { ChevronDown, Search, SearchX } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface CanvasToolParam {
  name: string;
  required: boolean;
  description: string;
}

export interface CanvasTool {
  name: string;
  group: string;
  module: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
  confirm: boolean;
  params: CanvasToolParam[];
}

type Access = 'all' | 'read' | 'write';

const ACCESS: readonly { id: Access; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'read', label: 'Read' },
  { id: 'write', label: 'Write' },
];

const chipClass = (active: boolean) =>
  cn(
    'min-h-8 rounded-card px-2.5 text-[13px] font-medium transition-colors duration-150 ease-out',
    active
      ? 'bg-violet-12 text-violet'
      : 'bg-m-ink/[0.039] text-m-ink/72 hover:bg-m-ink/[0.059] hover:text-m-ink',
  );

/**
 * The 100-tool explorer: search, group and access filters, all mirrored into the
 * URL so a filtered view is linkable, plus `#tool_name` deep links that open and
 * scroll to one tool.
 *
 * `tools` is fetched by the page rather than imported, because the JSON is ~89KB
 * and importing it into a client component would put all of it in the bundle.
 */
export function CanvasToolsExplorer({ tools }: { tools: CanvasTool[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.get('q') ?? '';
  const group = searchParams.get('group') ?? '';
  const access = (searchParams.get('access') as Access) ?? 'all';

  const [input, setInput] = React.useState(query);
  const [synced, setSynced] = React.useState(query);
  const detailsRefs = React.useRef(new Map<string, HTMLDetailsElement>());
  const openedHash = React.useRef(false);

  // Keep the uncontrolled-feeling input honest when the URL changes underneath it
  // (back button, a cleared filter) without losing what is being typed.
  if (query !== synced) {
    setSynced(query);
    setInput(query);
  }

  const groups = React.useMemo(() => {
    const seen: string[] = [];
    for (const t of tools) if (!seen.includes(t.group)) seen.push(t.group);
    return seen;
  }, [tools]);

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tools) m.set(t.group, (m.get(t.group) ?? 0) + 1);
    return m;
  }, [tools]);

  const update = React.useCallback(
    (next: { q?: string; group?: string; access?: Access }) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { q: query, group, access, ...next };
      if (merged.q) params.set('q', merged.q);
      else params.delete('q');
      if (merged.group) params.set('group', merged.group);
      else params.delete('group');
      if (merged.access && merged.access !== 'all') params.set('access', merged.access);
      else params.delete('access');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [group, access, query, pathname, router, searchParams],
  );

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      if (input !== query) update({ q: input });
    }, 120);
    return () => window.clearTimeout(id);
    // `update` and `query` are intentionally omitted: including them restarts the
    // debounce on every keystroke's own URL write and the input stutters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((t) => {
      if (group && t.group !== group) return false;
      if (access === 'read' && !t.readOnly) return false;
      if (access === 'write' && t.readOnly) return false;
      if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tools, query, group, access]);

  const grouped = React.useMemo(() => {
    const m = new Map<string, CanvasTool[]>();
    for (const t of filtered) {
      const list = m.get(t.group);
      if (list) list.push(t);
      else m.set(t.group, [t]);
    }
    return groups.filter((g) => m.has(g)).map((g) => ({ group: g, items: m.get(g)! }));
  }, [filtered, groups]);

  React.useEffect(() => {
    if (openedHash.current) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    if (!tools.some((t) => t.name === hash)) return;
    const el = detailsRefs.current.get(hash);
    if (!el) return;
    openedHash.current = true;
    el.open = true;
    el.scrollIntoView({ block: 'center' });
  }, [tools, filtered]);

  return (
    <div>
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="canvas-tool-search" className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-m-ink/48">
            Search tools
          </label>
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-m-ink/40" strokeWidth={1.5} aria-hidden />
            <input
              id="canvas-tool-search"
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="grade, discussion, rubric…"
              className="min-h-9 w-full rounded-card border border-m-border-faint bg-transparent py-2 pl-9 pr-3 text-[14px] text-m-ink transition-colors duration-150 ease-out placeholder:text-m-ink/40 hover:border-m-ink/24 focus-visible:border-violet focus-visible:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by group">
          <button type="button" aria-pressed={group === ''} onClick={() => update({ group: '' })} className={chipClass(group === '')}>
            All <span className="font-mono text-[11px] opacity-56">{tools.length}</span>
          </button>
          {groups.map((g) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => update({ group: group === g ? '' : g })} className={chipClass(group === g)}>
              {g} <span className="font-mono text-[11px] opacity-56">{counts.get(g)}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by access">
          {ACCESS.map((a) => (
            <button key={a.id} type="button" aria-pressed={access === a.id} onClick={() => update({ access: a.id })} className={chipClass(access === a.id)}>
              {a.label}
            </button>
          ))}
          <p className="ml-auto font-mono text-[12px] text-m-ink/48" aria-live="polite">
            {filtered.length} of {tools.length}
          </p>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="mt-10 rounded-panel border border-m-border-faint py-16 text-center">
          <SearchX className="mx-auto h-6 w-6 text-m-ink/32" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-[14px] text-m-ink/72">No tool matches those filters.</p>
          <button
            type="button"
            onClick={() => {
              setInput('');
              router.replace(pathname, { scroll: false });
            }}
            className="mt-4 text-[13px] font-medium text-violet hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {grouped.map(({ group: g, items }) => (
            <section key={g}>
              <h2 className="text-[18px] font-medium leading-tight text-m-ink">{g}</h2>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-m-ink/48">
                {items.length} {items.length === 1 ? 'tool' : 'tools'}
              </p>
              <div className="mt-4 overflow-hidden rounded-panel border border-m-border-faint">
                {items.map((tool) => (
                  <details
                    key={tool.name}
                    id={tool.name}
                    ref={(el) => {
                      if (el) detailsRefs.current.set(tool.name, el);
                      else detailsRefs.current.delete(tool.name);
                    }}
                    className="group scroll-mt-24 border-b border-m-border-faint last:border-b-0"
                  >
                    <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-m-ink/[0.028]">
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-m-ink/40 transition-transform duration-150 ease-out group-open:rotate-180" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-[13px] text-m-ink">{tool.name}</code>
                          {tool.readOnly ? (
                            <span className="rounded-pill bg-m-ink/[0.059] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-m-ink/56">read</span>
                          ) : (
                            <span className="rounded-pill bg-violet-12 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-violet">write</span>
                          )}
                          {tool.confirm && (
                            <span className="rounded-pill bg-m-ink/[0.059] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-m-ink/56">confirm</span>
                          )}
                          {tool.destructive && (
                            <span className="rounded-pill bg-m-ink/[0.059] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-m-ink/56">destructive</span>
                          )}
                        </span>
                        <span className="mt-1 block text-[13px] leading-snug text-m-ink/56">{tool.description}</span>
                      </span>
                    </summary>
                    {tool.params.length > 0 && (
                      <div className="border-t border-m-border-faint bg-m-ink/[0.016] px-4 py-3 pl-11">
                        <dl className="space-y-2.5">
                          {tool.params.map((p) => (
                            <div key={p.name} className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-4">
                              <dt className="flex items-baseline gap-2">
                                <code className="font-mono text-[12px] text-m-ink">{p.name}</code>
                                {p.required && <span className="font-mono text-[10px] uppercase tracking-wide text-violet">req</span>}
                              </dt>
                              <dd className="text-[13px] leading-snug text-m-ink/56">{p.description}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
