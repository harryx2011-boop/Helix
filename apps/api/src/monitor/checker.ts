import { createHash } from 'node:crypto';
import type { Log } from '../core/logger.js';
import { diffText, type Diff } from './diff.js';
import { normalizeForComparison } from './sensitivity.js';
import type { CheckRecord, MonitorEvent, MonitorRecord, MonitorStore, SnapshotRecord } from './store.js';
import { evaluateTrigger, type TriggerReason } from './triggers.js';

/**
 * One check of one monitor.
 *
 * Fetch the page, compare it with the last snapshot, decide whether that
 * counts as a change, record the outcome, and queue a webhook if it does.
 * Unchanged pages store no new snapshot and send nothing — the check row is
 * the only trace they leave, which is what makes them free.
 */

export type FetchOutcome =
  | { ok: true; content: string; contentHash?: string | undefined }
  | { ok: false; reason: string; detail?: string | undefined };

export interface CheckerDeps {
  store: MonitorStore;
  fetchPage: (monitor: MonitorRecord) => Promise<FetchOutcome>;
  retention: { keep: number; maxAgeDays: number };
  /** Base path used to build `snapshotUrl`, e.g. `/v1/monitor`. */
  basePath?: string | undefined;
  logger?: Log | undefined;
  now?: (() => Date) | undefined;
}

export interface CheckOutcome {
  check: CheckRecord;
  snapshot: SnapshotRecord | null;
  webhookQueued: boolean;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function snapshotUrl(basePath: string, monitorId: string, snapshotId: number): string {
  return `${basePath}/${monitorId}/snapshots/${snapshotId}`;
}

function wants(monitor: MonitorRecord, event: MonitorEvent): boolean {
  return monitor.webhook !== null && monitor.webhook.events.includes(event);
}

function diffForPayload(diff: Diff, inline: boolean): Record<string, unknown> {
  const summary = {
    granularity: diff.granularity,
    added: diff.added,
    removed: diff.removed,
    changeRatio: diff.changeRatio,
  };
  return inline ? { ...summary, text: diff.text, ops: diff.ops } : summary;
}

export async function runCheck(monitor: MonitorRecord, deps: CheckerDeps): Promise<CheckOutcome> {
  const now = deps.now ?? (() => new Date());
  const basePath = deps.basePath ?? '/v1/monitor';
  const checkedAt = now();
  const outcome = await deps.fetchPage(monitor);

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
    await deps.store.bumpCounters(monitor.id, { checked: true, changed: false, unchanged: false });
    await deps.store.update(monitor.id, { lastCheckedAt: checkedAt, lastError: message, status: 'error' });

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
      diff: Diff | null;
      snapshot: SnapshotRecord | null;
      triggerReason?: TriggerReason | undefined;
    },
  ): Promise<CheckOutcome> => {
    const check = await deps.store.recordCheck({
      monitorId: monitor.id,
      snapshotId: input.snapshot?.id ?? previous?.id ?? null,
      checkedAt,
      changed: input.changed,
      reason: input.reason,
      diff: input.diff,
      error: null,
    });

    await deps.store.bumpCounters(monitor.id, {
      checked: true,
      changed: input.changed,
      unchanged: input.reason === 'unchanged' || input.reason === 'filtered',
    });
    await deps.store.update(monitor.id, {
      lastCheckedAt: checkedAt,
      lastError: null,
      status: monitor.status === 'error' ? 'active' : monitor.status,
      ...(input.changed ? { lastChangeAt: checkedAt } : {}),
    });

    if (input.snapshot) {
      await deps.store.pruneSnapshots(monitor.id, deps.retention.keep, deps.retention.maxAgeDays);
    }

    let webhookQueued = false;
    const event: MonitorEvent | null = input.changed ? 'changed' : wants(monitor, 'checked') ? 'checked' : null;
    if (event && wants(monitor, event)) {
      const current = input.snapshot ?? previous ?? null;
      webhookQueued = await enqueue(deps.store, monitor, event, check.id, {
        event,
        monitorId: monitor.id,
        url: monitor.url,
        checkedAt: checkedAt.toISOString(),
        changed: input.changed,
        reason: input.triggerReason ?? input.reason,
        diff: input.diff ? diffForPayload(input.diff, monitor.diff.inline) : null,
        snapshot: current
          ? { id: current.id, contentHash: current.contentHash, snapshotUrl: snapshotUrl(basePath, monitor.id, current.id) }
          : null,
        previousSnapshot:
          input.snapshot && previous
            ? { id: previous.id, contentHash: previous.contentHash, snapshotUrl: snapshotUrl(basePath, monitor.id, previous.id) }
            : null,
        metadata: monitor.webhook?.metadata ?? null,
      });
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

  const diff = diffText(before, after, monitor.diff.granularity);
  const verdict = evaluateTrigger(monitor.trigger, { before, after, diff });

  // The baseline moves whenever the content really differs, so the next
  // keyword check compares against what the page says now.
  const snapshot = await deps.store.saveSnapshot({
    monitorId: monitor.id,
    url: monitor.url,
    contentHash,
    content,
    capturedAt: checkedAt,
  });

  if (!verdict.fire) {
    return finish({ reason: 'trigger_not_met', changed: false, diff, snapshot, triggerReason: verdict.reason });
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
