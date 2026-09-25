import type { HealthProviders, HealthResponse, HealthService, HealthStatus } from './api';
import type { UsageEndpoint } from './account';
import { RUNNABLE, type RunnableEndpointDef } from './catalog';
import type { RunnableEndpoint } from './endpoints';
import type { DayBucket } from './status';

/*
 * Turns the two things the instance can tell us into one answer per tool.
 *
 * `/health` proves whether a tool's dependencies are up right now; the
 * `request_usage` table records how its recent requests actually went. Neither
 * alone answers "is Scrape working": a green dependency row says nothing about
 * a route that 500s, and a clean request log says nothing about a tool nobody
 * has called. So each row carries both, derived separately, and the copy says
 * which is which.
 */

export type DependencyId = 'postgres' | 'fetch' | 'extract' | 'browser';

export const DEPENDENCY_LABEL: Record<DependencyId, string> = {
  postgres: 'Postgres',
  fetch: 'Fetch',
  extract: 'Extract',
  browser: 'Browser',
};

interface UtilityDependencies {
  /** Down means the tool cannot answer at all. */
  hard: readonly DependencyId[];
  /** Down means one tier or one action is lost, not the tool. */
  soft: readonly DependencyId[];
  /** Absent means the route answers 503 by design until an operator sets it. */
  config?: 'search';
  /** Absent means one option of the tool is unavailable; the tool itself still runs. */
  optional?: 'llm';
}

/**
 * Keyed on `RunnableEndpoint` so a tool added to the catalog fails to compile
 * here until its dependencies are stated, rather than rendering as unverified.
 *
 * Each entry was read off the route's `Deps` interface and what `index.ts`
 * passes to it. Postgres is on every row because every `/v1` request resolves
 * its API key through `core/api-keys.ts` before the route runs.
 */
const DEPENDENCIES: Record<RunnableEndpoint, UtilityDependencies> = {
  // routes/scrape.ts: fetchClient, extractClient, browserPool?. The plain and
  // tls tiers need no browser; jsonOptions goes through the LLM.
  scrape: { hard: ['postgres', 'fetch', 'extract'], soft: ['browser'], optional: 'llm' },
  // routes/parse.ts, metadata.ts: extractClient only.
  parse: { hard: ['postgres', 'extract'], soft: [] },
  metadata: { hard: ['postgres', 'extract'], soft: [] },
  // routes/document.ts forwards to parse, metadata and pdf-assess, so it needs
  // what they need and nothing more; parse's `jsonOptions` is the one path that reaches a model.
  document: { hard: ['postgres', 'extract'], soft: [], optional: 'llm' },
  // routes/extract.ts: the scrape pipeline per URL, then the model. The model
  // is the point of the endpoint rather than one option of it, but `llm` is not
  // a health-checked service here — it is the caller's provider — so it stays
  // `optional` and the hard set covers what Helix itself must have running.
  extract: { hard: ['postgres', 'fetch', 'extract'], soft: ['browser'], optional: 'llm' },
  // routes/screenshot.ts: the render tier is the whole endpoint, not a fallback.
  // `extractClient` is in its Deps but the route passes `skipExtraction: true`,
  // so it is never called — extract being down does not stop a screenshot.
  screenshot: { hard: ['postgres', 'fetch', 'browser'], soft: [] },
  // routes/search.ts: provider (config), fetchClient, extractClient, browserPool?.
  search: { hard: ['postgres', 'fetch', 'extract'], soft: ['browser'], config: 'search' },
  // routes/map.ts: fetchClient, extractClient (link extraction). No browser.
  map: { hard: ['postgres', 'fetch', 'extract'], soft: [] },
  // routes/crawl.ts extends MapRouteDeps; jobs live in Postgres. No browser.
  crawl: { hard: ['postgres', 'fetch', 'extract'], soft: [] },
  // routes/interact.ts: sessions (leased from the browser pool), extractClient for the extract action.
  interact: { hard: ['postgres', 'browser'], soft: ['extract'] },
  // index.ts fetchMonitorPage: runPipeline with fetch, extract, browserPool; the store is Postgres.
  monitor: { hard: ['postgres', 'fetch', 'extract'], soft: ['browser'] },
};

export type UtilityState = 'working' | 'ready' | 'degraded' | 'down' | 'not_configured' | 'unverified';

export interface UtilityOutcomes {
  requests: number;
  ok: number;
  failed: number;
  clientErrors: number;
  rateLimited: number;
  last24h: { ok: number; failed: number };
  /** The last 7 UTC days, the window the success rate is quoted over. */
  recent: { requests: number; ok: number; failed: number; clientErrors: number; rateLimited: number };
  /** Hours with at least one recorded request, across the whole window. */
  observedHours: number;
  badHours: number;
  /** One bucket per UTC day, in the shape `HistoryBars` draws. `okPct` is good hours over observed hours. */
  days: DayBucket[];
}

export interface UtilityRow {
  def: RunnableEndpointDef;
  state: UtilityState;
  /** Why the state is what it is, in the operator's terms. Empty when working. */
  reasons: string[];
  /** A missing option, e.g. no LLM for `jsonOptions`. Does not affect the state. */
  note: string | null;
  /** Null while outcomes are loading or unavailable. */
  outcomes: UtilityOutcomes | null;
}

/** `/v1/scrape` becomes `/scrape`, the family `normaliseEndpoint` records. */
export function endpointFamily(def: RunnableEndpointDef): string {
  return def.path.replace(/^\/v1/, '');
}

/** Sub-routes (`/crawl/:id`, `/monitor/:id`) belong to the tool that owns the family. */
export function foldOutcomes(family: string, endpoints: readonly UsageEndpoint[]): UtilityOutcomes {
  const matching = endpoints.filter((e) => e.endpoint === family || e.endpoint.startsWith(`${family}/`));
  const recentFrom = utcDay(-6);
  const dayMap = new Map<string, { observed: number; bad: number }>();
  const out: UtilityOutcomes = {
    requests: 0,
    ok: 0,
    failed: 0,
    clientErrors: 0,
    rateLimited: 0,
    last24h: { ok: 0, failed: 0 },
    recent: { requests: 0, ok: 0, failed: 0, clientErrors: 0, rateLimited: 0 },
    observedHours: 0,
    badHours: 0,
    days: [],
  };

  for (const endpoint of matching) {
    out.requests += endpoint.requests;
    out.ok += endpoint.counts['2xx'];
    out.failed += endpoint.counts['5xx'];
    out.clientErrors += endpoint.counts['4xx'];
    out.rateLimited += endpoint.counts['429'];
    out.last24h.ok += endpoint.last24h.ok;
    out.last24h.failed += endpoint.last24h.failed;
    for (const day of endpoint.days) {
      if (day.day >= recentFrom) {
        const c = day.counts;
        out.recent.ok += c['2xx'];
        out.recent.failed += c['5xx'];
        out.recent.clientErrors += c['4xx'];
        out.recent.rateLimited += c['429'];
        out.recent.requests += c['2xx'] + c['4xx'] + c['429'] + c['5xx'];
      }
      const entry = dayMap.get(day.day) ?? { observed: 0, bad: 0 };
      entry.observed += day.observedHours;
      entry.bad += day.badHours;
      dayMap.set(day.day, entry);
    }
  }

  // Two sub-routes sharing an hour count it twice here. Uptime is a ratio of
  // the same double-counting on both sides, so the percentage is unaffected.
  for (const [day, { observed, bad }] of [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out.observedHours += observed;
    out.badHours += bad;
    out.days.push({ day, okPct: observed === 0 ? null : ((observed - bad) / observed) * 100, p50Ms: null, samples: observed });
  }

  return out;
}

/** YYYY-MM-DD for today plus `offset` days, in UTC, the calendar the buckets use. */
function utcDay(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10);
}

/** 2xx over 2xx + 5xx in the last 7 days. Client errors and throttling are the caller's outcome, not the tool's. */
export function successRate(outcomes: UtilityOutcomes): number | null {
  const answered = outcomes.recent.ok + outcomes.recent.failed;
  return answered === 0 ? null : (outcomes.recent.ok / answered) * 100;
}

export function measuredUptime(outcomes: UtilityOutcomes): number | null {
  if (outcomes.observedHours === 0) return null;
  return ((outcomes.observedHours - outcomes.badHours) / outcomes.observedHours) * 100;
}

/** Days padded to a contiguous strip ending today (UTC), so a quiet day is a gap rather than a missing bar. */
export function padDays(days: readonly DayBucket[], count = 90): DayBucket[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const out: DayBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = utcDay(-i);
    out.push(byDay.get(day) ?? { day, okPct: null, p50Ms: null, samples: 0 });
  }
  return out;
}

const SEARCH_NOT_CONFIGURED =
  'No search backend is configured. Set SEARXNG_URL, SERPER_API_KEY or SERPAPI_KEY on the instance; until then every call answers 503 by design.';

function describe(dep: DependencyId, service: HealthService): string {
  const verb = service.status === 'degraded' ? 'is degraded' : 'is down';
  const head = `${DEPENDENCY_LABEL[dep]} ${verb}`;
  return service.detail ? `${head}: ${service.detail}` : head;
}

function worse(a: HealthStatus | undefined, b: HealthStatus): HealthStatus {
  const rank = { unhealthy: 2, degraded: 1, ok: 0 };
  if (!a) return b;
  return rank[a] >= rank[b] ? a : b;
}

export function deriveUtility(
  def: RunnableEndpointDef,
  services: HealthResponse['services'],
  providers: HealthProviders,
  outcomes: UtilityOutcomes | null,
): UtilityRow {
  const deps = DEPENDENCIES[def.id];
  const reasons: string[] = [];
  const unreported: DependencyId[] = [];
  const softUnreported: DependencyId[] = [];
  let hardWorst: HealthStatus | undefined;
  let softWorst: HealthStatus | undefined;

  for (const dep of deps.hard) {
    const service = services[dep];
    if (!service) {
      unreported.push(dep);
      continue;
    }
    if (service.status !== 'ok') reasons.push(describe(dep, service));
    hardWorst = worse(hardWorst, service.status);
  }
  for (const dep of deps.soft) {
    const service = services[dep];
    if (!service) {
      softUnreported.push(dep);
      continue;
    }
    if (service.status !== 'ok') reasons.push(`${describe(dep, service)}; the tiers or actions that need it will fail.`);
    softWorst = worse(softWorst, service.status);
  }

  const notes: string[] = [];
  if (deps.optional === 'llm' && !providers.llm.configured) notes.push('jsonOptions needs an LLM provider, which is not configured.');
  if (softUnreported.length > 0) {
    const names = softUnreported.map((d) => DEPENDENCY_LABEL[d]).join(', ');
    notes.push(`/health does not report ${names}, so the tiers or actions that need it are unverified.`);
  }
  const note = notes.length > 0 ? notes.join(' ') : null;

  if (deps.config === 'search' && !providers.search.configured) {
    return { def, state: 'not_configured', reasons: [SEARCH_NOT_CONFIGURED, ...reasons], note, outcomes };
  }

  if (hardWorst === 'unhealthy') return { def, state: 'down', reasons, note, outcomes };

  if (outcomes && outcomes.last24h.failed > 0 && outcomes.last24h.ok === 0) {
    const n = outcomes.last24h.failed;
    reasons.push(
      `Every request in the last 24 hours answered 5xx (${n} of ${n}). Dependencies report healthy, so the fault is in the route or in what it was asked for.`,
    );
    return { def, state: 'down', reasons, note, outcomes };
  }

  if (hardWorst === 'degraded' || softWorst === 'unhealthy' || softWorst === 'degraded') {
    return { def, state: 'degraded', reasons, note, outcomes };
  }

  if (outcomes && outcomes.last24h.failed > 0) {
    const total = outcomes.last24h.ok + outcomes.last24h.failed;
    reasons.push(`${outcomes.last24h.failed} of ${total} requests in the last 24 hours answered 5xx.`);
    return { def, state: 'degraded', reasons, note, outcomes };
  }

  if (unreported.length > 0) {
    const names = unreported.map((d) => DEPENDENCY_LABEL[d]).join(', ');
    reasons.push(`This instance's /health does not report ${names}, so the tool cannot be verified from here.`);
    return { def, state: 'unverified', reasons, note, outcomes };
  }

  if (outcomes && outcomes.ok > 0) return { def, state: 'working', reasons, note, outcomes };

  // Dependencies are up but no request has proven the route: ready, not working.
  return { def, state: 'ready', reasons, note, outcomes };
}

export function deriveUtilities(health: HealthResponse, usage: readonly UsageEndpoint[] | null): UtilityRow[] {
  return RUNNABLE.map((def) =>
    deriveUtility(def, health.services, health.providers, usage ? foldOutcomes(endpointFamily(def), usage) : null),
  );
}

export function dependenciesOf(id: RunnableEndpoint): { hard: readonly DependencyId[]; soft: readonly DependencyId[] } {
  const { hard, soft } = DEPENDENCIES[id];
  return { hard, soft };
}
