import type { Pool } from '../db/pool.js';
import { transaction } from '../db/pool.js';
import type { Diff, Granularity, JsonDiff } from './diff.js';
import type { Schedule } from './schedule.js';
import type { Sensitivity } from './sensitivity.js';
import type { TriggerOptions } from './triggers.js';

/**
 * Monitor persistence.
 *
 * One interface, two implementations: Postgres for the running service, and
 * an in-memory store so the scheduler, checker, dispatcher and routes can be
 * tested end to end without a database. The interface is the contract; the
 * SQL is a detail.
 */

export type MonitorStatus = 'active' | 'paused' | 'error';

export interface MonitorScrapeOptions {
  tier?: 'auto' | 'plain' | 'tls' | 'lightpanda' | 'chromium' | 'camoufox' | undefined;
  onlyMainContent?: boolean | undefined;
  includeSelectors?: string[] | undefined;
  excludeSelectors?: string[] | undefined;
  extractor?: 'trafilatura' | 'readability' | 'auto' | undefined;
  waitFor?: number | undefined;
  timeout?: number | undefined;
  headers?: Record<string, string> | undefined;
  profile?: string | undefined;
  proxy?: { url: string; sessionId?: string | undefined; geo?: string | undefined } | undefined;
}

export interface DiffOptions {
  granularity: Granularity;
  /** Include the diff in the webhook body so no follow-up request is needed. */
  inline: boolean;
}

/**
 * When set, a check extracts structured JSON from the page (via helix-extract
 * `/structured`, the same path `/scrape`'s `jsonOptions` uses) and diffs the
 * two JSON objects field by field instead of diffing markdown text. The text
 * diff still runs first to decide whether the page changed at all; JSON
 * extraction only runs on a real change, so a quiet page never pays for a
 * model call.
 */
export interface MonitorJsonOptions {
  schema: Record<string, unknown>;
  prompt?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
}

export type MonitorEvent = 'changed' | 'checked' | 'failed';

export interface MonitorWebhook {
  url: string;
  headers?: Record<string, string> | undefined;
  events: MonitorEvent[];
  metadata?: Record<string, unknown> | undefined;
  /** Per-webhook HMAC secret. Falls back to the instance secret when unset. */
  secret?: string | undefined;
}

export interface MonitorRecord {
  id: string;
  apiKeyId: string | null;
  url: string;
  schedule: Schedule;
  scrapeOptions: MonitorScrapeOptions;
  diff: DiffOptions;
  jsonOptions: MonitorJsonOptions | null;
  trigger: TriggerOptions;
  sensitivity: Sensitivity;
  webhook: MonitorWebhook | null;
  status: MonitorStatus;
  createdAt: Date;
  updatedAt: Date;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
  /** When the current claim was taken; null once the check ends. */
  claimedAt: Date | null;
  lastChangeAt: Date | null;
  lastError: string | null;
  checks: number;
  changes: number;
  pagesUnchanged: number;
}

export interface NewMonitor {
  apiKeyId: string | null;
  url: string;
  schedule: Schedule;
  scrapeOptions: MonitorScrapeOptions;
  diff: DiffOptions;
  jsonOptions?: MonitorJsonOptions | null | undefined;
  trigger: TriggerOptions;
  sensitivity: Sensitivity;
  webhook: MonitorWebhook | null;
  nextCheckAt: Date | null;
}

export interface MonitorPatch {
  schedule?: Schedule;
  scrapeOptions?: MonitorScrapeOptions;
  diff?: DiffOptions;
  jsonOptions?: MonitorJsonOptions | null;
  trigger?: TriggerOptions;
  sensitivity?: Sensitivity;
  webhook?: MonitorWebhook | null;
  status?: MonitorStatus;
  /**
   * How a check ended. `ok` clears `error` back to `active`; `error` marks the
   * monitor `error`. Neither touches a paused monitor: a pause that lands
   * while a check is running must survive the check's final write.
   */
  checkOutcome?: 'ok' | 'error';
  nextCheckAt?: Date | null;
  lastCheckedAt?: Date;
  lastChangeAt?: Date;
  lastError?: string | null;
}

export interface SnapshotRecord {
  id: number;
  monitorId: string;
  url: string;
  contentHash: string;
  content: string;
  capturedAt: Date;
}

export type CheckReason = 'first' | 'changed' | 'unchanged' | 'filtered' | 'trigger_not_met' | 'error';

export interface CheckRecord {
  id: number;
  monitorId: string;
  snapshotId: number | null;
  checkedAt: Date;
  changed: boolean;
  reason: CheckReason;
  diff: Diff | JsonDiff | null;
  error: string | null;
}

export interface NewCheck {
  monitorId: string;
  snapshotId: number | null;
  checkedAt: Date;
  changed: boolean;
  reason: CheckReason;
  diff: Diff | JsonDiff | null;
  error: string | null;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'dead';

export interface DeliveryRecord {
  id: number;
  monitorId: string;
  url: string;
  eventType: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
  attempts: number;
  status: DeliveryStatus;
  lastError: string | null;
  responseStatus: number | null;
  nextRetryAt: Date;
  createdAt: Date;
  deliveredAt: Date | null;
}

export interface NewDelivery {
  monitorId: string;
  url: string;
  eventType: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

export interface CheckCounters {
  checked: boolean;
  changed: boolean;
  unchanged: boolean;
}

/**
 * Ceiling on `list`. Both stores apply it, so a caller cannot tell them apart by
 * how much they return; the route reports truncation rather than implying the
 * page is the whole set.
 */
export const MONITOR_LIST_LIMIT = 500;

export interface MonitorStore {
  create(input: NewMonitor): Promise<MonitorRecord>;
  get(id: string): Promise<MonitorRecord | undefined>;
  list(apiKeyId: string | null): Promise<MonitorRecord[]>;
  update(id: string, patch: MonitorPatch): Promise<MonitorRecord | undefined>;
  delete(id: string): Promise<boolean>;
  /**
   * Atomically take the active monitors due at `now`, clearing `nextCheckAt`
   * so a second worker does not take them too. The caller must set the next
   * time back when the check ends, whatever the outcome.
   */
  claimDue(now: Date, limit: number): Promise<MonitorRecord[]>;
  /**
   * Claim one monitor for a check outside the schedule. Undefined when it is
   * paused, missing, or already claimed by a running check.
   */
  claim(id: string, now: Date): Promise<MonitorRecord | undefined>;
  /** Monitors claimed before `before` and never released: a crash mid-check. */
  listStuck(before: Date): Promise<MonitorRecord[]>;
  bumpCounters(id: string, counters: CheckCounters): Promise<void>;

  latestSnapshot(monitorId: string): Promise<SnapshotRecord | undefined>;
  getSnapshot(monitorId: string, snapshotId: number): Promise<SnapshotRecord | undefined>;
  saveSnapshot(input: Omit<SnapshotRecord, 'id'>): Promise<SnapshotRecord>;
  pruneSnapshots(monitorId: string, keep: number, maxAgeDays: number): Promise<number>;

  recordCheck(input: NewCheck): Promise<CheckRecord>;
  pruneChecks(monitorId: string, keep: number, maxAgeDays: number): Promise<number>;
  history(monitorId: string, options: { limit: number; before?: number | undefined }): Promise<CheckRecord[]>;

  /** Returns undefined when the dedupe key already exists. */
  enqueueDelivery(input: NewDelivery): Promise<DeliveryRecord | undefined>;
  /** Claimed rows are not due again until `now + leaseMs`, so a concurrent tick skips them. */
  claimDeliveries(now: Date, limit: number, leaseMs: number): Promise<DeliveryRecord[]>;
  markDelivered(id: number, responseStatus: number | null): Promise<void>;
  markRetry(id: number, attempts: number, nextRetryAt: Date, error: string, responseStatus: number | null): Promise<void>;
  markDead(id: number, attempts: number, error: string, responseStatus: number | null): Promise<void>;
  listDeliveries(monitorId: string, limit: number): Promise<DeliveryRecord[]>;
  replayDelivery(monitorId: string, deliveryId: number): Promise<DeliveryRecord | undefined>;
}

// ---------------------------------------------------------------- memory

export class MemoryMonitorStore implements MonitorStore {
  readonly monitors = new Map<string, MonitorRecord>();
  readonly snapshots: SnapshotRecord[] = [];
  readonly checks: CheckRecord[] = [];
  readonly deliveries: DeliveryRecord[] = [];
  #sequence = 0;

  #nextId(): number {
    this.#sequence += 1;
    return this.#sequence;
  }

  async create(input: NewMonitor): Promise<MonitorRecord> {
    const now = new Date();
    const record: MonitorRecord = {
      id: `00000000-0000-4000-8000-${String(this.#nextId()).padStart(12, '0')}`,
      apiKeyId: input.apiKeyId,
      url: input.url,
      schedule: input.schedule,
      scrapeOptions: input.scrapeOptions,
      diff: input.diff,
      jsonOptions: input.jsonOptions ?? null,
      trigger: input.trigger,
      sensitivity: input.sensitivity,
      webhook: input.webhook,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastCheckedAt: null,
      nextCheckAt: input.nextCheckAt,
      claimedAt: null,
      lastChangeAt: null,
      lastError: null,
      checks: 0,
      changes: 0,
      pagesUnchanged: 0,
    };
    this.monitors.set(record.id, record);
    return record;
  }

  async get(id: string): Promise<MonitorRecord | undefined> {
    const record = this.monitors.get(id);
    return record ? { ...record } : undefined;
  }

  async list(apiKeyId: string | null): Promise<MonitorRecord[]> {
    return [...this.monitors.values()]
      .filter((m) => apiKeyId === null || m.apiKeyId === apiKeyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, MONITOR_LIST_LIMIT)
      .map((m) => ({ ...m }));
  }

  async update(id: string, patch: MonitorPatch): Promise<MonitorRecord | undefined> {
    const record = this.monitors.get(id);
    if (!record) return undefined;
    const next: MonitorRecord = { ...record, updatedAt: new Date() };
    if (patch.schedule !== undefined) next.schedule = patch.schedule;
    if (patch.scrapeOptions !== undefined) next.scrapeOptions = patch.scrapeOptions;
    if (patch.diff !== undefined) next.diff = patch.diff;
    if (patch.jsonOptions !== undefined) next.jsonOptions = patch.jsonOptions;
    if (patch.trigger !== undefined) next.trigger = patch.trigger;
    if (patch.sensitivity !== undefined) next.sensitivity = patch.sensitivity;
    if (patch.webhook !== undefined) next.webhook = patch.webhook;
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.checkOutcome !== undefined && next.status !== 'paused') {
      next.status = patch.checkOutcome === 'error' ? 'error' : 'active';
    }
    if (patch.nextCheckAt !== undefined) {
      next.nextCheckAt = patch.nextCheckAt;
      if (patch.nextCheckAt !== null) next.claimedAt = null;
    }
    if (patch.lastCheckedAt !== undefined) next.lastCheckedAt = patch.lastCheckedAt;
    if (patch.lastChangeAt !== undefined) next.lastChangeAt = patch.lastChangeAt;
    if (patch.lastError !== undefined) next.lastError = patch.lastError;
    this.monitors.set(id, next);
    return { ...next };
  }

  async delete(id: string): Promise<boolean> {
    return this.monitors.delete(id);
  }

  async claimDue(now: Date, limit: number): Promise<MonitorRecord[]> {
    const due = [...this.monitors.values()]
      .filter((m) => (m.status === 'active' || m.status === 'error') && m.nextCheckAt !== null && m.nextCheckAt.getTime() <= now.getTime())
      .sort((a, b) => a.nextCheckAt!.getTime() - b.nextCheckAt!.getTime())
      .slice(0, limit);
    const claimed = due.map((m) => ({ ...m, nextCheckAt: null, claimedAt: now }));
    for (const m of claimed) this.monitors.set(m.id, m);
    return claimed.map((m) => ({ ...m }));
  }

  async claim(id: string, now: Date): Promise<MonitorRecord | undefined> {
    const record = this.monitors.get(id);
    if (!record || record.status === 'paused' || record.nextCheckAt === null) return undefined;
    const claimed = { ...record, nextCheckAt: null, claimedAt: now };
    this.monitors.set(id, claimed);
    return { ...claimed };
  }

  async listStuck(before: Date): Promise<MonitorRecord[]> {
    return [...this.monitors.values()].filter(
      (m) =>
        (m.status === 'active' || m.status === 'error') &&
        m.nextCheckAt === null &&
        (m.claimedAt === null || m.claimedAt.getTime() < before.getTime()),
    );
  }

  async bumpCounters(id: string, counters: CheckCounters): Promise<void> {
    const record = this.monitors.get(id);
    if (!record) return;
    this.monitors.set(id, {
      ...record,
      checks: record.checks + (counters.checked ? 1 : 0),
      changes: record.changes + (counters.changed ? 1 : 0),
      pagesUnchanged: record.pagesUnchanged + (counters.unchanged ? 1 : 0),
    });
  }

  async latestSnapshot(monitorId: string): Promise<SnapshotRecord | undefined> {
    return [...this.snapshots]
      .filter((s) => s.monitorId === monitorId)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)[0];
  }

  async getSnapshot(monitorId: string, snapshotId: number): Promise<SnapshotRecord | undefined> {
    return this.snapshots.find((s) => s.monitorId === monitorId && s.id === snapshotId);
  }

  async saveSnapshot(input: Omit<SnapshotRecord, 'id'>): Promise<SnapshotRecord> {
    const record: SnapshotRecord = { id: this.#nextId(), ...input };
    this.snapshots.push(record);
    return record;
  }

  async pruneSnapshots(monitorId: string, keep: number, maxAgeDays: number): Promise<number> {
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const mine = this.snapshots
      .filter((s) => s.monitorId === monitorId)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id);
    const doomed = new Set(
      mine.filter((s, index) => index >= keep || s.capturedAt.getTime() < cutoff).map((s) => s.id),
    );
    // The newest snapshot always survives: it is the baseline for the next diff.
    if (mine[0]) doomed.delete(mine[0].id);
    for (let i = this.snapshots.length - 1; i >= 0; i -= 1) {
      if (doomed.has(this.snapshots[i]!.id)) this.snapshots.splice(i, 1);
    }
    for (const check of this.checks) {
      if (check.snapshotId !== null && doomed.has(check.snapshotId)) check.snapshotId = null;
    }
    return doomed.size;
  }

  async recordCheck(input: NewCheck): Promise<CheckRecord> {
    const record: CheckRecord = { id: this.#nextId(), ...input };
    this.checks.push(record);
    return record;
  }

  async pruneChecks(monitorId: string, keep: number, maxAgeDays: number): Promise<number> {
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const mine = this.checks.filter((c) => c.monitorId === monitorId).sort((a, b) => b.id - a.id);
    const doomed = new Set(
      mine.filter((c, index) => index >= Math.max(1, keep) || (index > 0 && c.checkedAt.getTime() < cutoff)).map((c) => c.id),
    );
    for (let i = this.checks.length - 1; i >= 0; i -= 1) {
      if (doomed.has(this.checks[i]!.id)) this.checks.splice(i, 1);
    }
    return doomed.size;
  }

  async history(monitorId: string, options: { limit: number; before?: number | undefined }): Promise<CheckRecord[]> {
    return [...this.checks]
      .filter((c) => c.monitorId === monitorId && (options.before === undefined || c.id < options.before))
      .sort((a, b) => b.id - a.id)
      .slice(0, options.limit);
  }

  async enqueueDelivery(input: NewDelivery): Promise<DeliveryRecord | undefined> {
    if (this.deliveries.some((d) => d.dedupeKey === input.dedupeKey)) return undefined;
    const record: DeliveryRecord = {
      id: this.#nextId(),
      ...input,
      attempts: 0,
      status: 'pending',
      lastError: null,
      responseStatus: null,
      nextRetryAt: new Date(),
      createdAt: new Date(),
      deliveredAt: null,
    };
    this.deliveries.push(record);
    return { ...record };
  }

  async claimDeliveries(now: Date, limit: number, leaseMs: number): Promise<DeliveryRecord[]> {
    const due = this.deliveries
      .filter((d) => d.status === 'pending' && d.nextRetryAt.getTime() <= now.getTime())
      .sort((a, b) => a.nextRetryAt.getTime() - b.nextRetryAt.getTime())
      .slice(0, limit);
    for (const d of due) d.nextRetryAt = new Date(now.getTime() + leaseMs);
    return due.map((d) => ({ ...d }));
  }

  #delivery(id: number): DeliveryRecord | undefined {
    return this.deliveries.find((d) => d.id === id);
  }

  async markDelivered(id: number, responseStatus: number | null): Promise<void> {
    const d = this.#delivery(id);
    if (!d) return;
    d.status = 'delivered';
    d.attempts += 1;
    d.responseStatus = responseStatus;
    d.deliveredAt = new Date();
    d.lastError = null;
  }

  async markRetry(id: number, attempts: number, nextRetryAt: Date, error: string, responseStatus: number | null): Promise<void> {
    const d = this.#delivery(id);
    if (!d) return;
    d.attempts = attempts;
    d.nextRetryAt = nextRetryAt;
    d.lastError = error;
    d.responseStatus = responseStatus;
  }

  async markDead(id: number, attempts: number, error: string, responseStatus: number | null): Promise<void> {
    const d = this.#delivery(id);
    if (!d) return;
    d.status = 'dead';
    d.attempts = attempts;
    d.lastError = error;
    d.responseStatus = responseStatus;
  }

  async listDeliveries(monitorId: string, limit: number): Promise<DeliveryRecord[]> {
    return [...this.deliveries]
      .filter((d) => d.monitorId === monitorId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map((d) => ({ ...d }));
  }

  async replayDelivery(monitorId: string, deliveryId: number): Promise<DeliveryRecord | undefined> {
    const d = this.deliveries.find((x) => x.id === deliveryId && x.monitorId === monitorId);
    if (!d || d.status !== 'dead') return undefined;
    d.status = 'pending';
    d.attempts = 0;
    d.lastError = null;
    d.nextRetryAt = new Date();
    return { ...d };
  }
}

// ---------------------------------------------------------------- postgres

interface MonitorRow {
  id: string;
  api_key_id: string | null;
  urls: string[];
  schedule: Schedule;
  diff_config: DiffOptions;
  json_options: MonitorJsonOptions | null;
  trigger_config: TriggerOptions;
  scrape_options: MonitorScrapeOptions;
  webhook: MonitorWebhook | null;
  sensitivity: Sensitivity;
  status: MonitorStatus;
  created_at: Date;
  updated_at: Date;
  last_checked_at: Date | null;
  next_check_at: Date | null;
  claimed_at: Date | null;
  last_change_at: Date | null;
  last_error: string | null;
  checks: number;
  changes: number;
  pages_unchanged: number;
}

const MONITOR_COLUMNS = `id, api_key_id, urls, schedule, diff_config, json_options, trigger_config, scrape_options,
  webhook, sensitivity, status, created_at, updated_at, last_checked_at, next_check_at, claimed_at,
  last_change_at, last_error, checks, changes, pages_unchanged`;

const CLAIMED_COLUMNS = `m.id, m.api_key_id, m.urls, m.schedule, m.diff_config, m.json_options, m.trigger_config,
  m.scrape_options, m.webhook, m.sensitivity, m.status, m.created_at, m.updated_at,
  m.last_checked_at, m.next_check_at, m.claimed_at, m.last_change_at, m.last_error, m.checks,
  m.changes, m.pages_unchanged`;

function rowToMonitor(row: MonitorRow): MonitorRecord {
  return {
    id: row.id,
    apiKeyId: row.api_key_id,
    url: row.urls[0] ?? '',
    schedule: row.schedule,
    scrapeOptions: row.scrape_options ?? {},
    diff: row.diff_config ?? { granularity: 'word', inline: true },
    jsonOptions: row.json_options ?? null,
    trigger: row.trigger_config ?? {},
    sensitivity: row.sensitivity,
    webhook: row.webhook,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCheckedAt: row.last_checked_at,
    nextCheckAt: row.next_check_at,
    claimedAt: row.claimed_at,
    lastChangeAt: row.last_change_at,
    lastError: row.last_error,
    checks: row.checks,
    changes: row.changes,
    pagesUnchanged: row.pages_unchanged,
  };
}

interface SnapshotRow {
  id: string;
  monitor_id: string;
  url: string;
  content_hash: string;
  content: string | null;
  captured_at: Date;
}

function rowToSnapshot(row: SnapshotRow): SnapshotRecord {
  return {
    id: Number(row.id),
    monitorId: row.monitor_id,
    url: row.url,
    contentHash: row.content_hash,
    content: row.content ?? '',
    capturedAt: row.captured_at,
  };
}

interface CheckRow {
  id: string;
  monitor_id: string;
  snapshot_id: string | null;
  checked_at: Date;
  changed: boolean;
  reason: CheckReason;
  diff: Diff | JsonDiff | null;
  error: string | null;
}

function rowToCheck(row: CheckRow): CheckRecord {
  return {
    id: Number(row.id),
    monitorId: row.monitor_id,
    snapshotId: row.snapshot_id === null ? null : Number(row.snapshot_id),
    checkedAt: row.checked_at,
    changed: row.changed,
    reason: row.reason,
    diff: row.diff,
    error: row.error,
  };
}

interface DeliveryRow {
  id: string;
  monitor_id: string;
  url: string;
  event_type: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  attempts: number;
  status: DeliveryStatus;
  last_error: string | null;
  response_status: number | null;
  next_retry_at: Date;
  created_at: Date;
  delivered_at: Date | null;
}

const DELIVERY_COLUMNS = `id, monitor_id, url, event_type, payload, dedupe_key, attempts, status,
  last_error, response_status, next_retry_at, created_at, delivered_at`;

function rowToDelivery(row: DeliveryRow): DeliveryRecord {
  return {
    id: Number(row.id),
    monitorId: row.monitor_id,
    url: row.url,
    eventType: row.event_type,
    payload: row.payload,
    dedupeKey: row.dedupe_key,
    attempts: row.attempts,
    status: row.status,
    lastError: row.last_error,
    responseStatus: row.response_status,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  };
}

export class PgMonitorStore implements MonitorStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async create(input: NewMonitor): Promise<MonitorRecord> {
    const { rows } = await this.#pool.query<MonitorRow>(
      `INSERT INTO monitors (api_key_id, urls, schedule, diff_config, json_options, trigger_config, scrape_options,
                             webhook, sensitivity, status, next_check_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
       RETURNING ${MONITOR_COLUMNS}`,
      [
        input.apiKeyId,
        [input.url],
        JSON.stringify(input.schedule),
        JSON.stringify(input.diff),
        input.jsonOptions ? JSON.stringify(input.jsonOptions) : null,
        JSON.stringify(input.trigger),
        JSON.stringify(input.scrapeOptions),
        input.webhook ? JSON.stringify(input.webhook) : null,
        input.sensitivity,
        input.nextCheckAt,
      ],
    );
    return rowToMonitor(rows[0]!);
  }

  async get(id: string): Promise<MonitorRecord | undefined> {
    const { rows } = await this.#pool.query<MonitorRow>(
      `SELECT ${MONITOR_COLUMNS} FROM monitors WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToMonitor(rows[0]) : undefined;
  }

  async list(apiKeyId: string | null): Promise<MonitorRecord[]> {
    const { rows } = await this.#pool.query<MonitorRow>(
      `SELECT ${MONITOR_COLUMNS} FROM monitors
        WHERE $1::uuid IS NULL OR api_key_id = $1
        ORDER BY created_at DESC
        LIMIT ${MONITOR_LIST_LIMIT}`,
      [apiKeyId],
    );
    return rows.map(rowToMonitor);
  }

  async update(id: string, patch: MonitorPatch): Promise<MonitorRecord | undefined> {
    const sets: string[] = ['updated_at = now()'];
    const values: unknown[] = [id];
    const push = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (patch.schedule !== undefined) push('schedule', JSON.stringify(patch.schedule));
    if (patch.scrapeOptions !== undefined) push('scrape_options', JSON.stringify(patch.scrapeOptions));
    if (patch.diff !== undefined) push('diff_config', JSON.stringify(patch.diff));
    if (patch.jsonOptions !== undefined) push('json_options', patch.jsonOptions ? JSON.stringify(patch.jsonOptions) : null);
    if (patch.trigger !== undefined) push('trigger_config', JSON.stringify(patch.trigger));
    if (patch.sensitivity !== undefined) push('sensitivity', patch.sensitivity);
    if (patch.webhook !== undefined) push('webhook', patch.webhook ? JSON.stringify(patch.webhook) : null);
    if (patch.status !== undefined) push('status', patch.status);
    if (patch.checkOutcome !== undefined) {
      values.push(patch.checkOutcome === 'error' ? 'error' : 'active');
      sets.push(`status = CASE WHEN status = 'paused' THEN status ELSE $${values.length} END`);
    }
    if (patch.nextCheckAt !== undefined) {
      push('next_check_at', patch.nextCheckAt);
      if (patch.nextCheckAt !== null) sets.push('claimed_at = NULL');
    }
    if (patch.lastCheckedAt !== undefined) push('last_checked_at', patch.lastCheckedAt);
    if (patch.lastChangeAt !== undefined) push('last_change_at', patch.lastChangeAt);
    if (patch.lastError !== undefined) push('last_error', patch.lastError);

    const { rows } = await this.#pool.query<MonitorRow>(
      `UPDATE monitors SET ${sets.join(', ')} WHERE id = $1 RETURNING ${MONITOR_COLUMNS}`,
      values,
    );
    return rows[0] ? rowToMonitor(rows[0]) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query('DELETE FROM monitors WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  async claimDue(now: Date, limit: number): Promise<MonitorRecord[]> {
    return transaction(async (client) => {
      const { rows } = await client.query<MonitorRow>(
        `WITH due AS (
           SELECT id FROM monitors
            WHERE status IN ('active', 'error') AND next_check_at IS NOT NULL AND next_check_at <= $1
            ORDER BY next_check_at
            LIMIT $2
            FOR UPDATE SKIP LOCKED
         )
         UPDATE monitors m SET next_check_at = NULL, claimed_at = $1
           FROM due WHERE m.id = due.id
         RETURNING ${CLAIMED_COLUMNS}`,
        [now, limit],
      );
      return rows.map(rowToMonitor);
    });
  }

  async claim(id: string, now: Date): Promise<MonitorRecord | undefined> {
    const { rows } = await this.#pool.query<MonitorRow>(
      `UPDATE monitors m SET next_check_at = NULL, claimed_at = $2
        WHERE m.id = $1 AND m.status <> 'paused' AND m.next_check_at IS NOT NULL
        RETURNING ${CLAIMED_COLUMNS}`,
      [id, now],
    );
    return rows[0] ? rowToMonitor(rows[0]) : undefined;
  }

  async listStuck(before: Date): Promise<MonitorRecord[]> {
    const { rows } = await this.#pool.query<MonitorRow>(
      `SELECT ${MONITOR_COLUMNS} FROM monitors
        WHERE status IN ('active', 'error') AND next_check_at IS NULL
          AND (claimed_at IS NULL OR claimed_at < $1)`,
      [before],
    );
    return rows.map(rowToMonitor);
  }

  async bumpCounters(id: string, counters: CheckCounters): Promise<void> {
    await this.#pool.query(
      `UPDATE monitors
          SET checks = checks + $2, changes = changes + $3, pages_unchanged = pages_unchanged + $4
        WHERE id = $1`,
      [id, counters.checked ? 1 : 0, counters.changed ? 1 : 0, counters.unchanged ? 1 : 0],
    );
  }

  async latestSnapshot(monitorId: string): Promise<SnapshotRecord | undefined> {
    const { rows } = await this.#pool.query<SnapshotRow>(
      `SELECT id, monitor_id, url, content_hash, content, captured_at
         FROM monitor_snapshots WHERE monitor_id = $1
        ORDER BY captured_at DESC, id DESC LIMIT 1`,
      [monitorId],
    );
    return rows[0] ? rowToSnapshot(rows[0]) : undefined;
  }

  async getSnapshot(monitorId: string, snapshotId: number): Promise<SnapshotRecord | undefined> {
    const { rows } = await this.#pool.query<SnapshotRow>(
      `SELECT id, monitor_id, url, content_hash, content, captured_at
         FROM monitor_snapshots WHERE monitor_id = $1 AND id = $2`,
      [monitorId, snapshotId],
    );
    return rows[0] ? rowToSnapshot(rows[0]) : undefined;
  }

  async saveSnapshot(input: Omit<SnapshotRecord, 'id'>): Promise<SnapshotRecord> {
    const { rows } = await this.#pool.query<SnapshotRow>(
      `INSERT INTO monitor_snapshots (monitor_id, url, content_hash, content, captured_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, monitor_id, url, content_hash, content, captured_at`,
      [input.monitorId, input.url, input.contentHash, input.content, input.capturedAt],
    );
    return rowToSnapshot(rows[0]!);
  }

  async pruneSnapshots(monitorId: string, keep: number, maxAgeDays: number): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `DELETE FROM monitor_snapshots
        WHERE monitor_id = $1
          AND id <> (SELECT id FROM monitor_snapshots WHERE monitor_id = $1
                      ORDER BY captured_at DESC, id DESC LIMIT 1)
          AND (
            id NOT IN (SELECT id FROM monitor_snapshots WHERE monitor_id = $1
                        ORDER BY captured_at DESC, id DESC LIMIT $2)
            OR captured_at < now() - ($3::int * interval '1 day')
          )`,
      [monitorId, keep, maxAgeDays],
    );
    return rowCount ?? 0;
  }

  async recordCheck(input: NewCheck): Promise<CheckRecord> {
    const { rows } = await this.#pool.query<CheckRow>(
      `INSERT INTO monitor_checks (monitor_id, snapshot_id, checked_at, changed, reason, diff, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, monitor_id, snapshot_id, checked_at, changed, reason, diff, error`,
      [
        input.monitorId,
        input.snapshotId,
        input.checkedAt,
        input.changed,
        input.reason,
        input.diff ? JSON.stringify(input.diff) : null,
        input.error,
      ],
    );
    return rowToCheck(rows[0]!);
  }

  async pruneChecks(monitorId: string, keep: number, maxAgeDays: number): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `DELETE FROM monitor_checks
        WHERE monitor_id = $1
          AND id <> (SELECT id FROM monitor_checks WHERE monitor_id = $1 ORDER BY id DESC LIMIT 1)
          AND (
            id NOT IN (SELECT id FROM monitor_checks WHERE monitor_id = $1 ORDER BY id DESC LIMIT $2)
            OR checked_at < now() - ($3::int * interval '1 day')
          )`,
      [monitorId, Math.max(1, keep), maxAgeDays],
    );
    return rowCount ?? 0;
  }

  async history(monitorId: string, options: { limit: number; before?: number | undefined }): Promise<CheckRecord[]> {
    const { rows } = await this.#pool.query<CheckRow>(
      `SELECT id, monitor_id, snapshot_id, checked_at, changed, reason, diff, error
         FROM monitor_checks
        WHERE monitor_id = $1 AND ($2::bigint IS NULL OR id < $2)
        ORDER BY id DESC
        LIMIT $3`,
      [monitorId, options.before ?? null, options.limit],
    );
    return rows.map(rowToCheck);
  }

  async enqueueDelivery(input: NewDelivery): Promise<DeliveryRecord | undefined> {
    const { rows } = await this.#pool.query<DeliveryRow>(
      `INSERT INTO webhook_deliveries (monitor_id, url, event_type, payload, dedupe_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING ${DELIVERY_COLUMNS}`,
      [input.monitorId, input.url, input.eventType, JSON.stringify(input.payload), input.dedupeKey],
    );
    return rows[0] ? rowToDelivery(rows[0]) : undefined;
  }

  async claimDeliveries(now: Date, limit: number, leaseMs: number): Promise<DeliveryRecord[]> {
    return transaction(async (client) => {
      const { rows } = await client.query<DeliveryRow>(
        `WITH due AS (
           SELECT id FROM webhook_deliveries
            WHERE status = 'pending' AND monitor_id IS NOT NULL AND next_retry_at <= $1
            ORDER BY next_retry_at
            LIMIT $2
            FOR UPDATE SKIP LOCKED
         )
         UPDATE webhook_deliveries d SET next_retry_at = $1 + ($3::int * interval '1 millisecond')
           FROM due WHERE d.id = due.id
         RETURNING d.id, d.monitor_id, d.url, d.event_type, d.payload, d.dedupe_key, d.attempts,
                   d.status, d.last_error, d.response_status, d.next_retry_at, d.created_at, d.delivered_at`,
        [now, limit, leaseMs],
      );
      return rows.map(rowToDelivery);
    });
  }

  async markDelivered(id: number, responseStatus: number | null): Promise<void> {
    await this.#pool.query(
      `UPDATE webhook_deliveries
          SET status = 'delivered', attempts = attempts + 1, response_status = $2,
              delivered_at = now(), last_error = NULL
        WHERE id = $1`,
      [id, responseStatus],
    );
  }

  async markRetry(id: number, attempts: number, nextRetryAt: Date, error: string, responseStatus: number | null): Promise<void> {
    await this.#pool.query(
      `UPDATE webhook_deliveries
          SET attempts = $2, next_retry_at = $3, last_error = $4, response_status = $5
        WHERE id = $1`,
      [id, attempts, nextRetryAt, error, responseStatus],
    );
  }

  async markDead(id: number, attempts: number, error: string, responseStatus: number | null): Promise<void> {
    await this.#pool.query(
      `UPDATE webhook_deliveries
          SET status = 'dead', attempts = $2, last_error = $3, response_status = $4
        WHERE id = $1`,
      [id, attempts, error, responseStatus],
    );
  }

  async listDeliveries(monitorId: string, limit: number): Promise<DeliveryRecord[]> {
    const { rows } = await this.#pool.query<DeliveryRow>(
      `SELECT ${DELIVERY_COLUMNS} FROM webhook_deliveries
        WHERE monitor_id = $1 ORDER BY id DESC LIMIT $2`,
      [monitorId, limit],
    );
    return rows.map(rowToDelivery);
  }

  async replayDelivery(monitorId: string, deliveryId: number): Promise<DeliveryRecord | undefined> {
    const { rows } = await this.#pool.query<DeliveryRow>(
      `UPDATE webhook_deliveries
          SET status = 'pending', attempts = 0, last_error = NULL, next_retry_at = now()
        WHERE id = $1 AND monitor_id = $2 AND status = 'dead'
        RETURNING ${DELIVERY_COLUMNS}`,
      [deliveryId, monitorId],
    );
    return rows[0] ? rowToDelivery(rows[0]) : undefined;
  }
}
