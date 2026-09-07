import 'server-only';
import type { RequestRecord } from './ingest';
import { costOf, resolveRates, type Usage } from './pricing';

export interface DayPoint {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  cost: number;
  requests: number;
}

export interface ModelRow {
  model: string;
  cost: number;
  requests: number;
  tokens: number;
  estimated: boolean;
}

export interface SessionGrowth {
  sessionId: string;
  project: string;
  startedAt: number;
  requests: number;
  cost: number;
  /** Context size per request in order: input + cache read + cache write. */
  context: number[];
}

export interface ToolRow {
  name: string;
  count: number;
}

export interface VulcanSummary {
  generatedAt: number;
  windowDays: number | null;
  files: number;
  /** Where the transcripts were looked for, and on which machine, so an empty state can say so. */
  root: string;
  host: string;
  totals: {
    cost: number;
    requests: number;
    sessions: number;
    firstAt: number | null;
    lastAt: number | null;
    /** Requests whose model was priced off a family fallback rather than an exact rate. */
    estimatedRequests: number;
    /** Requests skipped because no rate could be resolved at all. */
    unpricedRequests: number;
  };
  tokens: Usage;
  burn: DayPoint[];
  models: ModelRow[];
  sessions: SessionGrowth[];
  tools: ToolRow[];
}

const MAX_SESSIONS = 8;
const MAX_TOOLS = 12;

function localDay(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function contextOf(u: Usage): number {
  return u.input + u.cacheRead + u.cacheCreate5m + u.cacheCreate1h;
}

/**
 * A subagent transcript can repeat lines its parent already holds, so the same
 * uuid appears in two files. Dedup here rather than in ingest keeps the
 * per-file cache idempotent.
 */
function dedup(records: RequestRecord[]): RequestRecord[] {
  const seen = new Set<string>();
  const out: RequestRecord[] = [];
  for (const r of records) {
    if (seen.has(r.uuid)) continue;
    seen.add(r.uuid);
    out.push(r);
  }
  return out;
}

export function aggregate(all: RequestRecord[], source: { files: number; root: string; host: string }, windowDays: number | null): VulcanSummary {
  const now = Date.now();
  const cutoff = windowDays ? now - windowDays * 86_400_000 : 0;
  const records = dedup(all)
    .filter((r) => r.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);

  const tokens: Usage = { input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0 };
  const burn = new Map<string, DayPoint>();
  const models = new Map<string, ModelRow>();
  const sessions = new Map<string, SessionGrowth>();
  const tools = new Map<string, number>();
  let cost = 0;
  let estimatedRequests = 0;
  let unpricedRequests = 0;

  for (const r of records) {
    const resolved = resolveRates(r.model, new Date(r.timestamp));
    const c = resolved ? costOf(r.usage, resolved.rates) : 0;
    if (!resolved) unpricedRequests += 1;
    else if (resolved.estimated) estimatedRequests += 1;
    cost += c;

    tokens.input += r.usage.input;
    tokens.output += r.usage.output;
    tokens.cacheRead += r.usage.cacheRead;
    tokens.cacheCreate5m += r.usage.cacheCreate5m;
    tokens.cacheCreate1h += r.usage.cacheCreate1h;

    const day = localDay(r.timestamp);
    const b = burn.get(day) ?? { day, cost: 0, requests: 0 };
    b.cost += c;
    b.requests += 1;
    burn.set(day, b);

    const m = models.get(r.model) ?? { model: r.model, cost: 0, requests: 0, tokens: 0, estimated: false };
    m.cost += c;
    m.requests += 1;
    m.tokens += contextOf(r.usage) + r.usage.output;
    m.estimated = m.estimated || !resolved || resolved.estimated;
    models.set(r.model, m);

    const s = sessions.get(r.sessionId) ?? {
      sessionId: r.sessionId,
      project: r.project,
      startedAt: r.timestamp,
      requests: 0,
      cost: 0,
      context: [],
    };
    s.requests += 1;
    s.cost += c;
    if (!r.fromSubagent) s.context.push(contextOf(r.usage));
    sessions.set(r.sessionId, s);

    for (const t of r.tools) tools.set(t, (tools.get(t) ?? 0) + 1);
  }

  return {
    generatedAt: now,
    windowDays,
    files: source.files,
    root: source.root,
    host: source.host,
    totals: {
      cost,
      requests: records.length,
      sessions: sessions.size,
      firstAt: records[0]?.timestamp ?? null,
      lastAt: records[records.length - 1]?.timestamp ?? null,
      estimatedRequests,
      unpricedRequests,
    },
    tokens,
    burn: [...burn.values()],
    models: [...models.values()].sort((a, b) => b.cost - a.cost),
    sessions: [...sessions.values()]
      .filter((s) => s.context.length > 1)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, MAX_SESSIONS)
      .map((s) => ({ ...s, context: downsample(s.context, 120) })),
    tools: [...tools.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_TOOLS),
  };
}

function downsample(series: number[], max: number): number[] {
  if (series.length <= max) return series;
  const step = series.length / max;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(series[Math.floor(i * step)] ?? 0);
  out[out.length - 1] = series[series.length - 1] ?? 0;
  return out;
}
