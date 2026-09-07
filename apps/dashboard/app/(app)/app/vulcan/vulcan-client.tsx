'use client';

import * as React from 'react';
import { RotateCw } from 'lucide-react';
import { PageFrame, FrameRow, FrameHeading, FrameCells, FrameTag } from '@/components/app/page-frame';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VulcanFlame } from '@/components/vulcan/vulcan-flame';
import type { Bucket, VulcanSummary } from '@/lib/vulcan/aggregate';
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

/** The ember ramp from globals.css, hottest first. Ranked things (models, projects) take shades in this order. */
const EMBER = [1, 2, 3, 4, 5].map((i) => `hsl(var(--v-${i}))`);
const emberFor = (rank: number): string => EMBER[Math.min(rank, EMBER.length - 1)] ?? EMBER[0]!;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const r = part / total;
  return `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;
}

function seconds(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function dayLabel(day: string): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function projectName(dir: string): string {
  return dir.replace(/^[A-Za-z]--/, '');
}

function modelName(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
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
    out.push(byDay.get(key) ?? { day: key, cost: 0, requests: 0, byModel: {} });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function Bar({ ratio, color = EMBER[1]! }: { ratio: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-[1px] bg-foreground/[0.08]">
      <div className="h-full rounded-[1px]" style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, background: color }} />
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

function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[11px] text-muted-foreground', className)}>{children}</span>;
}

/** Days as columns, each a stack of the models that spent that day, hottest shade for the costliest model overall. */
function DayStacks({ days, modelOrder }: { days: VulcanSummary['burn']; modelOrder: string[] }) {
  const max = Math.max(...days.map((d) => d.cost), 0);
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between">
        <Mono>{usd(max)} peak day</Mono>
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
          {modelOrder.slice(0, 5).map((m, i) => (
            <span key={m} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[1px]" style={{ background: emberFor(i) }} aria-hidden />
              <Mono className="text-foreground/80">{modelName(m)}</Mono>
            </span>
          ))}
        </div>
      </div>
      <div className="flex h-44 items-end gap-px" role="img" aria-label="Spend per day, stacked by model">
        {days.map((d) => (
          <div
            key={d.day}
            className="group relative flex h-full min-w-0 flex-1 flex-col-reverse"
            title={`${dayLabel(d.day)}: ${usd(d.cost)} across ${whole.format(d.requests)} requests`}
          >
            {modelOrder.map((m, i) => {
              const v = d.byModel[m] ?? 0;
              if (v === 0 || max === 0) return null;
              return (
                <div
                  key={m}
                  style={{ height: `${(v / max) * 100}%`, background: emberFor(i) }}
                  className="w-full opacity-90 transition-opacity duration-150 ease-out group-hover:opacity-100"
                />
              );
            })}
            {d.cost === 0 && <div className="h-px w-full bg-foreground/10" />}
          </div>
        ))}
      </div>
      <div className="flex border-t border-border pt-1.5">
        {days.map((d, i) => (
          <div key={d.day} className="min-w-0 flex-1">
            {(i % labelEvery === 0 || i === days.length - 1) && <Mono className="block whitespace-nowrap">{dayLabel(d.day)}</Mono>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Weekday rows by hour columns; cell alpha is the square root of the cell's share of the peak, so quiet hours stay visible. */
function Heatmap({ cost, requests }: { cost: number[]; requests: number[] }) {
  const max = Math.max(...cost, 0);
  return (
    <div className="grid grid-cols-[2.25rem_1fr] gap-x-2 gap-y-1">
      {DOW.map((name, dow) => (
        <React.Fragment key={name}>
          <Mono className="self-center">{name}</Mono>
          <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px">
            {Array.from({ length: 24 }, (_, hour) => {
              const i = dow * 24 + hour;
              const c = cost[i] ?? 0;
              const alpha = max > 0 ? Math.sqrt(c / max) : 0;
              return (
                <div
                  key={hour}
                  className="aspect-square min-w-0 rounded-[1px] bg-foreground/[0.06]"
                  style={c > 0 ? { background: `hsl(var(--v-2) / ${(0.12 + alpha * 0.88).toFixed(3)})` } : undefined}
                  title={`${name} ${String(hour).padStart(2, '0')}:00: ${usd(c)}, ${whole.format(requests[i] ?? 0)} requests`}
                />
              );
            })}
          </div>
        </React.Fragment>
      ))}
      <span />
      <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px">
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="min-w-0">
            {hour % 6 === 0 && <Mono>{String(hour).padStart(2, '0')}</Mono>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Histogram({ buckets, color }: { buckets: Bucket[]; color: string }) {
  const total = buckets.reduce((n, b) => n + b.count, 0);
  const max = Math.max(...buckets.map((b) => b.count), 0);
  return (
    <ul className="flex flex-col gap-2">
      {buckets.map((b) => (
        <li key={b.label} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-[13px]">
          <Mono className="text-foreground/80">{b.label}</Mono>
          <Bar ratio={max ? b.count / max : 0} color={color} />
          <span className="flex items-baseline gap-2 tabular-nums">
            <Mono>{pct(b.count, total)}</Mono>
            <span className="text-foreground">{whole.format(b.count)}</span>
          </span>
        </li>
      ))}
    </ul>
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
            value === w.value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
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
    <FrameRow className="overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[28rem]"
        style={{ background: 'radial-gradient(ellipse 60% 120% at 6% 50%, hsl(var(--primary) / 0.16), transparent 70%)' }}
      />
      <div className="relative flex items-start justify-between gap-4 px-6 py-5">
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
          <Skeleton className="mt-4 h-44 w-full" />
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
  const { totals, tokens: t, latency } = data;
  const contextTotal = t.input + t.cacheRead + t.cacheCreate5m + t.cacheCreate1h;
  const cacheWrites = t.cacheCreate5m + t.cacheCreate1h;
  const tokenTotal = contextTotal + t.output;
  const burn = React.useMemo(() => fillDays(data.burn), [data.burn]);
  const first = burn[0];
  const last = burn[burn.length - 1];
  const modelOrder = data.models.map((m) => m.model);
  const topModel = data.models[0]?.cost ?? 0;
  const topProject = data.projects[0]?.cost ?? 0;
  const topTool = data.tools[0]?.count ?? 0;

  const tokenRows: { label: string; value: number; color: string }[] = [
    { label: 'Cache read', value: t.cacheRead, color: EMBER[4]! },
    { label: 'Cache write', value: cacheWrites, color: EMBER[3]! },
    { label: 'Fresh input', value: t.input, color: EMBER[2]! },
    { label: 'Output', value: t.output, color: EMBER[0]! },
  ];

  return (
    <>
      <FrameRow>
        <FrameCells cols={4}>
          <Stat value={usd(totals.cost)} label="Spend" {...(totals.estimatedRequests > 0 ? { note: `${whole.format(totals.estimatedRequests)} requests estimated` } : {})} />
          <Stat value={whole.format(totals.requests)} label="Requests" note={`${whole.format(totals.sessions)} sessions · ${whole.format(data.files)} files`} />
          <Stat value={pct(t.cacheRead, contextTotal)} label="Context served from cache" note={`${tokens(t.cacheRead)} of ${tokens(contextTotal)} tokens`} />
          <Stat value={seconds(latency.p50)} label="Median reply" note={`p90 ${seconds(latency.p90)} · p99 ${seconds(latency.p99)}`} />
        </FrameCells>
      </FrameRow>

      <FrameRow>
        <FrameHeading title="Spend per day" {...(first && last ? { description: `${dayLabel(first.day)} to ${dayLabel(last.day)}, stacked by model` } : {})} />
        <div className="px-6 pb-6">
          {burn.length ? <DayStacks days={burn} modelOrder={modelOrder} /> : <p className="text-[13px] text-muted-foreground">No requests in this window.</p>}
        </div>
      </FrameRow>

      <FrameRow>
        <FrameCells cols={2}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Cost by model" />
            <ul className="flex flex-col gap-3">
              {data.models.map((m, i) => (
                <li key={m.model} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-baseline gap-2 truncate">
                      <span className="truncate font-mono text-foreground">{m.model}</span>
                      {m.estimated && <FrameTag>estimated</FrameTag>}
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground">{usd(m.cost)}</span>
                  </div>
                  <Bar ratio={topModel ? m.cost / topModel : 0} color={emberFor(i)} />
                  <div className="flex justify-between">
                    <Mono>{whole.format(m.requests)} requests</Mono>
                    <Mono>{tokens(m.tokens)} tokens</Mono>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Tokens" tag={<Mono>{tokens(tokenTotal)} total</Mono>} />
            <div className="flex h-2 w-full overflow-hidden rounded-[1px] bg-foreground/[0.08]">
              {tokenRows.map((r) => (
                <div key={r.label} style={{ width: `${tokenTotal ? (r.value / tokenTotal) * 100 : 0}%`, background: r.color }} />
              ))}
            </div>
            <ul className="flex flex-col gap-2">
              {tokenRows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className="h-2 w-2 rounded-[1px]" style={{ background: r.color }} aria-hidden />
                    {r.label}
                  </span>
                  <span className="flex items-baseline gap-3 tabular-nums">
                    <Mono>{pct(r.value, tokenTotal)}</Mono>
                    <span className="text-foreground">{tokens(r.value)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] leading-snug text-muted-foreground">
              {t.output > 0 ? `${pct(totals.thinkingTokens, t.output)} of output tokens were thinking.` : 'No output tokens recorded.'}
            </p>
          </div>
        </FrameCells>
      </FrameRow>

      <FrameRow>
        <FrameHeading title="When the spend happens" description="Local weekday by hour of day. Brighter cells cost more." />
        <div className="px-6 pb-6">
          <Heatmap cost={data.heat.cost} requests={data.heat.requests} />
        </div>
      </FrameRow>

      <FrameRow>
        <FrameCells cols={2}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Spend by project" />
            <ul className="flex flex-col gap-2.5">
              {data.projects.map((p, i) => (
                <li key={p.project} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-[13px]">
                  <span className="truncate font-mono text-foreground" title={p.project}>
                    {projectName(p.project)}
                  </span>
                  <Bar ratio={topProject ? p.cost / topProject : 0} color={emberFor(i)} />
                  <span className="flex items-baseline gap-2 tabular-nums">
                    <Mono>{whole.format(p.sessions)} sessions</Mono>
                    <span className="text-foreground">{usd(p.cost)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Costliest sessions" />
            <ul className="flex flex-col divide-y divide-border">
              {data.topSessions.map((s) => (
                <li key={s.sessionId} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-foreground">{projectName(s.project)}</div>
                    <Mono>
                      {shortDate(s.startedAt)} · {s.sessionId.slice(0, 8)} · {s.models.map(modelName).join(', ')}
                    </Mono>
                  </div>
                  <div className="flex shrink-0 flex-col items-end tabular-nums">
                    <span className="text-foreground">{usd(s.cost)}</span>
                    <Mono>{whole.format(s.requests)} requests</Mono>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </FrameCells>
      </FrameRow>

      <FrameRow>
        <FrameCells cols={2}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Reply latency" tag={<Mono>{whole.format(latency.sampled)} replies</Mono>} />
            <Histogram buckets={latency.buckets} color={EMBER[1]!} />
            <p className="text-[13px] leading-snug text-muted-foreground">
              Time from your message or a tool result to the first streamed line of the reply. Subagent replies are excluded.
            </p>
          </div>
          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Reply size" tag={<Mono>output tokens</Mono>} />
            <Histogram buckets={data.outputSizes} color={EMBER[2]!} />
            <p className="text-[13px] leading-snug text-muted-foreground">Output tokens per request, thinking included.</p>
          </div>
        </FrameCells>
      </FrameRow>

      <FrameRow>
        <FrameCells cols={2}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Cache writes by TTL" tag={<Mono>{tokens(cacheWrites)} written</Mono>} />
            <ul className="flex flex-col gap-3">
              {[
                { label: '5 minute', note: '1.25× input rate', value: t.cacheCreate5m, color: EMBER[3]! },
                { label: '1 hour', note: '2× input rate', value: t.cacheCreate1h, color: EMBER[0]! },
              ].map((r) => (
                <li key={r.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="flex items-baseline gap-2">
                      <span className="text-foreground">{r.label}</span>
                      <Mono>{r.note}</Mono>
                    </span>
                    <span className="tabular-nums text-foreground">{tokens(r.value)}</span>
                  </div>
                  <Bar ratio={cacheWrites ? r.value / cacheWrites : 0} color={r.color} />
                </li>
              ))}
            </ul>
            <p className="text-[13px] leading-snug text-muted-foreground">
              {cacheWrites ? `${pct(t.cacheCreate1h, cacheWrites)} of written tokens took the 1-hour TTL.` : 'No cache writes recorded.'}
            </p>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5">
            <CellHeading title="Tool calls" tag={<Mono>{pct(totals.toolErrors, totals.toolCalls)} errored</Mono>} />
            <ul className="flex flex-col gap-2.5">
              {data.tools.map((tool) => (
                <li key={tool.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]">
                  <span className="truncate font-mono text-foreground">{tool.name}</span>
                  <Bar ratio={topTool ? tool.count / topTool : 0} color={EMBER[2]!} />
                  <span className="flex items-baseline gap-2 tabular-nums">
                    {tool.errors > 0 && <Mono className="text-destructive/80">{whole.format(tool.errors)} err</Mono>}
                    <span className="text-foreground">{whole.format(tool.count)}</span>
                  </span>
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
                <div className="truncate font-mono text-[13px] text-foreground">{projectName(s.project)}</div>
                <Mono>
                  {shortDate(s.startedAt)} · {s.sessionId.slice(0, 8)}
                </Mono>
              </div>
              <Sparkline values={s.context} />
              <div className="flex gap-4 font-mono text-[11px] text-muted-foreground md:flex-col md:items-end md:gap-0.5">
                <span className="text-foreground">{tokens(s.context[s.context.length - 1] ?? 0)} last</span>
                <span>
                  {whole.format(s.requests)} requests · {usd(s.cost)}
                </span>
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
        body={`Looked in ${state.data.root} on ${state.data.host}. Vulcan reads the Claude Code transcripts of the computer running this server, so open the dashboard served from your own machine; a hosted deployment has nothing to read.`}
      />
    );
  } else {
    body = <Panels data={state.data} />;
  }

  return (
    <div data-surface="vulcan" className="min-h-full text-foreground">
      <PageFrame>
        <Header window={window} onWindow={setWindow} onRefresh={refresh} busy={state.kind === 'loading'} />
        {body}
      </PageFrame>
    </div>
  );
}
