import 'server-only';
import type { RequestRecord } from './ingest';
import { costOf, resolveRates, type Usage } from './pricing';

export interface DayPoint {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  cost: number;
  requests: number;
  /** Cost split by model, so the day can be drawn as a stack. */
  byModel: Record<string, number>;
}

export interface ModelRow {
  model: string;
  cost: number;
  requests: number;
  tokens: number;
  estimated: boolean;
}

export interface ProjectRow {
  project: string;
  cost: number;
  requests: number;
  sessions: number;
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

export interface SessionCost {
  sessionId: string;
  project: string;
  startedAt: number;
  endedAt: number;
  requests: number;
  cost: number;
  models: string[];
}

export interface ToolRow {
  name: string;
  count: number;
  errors: number;
}

export interface Bucket {
  label: string;
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
    toolCalls: number;
    toolErrors: number;
    thinkingTokens: number;
  };
  tokens: Usage;
  burn: DayPoint[];
  models: ModelRow[];
  projects: ProjectRow[];
  /** Local weekday (0 = Sunday) by hour, flattened as `dow * 24 + hour`. */
  heat: { cost: number[]; requests: number[] };
  latency: { p50: number; p90: number; p99: number; sampled: number; buckets: Bucket[] };
  outputSizes: Bucket[];
  sessions: SessionGrowth[];
  topSessions: SessionCost[];
  tools: ToolRow[];
}

const MAX_SESSIONS = 8;
const MAX_TOOLS = 12;
const MAX_PROJECTS = 10;

const LATENCY_EDGES: { label: string; max: number }[] = [
  { label: '< 2 s', max: 2_000 },
  { label: '2–5 s', max: 5_000 },
  { label: '5–15 s', max: 15_000 },
  { label: '15–60 s', max: 60_000 },
  { label: '1–5 min', max: 300_000 },
  { label: '> 5 min', max: Infinity },
];

const OUTPUT_EDGES: { label: string; max: number }[] = [
  { label: '< 100', max: 100 },
  { label: '100–500', max: 500 },
  { label: '500–2K', max: 2_000 },
  { label: '2K–8K', max: 8_000 },
  { label: '8K–32K', max: 32_000 },
  { label: '> 32K', max: Infinity },
];

function localDay(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function contextOf(u: Usage): number {
  return u.input + u.cacheRead + u.cacheCreate5m + u.cacheCreate1h;
}

function bucketize(values: number[], edges: { label: string; max: number }[]): Bucket[] {
  const counts = edges.map(() => 0);
  for (const v of values) {
    const i = edges.findIndex((e) => v < e.max);
    const slot = i === -1 ? edges.length - 1 : i;
    counts[slot] = (counts[slot] ?? 0) + 1;
  }
  return edges.map((e, i) => ({ label: e.label, count: counts[i] ?? 0 }));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i] ?? 0;
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
  const projects = new Map<string, ProjectRow & { sessionIds: Set<string> }>();
  const sessions = new Map<string, SessionGrowth & { endedAt: number; models: Set<string> }>();
  const tools = new Map<string, ToolRow>();
  const heatCost = new Array<number>(168).fill(0);
  const heatRequests = new Array<number>(168).fill(0);
  const latencies: number[] = [];
  const outputs: number[] = [];
  let cost = 0;
  let estimatedRequests = 0;
  let unpricedRequests = 0;
  let toolCalls = 0;
  let toolErrors = 0;
  let thinkingTokens = 0;

  for (const r of records) {
    const resolved = resolveRates(r.model, new Date(r.timestamp));
    const c = resolved ? costOf(r.usage, resolved.rates) : 0;
    if (!resolved) unpricedRequests += 1;
    else if (resolved.estimated) estimatedRequests += 1;
    cost += c;
    thinkingTokens += r.thinking;

    tokens.input += r.usage.input;
    tokens.output += r.usage.output;
    tokens.cacheRead += r.usage.cacheRead;
    tokens.cacheCreate5m += r.usage.cacheCreate5m;
    tokens.cacheCreate1h += r.usage.cacheCreate1h;
    outputs.push(r.usage.output);
    if (r.latencyMs !== null && !r.fromSubagent) latencies.push(r.latencyMs);

    const day = localDay(r.timestamp);
    const b = burn.get(day) ?? { day, cost: 0, requests: 0, byModel: {} };
    b.cost += c;
    b.requests += 1;
    b.byModel[r.model] = (b.byModel[r.model] ?? 0) + c;
    burn.set(day, b);

    const at = new Date(r.timestamp);
    const cell = at.getDay() * 24 + at.getHours();
    heatCost[cell] = (heatCost[cell] ?? 0) + c;
    heatRequests[cell] = (heatRequests[cell] ?? 0) + 1;

    const m = models.get(r.model) ?? { model: r.model, cost: 0, requests: 0, tokens: 0, estimated: false };
    m.cost += c;
    m.requests += 1;
    m.tokens += contextOf(r.usage) + r.usage.output;
    m.estimated = m.estimated || !resolved || resolved.estimated;
    models.set(r.model, m);

    const p = projects.get(r.project) ?? { project: r.project, cost: 0, requests: 0, sessions: 0, sessionIds: new Set<string>() };
    p.cost += c;
    p.requests += 1;
    p.sessionIds.add(r.sessionId);
    projects.set(r.project, p);

    const s = sessions.get(r.sessionId) ?? {
      sessionId: r.sessionId,
      project: r.project,
      startedAt: r.timestamp,
      endedAt: r.timestamp,
      requests: 0,
      cost: 0,
      context: [],
      models: new Set<string>(),
    };
    s.requests += 1;
    s.cost += c;
    s.endedAt = r.timestamp;
    s.models.add(r.model);
    if (!r.fromSubagent) s.context.push(contextOf(r.usage));
    sessions.set(r.sessionId, s);

    for (const t of r.tools) {
      const row = tools.get(t) ?? { name: t, count: 0, errors: 0 };
      row.count += 1;
      tools.set(t, row);
      toolCalls += 1;
    }
    for (const t of r.toolErrors) {
      const row = tools.get(t) ?? { name: t, count: 0, errors: 0 };
      row.errors += 1;
      tools.set(t, row);
      toolErrors += 1;
    }
  }

  latencies.sort((a, b) => a - b);

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
      toolCalls,
      toolErrors,
      thinkingTokens,
    },
    tokens,
    burn: [...burn.values()],
    models: [...models.values()].sort((a, b) => b.cost - a.cost),
    projects: [...projects.values()]
      .map(({ sessionIds, ...row }) => ({ ...row, sessions: sessionIds.size }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, MAX_PROJECTS),
    heat: { cost: heatCost, requests: heatRequests },
    latency: {
      p50: percentile(latencies, 50),
      p90: percentile(latencies, 90),
      p99: percentile(latencies, 99),
      sampled: latencies.length,
      buckets: bucketize(latencies, LATENCY_EDGES),
    },
    outputSizes: bucketize(outputs, OUTPUT_EDGES),
    sessions: [...sessions.values()]
      .filter((s) => s.context.length > 1)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, MAX_SESSIONS)
      .map(({ endedAt: _e, models: _m, ...s }) => ({ ...s, context: downsample(s.context, 120) })),
    topSessions: [...sessions.values()]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, MAX_SESSIONS)
      .map(({ context: _c, models: ms, ...s }) => ({ ...s, models: [...ms] })),
    tools: [...tools.values()].sort((a, b) => b.count - a.count).slice(0, MAX_TOOLS),
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
