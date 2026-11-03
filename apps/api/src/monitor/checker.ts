import { createHash } from 'node:crypto';
import type { Log } from '../core/logger.js';
import { boundedDiff, diffJson, diffText, summarizeDiff, type Diff, type JsonDiff } from './diff.js';
import { normalizeForComparison } from './sensitivity.js';
import type { CheckRecord, MonitorEvent, MonitorRecord, MonitorStore, SnapshotRecord } from './store.js';
import { evaluateTrigger, type TriggerReason } from './triggers.js';


export type FetchOutcome =
  | { ok: true; content: string; contentHash?: string | undefined }
  | { ok: false; reason: string; detail?: string | undefined };

export interface CheckerDeps {
  store: MonitorStore;
  fetchPage: (monitor: MonitorRecord) => Promise<FetchOutcome>;
  extractJson?: ((monitor: MonitorRecord, content: string) => Promise<Record<string, unknown>>) | undefined;
  retention: { keep: number; maxAgeDays: number; keepChecks: number };
  maxContentBytes?: number | undefined;
  basePath?: string | undefined;
  logger?: Log | undefined;
  now?: (() => Date) | undefined;
}

export interface CheckOutcome {
  check: CheckRecord;
  snapshot: SnapshotRecord | null;
  webhookQueued: boolean;
}

export const DEFAULT_MAX_CONTENT_BYTES = 1_048_576;

export const MAX_DIFF_BYTES = 131_072;

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function snapshotUrl(basePath: string, monitorId: string, snapshotId: number): string {
  return `${basePath}/${monitorId}/snapshots/${snapshotId}`;
}

export function includeSelectorsFor(monitor: MonitorRecord): string[] {
  if (monitor.scrapeOptions.includeSelectors && monitor.scrapeOptions.includeSelectors.length > 0) {
    return monitor.scrapeOptions.includeSelectors;
  }
  return monitor.trigger.selector ? [monitor.trigger.selector] : [];
}

function wants(monitor: MonitorRecord, event: MonitorEvent): boolean {
  return monitor.webhook !== null && monitor.webhook.events.includes(event);
}

function diffForPayload(diff: Diff | JsonDiff, inline: boolean): Record<string, unknown> {
  if (diff.granularity === 'json') {
    return { granularity: 'json', fields: diff.fields, changeRatio: diff.changeRatio, summary: diff.summary };
  }
  const counts = {
    granularity: diff.granularity,
    added: diff.added,
    removed: diff.removed,
    changeRatio: diff.changeRatio,
    ...(diff.coarse ? { coarse: true } : {}),
  };
  if (!inline) return { ...counts, summary: summarizeDiff({ ...diff, ops: [] }) };
  const bounded = boundedDiff(diff, MAX_DIFF_BYTES);
  const withSummary = { ...counts, summary: diff.summary };
  return bounded.truncated ? { ...withSummary, truncated: true } : { ...withSummary, text: bounded.text, ops: bounded.ops };
}

export async function runCheck(monitor: MonitorRecord, deps: CheckerDeps): Promise<CheckOutcome> {
  const now = deps.now ?? (() => new Date());
  const basePath = deps.basePath ?? '/v1/monitor';
  const maxContentBytes = deps.maxContentBytes ?? DEFAULT_MAX_CONTENT_BYTES;
  const checkedAt = now();
  let outcome = await deps.fetchPage(monitor);

  if (outcome.ok && Buffer.byteLength(outcome.content, 'utf8') > maxContentBytes) {
    outcome = {
      ok: false,
      reason: 'too_large',
      detail: `The page produced more than ${maxContentBytes} bytes of text; narrow it with includeSelectors or trigger.selector.`,
    };
  }

  if (!outcome.ok) {
    const message = outcome.detail ? `${outcome.reason}: ${outcome.detail}` : outcome.reason;
    const check = await deps.store.recordCheck({
      monitorId: monitor.id,
      snapshotId: null,
      checkedAt,
      changed: false,
      reason: 'error',
      diff: null,
      error: message,
    });
    await deps.store.pruneChecks(monitor.id, deps.retention.keepChecks, deps.retention.maxAgeDays);
    await deps.store.bumpCounters(monitor.id, { checked: true, changed: false, unchanged: false });
    await deps.store.update(monitor.id, { lastCheckedAt: checkedAt, lastError: message, checkOutcome: 'error' });

    let webhookQueued = false;
    if (wants(monitor, 'failed')) {
      webhookQueued = await enqueue(deps.store, monitor, 'failed', check.id, {
        event: 'failed',
        monitorId: monitor.id,
        url: monitor.url,
        checkedAt: checkedAt.toISOString(),
        changed: false,
        failure: { reason: outcome.reason, detail: outcome.detail ?? null },
        metadata: monitor.webhook?.metadata ?? null,
      });
    }

    deps.logger?.warn({ monitorId: monitor.id, url: monitor.url, reason: outcome.reason }, 'monitor check failed');
    return { check, snapshot: null, webhookQueued };
  }

  const content = outcome.content;
  const contentHash = outcome.contentHash ?? hashContent(content);
  const previous = await deps.store.latestSnapshot(monitor.id);

  const finish = async (
    input: {
      reason: CheckRecord['reason'];
      changed: boolean;
      diff: Diff | JsonDiff | null;
      snapshot: SnapshotRecord | null;
      triggerReason?: TriggerReason | undefined;
    },
  ): Promise<CheckOutcome> => {
    const diff = input.diff ? { ...input.diff, summary: summarizeDiff(input.diff) } : null;
    const check = await deps.store.recordCheck({
      monitorId: monitor.id,
      snapshotId: input.snapshot?.id ?? previous?.id ?? null,
      checkedAt,
      changed: input.changed,
      reason: input.reason,
      diff: diff ? (diff.granularity === 'json' ? diff : boundedDiff(diff, MAX_DIFF_BYTES)) : null,
      error: null,
    });
    await deps.store.pruneChecks(monitor.id, deps.retention.keepChecks, deps.retention.maxAgeDays);

    await deps.store.bumpCounters(monitor.id, {
      checked: true,
      changed: input.changed,
      unchanged: input.reason === 'unchanged' || input.reason === 'filtered',
    });
    await deps.store.update(monitor.id, {
      lastCheckedAt: checkedAt,
      lastError: null,
      checkOutcome: 'ok',
      ...(input.changed ? { lastChangeAt: checkedAt } : {}),
    });

    if (input.snapshot) {
      await deps.store.pruneSnapshots(monitor.id, deps.retention.keep, deps.retention.maxAgeDays);
    }

    const events: MonitorEvent[] = [];
    if (input.changed && wants(monitor, 'changed')) events.push('changed');
    if (wants(monitor, 'checked')) events.push('checked');

    let webhookQueued = false;
    const current = input.snapshot ?? previous ?? null;
    for (const event of events) {
      const queued = await enqueue(deps.store, monitor, event, check.id, {
        event,
        monitorId: monitor.id,
        url: monitor.url,
        checkedAt: checkedAt.toISOString(),
        changed: input.changed,
        reason: input.triggerReason ?? input.reason,
        diff: diff ? diffForPayload(diff, monitor.diff.inline) : null,
        snapshot: current
          ? { id: current.id, contentHash: current.contentHash, snapshotUrl: snapshotUrl(basePath, monitor.id, current.id) }
          : null,
        previousSnapshot:
          input.snapshot && previous
            ? { id: previous.id, contentHash: previous.contentHash, snapshotUrl: snapshotUrl(basePath, monitor.id, previous.id) }
            : null,
        metadata: monitor.webhook?.metadata ?? null,
      });
      webhookQueued = webhookQueued || queued;
    }

    return { check, snapshot: input.snapshot, webhookQueued };
  };

  if (!previous) {
    const snapshot = await deps.store.saveSnapshot({
      monitorId: monitor.id,
      url: monitor.url,
      contentHash,
      content,
      capturedAt: checkedAt,
    });
    return finish({ reason: 'first', changed: false, diff: null, snapshot });
  }

  if (previous.contentHash === contentHash) {
    return finish({ reason: 'unchanged', changed: false, diff: null, snapshot: null });
  }

  const before = normalizeForComparison(previous.content, monitor.sensitivity);
  const after = normalizeForComparison(content, monitor.sensitivity);

  if (before === after) {
    return finish({ reason: 'filtered', changed: false, diff: null, snapshot: null });
  }

  const textDiff = diffText(before, after, monitor.diff.granularity);

  if (textDiff.added === 0 && textDiff.removed === 0) {
    return finish({ reason: 'filtered', changed: false, diff: null, snapshot: null });
  }

  const verdict = evaluateTrigger(monitor.trigger, { before, after, diff: textDiff });

  const snapshot = await deps.store.saveSnapshot({
    monitorId: monitor.id,
    url: monitor.url,
    contentHash,
    content,
    capturedAt: checkedAt,
  });

  if (!verdict.fire) {
    return finish({ reason: 'trigger_not_met', changed: false, diff: textDiff, snapshot, triggerReason: verdict.reason });
  }

  let diff: Diff | JsonDiff = textDiff;
  if (monitor.jsonOptions && deps.extractJson) {
    try {
      const [beforeJson, afterJson] = await Promise.all([
        deps.extractJson(monitor, previous.content),
        deps.extractJson(monitor, content),
      ]);
      diff = diffJson(beforeJson, afterJson);
    } catch (error) {
      deps.logger?.warn({ error, monitorId: monitor.id }, 'monitor JSON extraction failed; falling back to the text diff');
    }
  }

  return finish({ reason: 'changed', changed: true, diff, snapshot, triggerReason: verdict.reason });
}

async function enqueue(
  store: MonitorStore,
  monitor: MonitorRecord,
  event: MonitorEvent,
  checkId: number,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!monitor.webhook) return false;
  const queued = await store.enqueueDelivery({
    monitorId: monitor.id,
    url: monitor.webhook.url,
    eventType: event,
    payload,
    dedupeKey: `monitor:${monitor.id}:check:${checkId}:${event}`,
  });
  return queued !== undefined;
}
