'use client';

import * as React from 'react';
import { RotateCw } from 'lucide-react';
import { CharChart } from '@/components/app/char-chart';
import { PageFrame, FrameRow, FrameHeading, FrameCells, FrameTag } from '@/components/app/page-frame';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VulcanFlame } from '@/components/vulcan/vulcan-flame';
import type { VulcanSummary } from '@/lib/vulcan/aggregate';
import { cn } from '@/lib/utils';

type Window = '7' | '30' | '90' | 'all';
const WINDOWS: { value: Window; label: string }[] = [
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: 'all', label: 'All' },
];

type State = { kind: 'loading' } | { kind: 'ready'; data: VulcanSummary } | { kind: 'error'; message: string };

function useSummary(window: Window, nonce: number): State {
  const [state, setState] = React.useState<State>({ kind: 'loading' });
  React.useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetch(`/api/vulcan/summary?days=${window}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Summary request failed (${res.status}).`);
        return (await res.json()) as VulcanSummary;
      })
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: err instanceof Error ? err.message : 'Could not read transcripts.' });
      });
    return () => {
      cancelled = true;
    };
  }, [window, nonce]);
  return state;
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function usd(n: number): string {
  if (n >= 1000) return `$${whole.format(n)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function tokens(n: number): string {
  return compact.format(n);
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${((part / total) * 100).toFixed(part / total < 0.1 ? 1 : 0)}%`;
}

function dayLabel(day: string): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Days with no requests are drawn as zero so the x-axis stays honest about gaps. */
function fillDays(burn: VulcanSummary['burn']): VulcanSummary['burn'] {
  if (burn.length === 0) return [];
  const byDay = new Map(burn.map((b) => [b.day, b]));
  const sorted = [...byDay.keys()].sort();
  const out: VulcanSummary['burn'] = [];
  const cursor = new Date(sorted[0] ?? '');
  const end = new Date(sorted[sorted.length - 1] ?? '');
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(byDay.get(key) ?? { day: key, cost: 0, requests: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function Bar({ ratio, className }: { ratio: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-[1px] bg-foreground/10">
      <div className={cn('h-full rounded-[1px] bg-foreground/80', className)} style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
    </div>
  );
}

/** Scaled between the session's own low and high so growth reads even when every request carries a large prefix. */
function Sparkline({ values }: { values: number[] }) {
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${23 - ((v - lo) / span) * 22}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full text-primary" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="px-6 py-5">
      <div className="text-[26px] font-medium leading-none tracking-tight tabular-nums text-foreground">{value}</div>
      <div className="mt-2 text-[13px] leading-snug text-muted-foreground">{label}</div>
      {note && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground/70">{note}</div>}
    </div>
  );
}

function CellHeading({ title, tag }: { title: string; tag?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[15px] font-medium leading-tight tracking-tight text-foreground">{title}</h3>
      {tag}
    </div>
  );
}

function WindowPicker({ value, onChange }: { value: Window; onChange: (w: Window) => void }) {
  return (
    <div role="radiogroup" aria-label="Time window" className="flex rounded-card border border-border p-0.5">
      {WINDOWS.map((w) => (
        <button
          key={w.value}
          type="button"
          role="radio"
          aria-checked={value === w.value}
          onClick={() => onChange(w.value)}
          className={cn(
            'rounded-[4px] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === w.value ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

function Header({ window, onWindow, onRefresh, busy }: { window: Window; onWindow: (w: Window) => void; onRefresh: () => void; busy: boolean }) {
  return (
    <FrameRow>
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <VulcanFlame animated className="h-9 w-9" />
          <div className="min-w-0">
            <h2 className="text-[17px] font-medium leading-tight tracking-tight text-foreground">Vulcan</h2>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">Claude Code spend, read from the transcripts on this machine.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <WindowPicker value={window} onChange={onWindow} />
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy} aria-label="Reload transcripts">
            <RotateCw className={cn('h-3.5 w-3.5', busy && 'animate-spin motion-reduce:animate-none')} />
          </Button>
        </div>
      </div>
    </FrameRow>
  );
}

function LoadingRows() {
  return (
    <>
      <FrameRow>
        <FrameCells cols={4}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-6 py-5">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="mt-3 h-3.5 w-32" />
            </div>
          ))}
        </FrameCells>
      </FrameRow>
      <FrameRow flush>
        <div className="px-6 py-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      </FrameRow>
    </>
  );
}

function Message({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <FrameRow flush>
      <div className="flex flex-col items-start gap-5 px-6 py-10">
        <div className="max-w-[560px]">
          <h2 className="text-[17px] font-medium leading-tight tracking-tight text-foreground">{title}</h2>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{body}</p>
        </div>
        {action}
      </div>
    </FrameRow>
  );
}

function Panels({ data }: { data: VulcanSummary }) {
  const { totals, tokens: t } = data;
  const contextTotal = t.input + t.cacheRead + t.cacheCreate5m + t.cacheCreate1h;
  const cacheWrites = t.cacheCreate5m + t.cacheCreate1h;
  const burn = React.useMemo(() => fillDays(data.burn), [data.burn]);
  const first = burn[0];
  const last = burn[burn.length - 1];
  const topModel = data.models[0]?.cost ?? 0;
  const topTool = data.tools[0]?.count ?? 0;

  const tokenRows: { label: string; value: number; className: string }[] = [
    { label: 'Cache read', value: t.cacheRead, className: 'bg-foreground/35' },
    { label: 'Cache write', value: cacheWrites, className: 'bg-foreground/60' },
    { label: 'Fresh input', value: t.input, className: 'bg-foreground/85' },
    { label: 'Output', value: t.output, className: 'bg-primary' },
  ];
  const tokenTotal = contextTotal + t.output;

  return (
    <>
      <FrameRow>
        <FrameCells cols={4}>
          <Stat value={usd(totals.cost)} label="Spend" {...(totals.estimatedRequests > 0 ? { note: `${whole.format(totals.estimatedRequests)} requests estimated` } : {})} />
          <Stat value={whole.format(totals.requests)} label="Requests" note={`${whole.format(data.files)} transcript files`} />
          <Stat value={whole.format(totals.sessions)} label="Sessions" />
          <Stat value={pct(t.cacheRead, contextTotal)} label="Context served from cache" note={`${tokens(t.cacheRead)} of ${tokens(contextTotal)} tokens`} />
        </FrameCells>
      </FrameRow>

      <FrameRow>
        <FrameHeading title="Spend per day" {...(first && last ? { description: `${dayLabel(first.day)} to ${dayLabel(last.day)}` } : {})} />
        <div className="px-6 pb-6">
          {burn.length ? (
            <CharChart series={[{ label: 'Spend', values: burn.map((b) => b.cost) }]} labels={burn.map((b) => dayLabel(b.day))} formatKind="usd" height={10} />
          ) : (
            <p className="text-[13px] text-muted-foreground">No requests in this window.</p>
          )}
        </div>
      </FrameRow>

      <FrameRow>
        <FrameCells cols={2}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Cost by model" />
            <ul className="flex flex-col gap-3">
              {data.models.map((m) => (
                <li key={m.model} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-baseline gap-2 truncate">
                      <span className="truncate font-mono text-foreground">{m.model}</span>
                      {m.estimated && <FrameTag>estimated</FrameTag>}
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground">{usd(m.cost)}</span>
                  </div>
                  <Bar ratio={topModel ? m.cost / topModel : 0} />
                  <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                    <span>{whole.format(m.requests)} requests</span>
                    <span>{tokens(m.tokens)} tokens</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Tokens" tag={<span className="font-mono text-[11px] text-muted-foreground">{tokens(tokenTotal)} total</span>} />
            <div className="flex h-2 w-full overflow-hidden rounded-[1px] bg-foreground/10">
              {tokenRows.map((r) => (
                <div key={r.label} className={r.className} style={{ width: `${tokenTotal ? (r.value / tokenTotal) * 100 : 0}%` }} />
              ))}
            </div>
            <ul className="flex flex-col gap-2">
              {tokenRows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className={cn('h-2 w-2 rounded-[1px]', r.className)} aria-hidden />
                    {r.label}
                  </span>
                  <span className="flex items-baseline gap-3 tabular-nums">
                    <span className="font-mono text-[11px] text-muted-foreground">{pct(r.value, tokenTotal)}</span>
                    <span className="text-foreground">{tokens(r.value)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </FrameCells>
      </FrameRow>

      <FrameRow>
        <FrameCells cols={2}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Cache writes by TTL" tag={<span className="font-mono text-[11px] text-muted-foreground">{tokens(cacheWrites)} written</span>} />
            <ul className="flex flex-col gap-3">
              {[
                { label: '5 minute', note: '1.25× input rate', value: t.cacheCreate5m, className: 'bg-foreground/60' },
                { label: '1 hour', note: '2× input rate', value: t.cacheCreate1h, className: 'bg-primary' },
              ].map((r) => (
                <li key={r.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="flex items-baseline gap-2">
                      <span className="text-foreground">{r.label}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{r.note}</span>
                    </span>
                    <span className="tabular-nums text-foreground">{tokens(r.value)}</span>
                  </div>
                  <Bar ratio={cacheWrites ? r.value / cacheWrites : 0} className={r.className} />
                </li>
              ))}
            </ul>
            <p className="text-[13px] leading-snug text-muted-foreground">
              {cacheWrites ? `${pct(t.cacheCreate1h, cacheWrites)} of written tokens took the 1-hour TTL.` : 'No cache writes recorded.'}
            </p>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Tool calls" />
            <ul className="flex flex-col gap-2.5">
              {data.tools.map((tool) => (
                <li key={tool.name} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[13px]">
                  <span className="truncate font-mono text-foreground">{tool.name}</span>
                  <Bar ratio={topTool ? tool.count / topTool : 0} />
                  <span className="tabular-nums text-foreground">{whole.format(tool.count)}</span>
                </li>
              ))}
              {data.tools.length === 0 && <li className="text-[13px] text-muted-foreground">No tool calls in this window.</li>}
            </ul>
          </div>
        </FrameCells>
      </FrameRow>

      <FrameRow flush>
        <FrameHeading title="Context per session" description="Input plus cache tokens on each request, for the most recent sessions. Subagent requests are excluded from the line." />
        <ul className="flex flex-col divide-y divide-border">
          {data.sessions.map((s) => (
            <li key={s.sessionId} className="grid grid-cols-1 gap-3 px-6 py-3 md:grid-cols-[minmax(0,14rem)_1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="truncate font-mono text-[13px] text-foreground">{s.project.replace(/^[A-Za-z]--/, '')}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {s.sessionId.slice(0, 8)}
                </div>
              </div>
              <Sparkline values={s.context} />
              <div className="flex gap-4 font-mono text-[11px] text-muted-foreground md:flex-col md:items-end md:gap-0.5">
                <span className="text-foreground">{tokens(s.context[s.context.length - 1] ?? 0)} last</span>
                <span>{whole.format(s.requests)} requests · {usd(s.cost)}</span>
              </div>
            </li>
          ))}
          {data.sessions.length === 0 && <li className="px-6 py-4 text-[13px] text-muted-foreground">No sessions with more than one request in this window.</li>}
        </ul>
      </FrameRow>
    </>
  );
}

export function VulcanClient() {
  const [window, setWindow] = React.useState<Window>('30');
  const [nonce, setNonce] = React.useState(0);
  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);
  const state = useSummary(window, nonce);

  let body: React.ReactNode;
  if (state.kind === 'loading') {
    body = <LoadingRows />;
  } else if (state.kind === 'error') {
    body = (
      <Message
        title="Could not read transcripts"
        body={state.message}
        action={
          <Button variant="outline" size="sm" onClick={refresh}>
            Try again
          </Button>
        }
      />
    );
  } else if (state.data.files === 0) {
    body = (
      <Message
        title="No transcripts on this machine"
        body="Vulcan reads ~/.claude/projects from the computer running this server. Run it locally beside your Claude Code sessions; a hosted deployment has nothing to read."
      />
    );
  } else {
    body = <Panels data={state.data} />;
  }

  return (
    <PageFrame>
      <Header window={window} onWindow={setWindow} onRefresh={refresh} busy={state.kind === 'loading'} />
      {body}
    </PageFrame>
  );
}
