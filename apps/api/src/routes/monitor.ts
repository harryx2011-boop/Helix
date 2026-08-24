import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { runCheck, snapshotUrl, type CheckerDeps } from '../monitor/checker.js';
import { assertMinimumInterval, nextRun, normalizeSchedule, ScheduleError } from '../monitor/schedule.js';
import type {
  CheckRecord,
  DeliveryRecord,
  MonitorRecord,
  MonitorStore,
  MonitorWebhook,
  SnapshotRecord,
} from '../monitor/store.js';

/**
 * Monitor.
 *
 * Create a watch on one URL, read its state and timeline, adjust or pause it,
 * delete it. Checks run on the scheduler, not in the request; `POST .../check`
 * runs one right now for callers who would rather not wait for the next slot.
 */

const BASE_PATH = '/v1/monitor';
const HISTORY_PAGE = 50;

const ScheduleSchema = z.union([
  z.string().min(1),
  z.object({
    cron: z.string().min(1).optional(),
    every: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
  }),
]);

const ScrapeOptionsSchema = z.object({
  formats: z.array(z.literal('markdown')).optional(),
  tier: z.enum(['auto', 'plain', 'tls', 'lightpanda', 'chromium']).optional(),
  onlyMainContent: z.boolean().optional(),
  includeSelectors: z.array(z.string()).optional(),
  excludeSelectors: z.array(z.string()).optional(),
  extractor: z.enum(['trafilatura', 'readability', 'auto']).optional(),
  waitFor: z.number().int().min(0).max(30_000).optional(),
  timeout: z.number().int().min(1_000).max(300_000).optional(),
  headers: z.record(z.string()).optional(),
  profile: z.string().optional(),
  proxy: z
    .object({
      url: z.string(),
      sessionId: z.string().optional(),
      geo: z.string().length(2).optional(),
    })
    .optional(),
});

const DiffSchema = z.object({
  granularity: z.enum(['word', 'line', 'character']).default('word'),
  inline: z.boolean().default(true),
});

const TriggerSchema = z.object({
  keywordAppears: z.string().min(1).max(500).optional(),
  keywordDisappears: z.string().min(1).max(500).optional(),
  selector: z.string().min(1).optional(),
  minChangeRatio: z.number().min(0).max(1).optional(),
});

const WebhookSchema = z.union([
  z.string().url(),
  z.object({
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    events: z.array(z.enum(['changed', 'checked', 'failed'])).min(1).default(['changed']),
    metadata: z.record(z.unknown()).optional(),
    secret: z.string().min(8).max(256).optional(),
  }),
]);

const CreateSchema = z.object({
  url: z.string().url(),
  schedule: ScheduleSchema,
  scrapeOptions: ScrapeOptionsSchema.default({}),
  diff: DiffSchema.default({}),
  trigger: TriggerSchema.default({}),
  sensitivity: z.enum(['any', 'significant']).default('any'),
  webhook: WebhookSchema.optional(),
});

const PatchSchema = z
  .object({
    schedule: ScheduleSchema.optional(),
    scrapeOptions: ScrapeOptionsSchema.optional(),
    diff: DiffSchema.optional(),
    trigger: TriggerSchema.optional(),
    sensitivity: z.enum(['any', 'significant']).optional(),
    webhook: WebhookSchema.nullable().optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'nothing to update' });

export interface MonitorRouteDeps {
  store: MonitorStore;
  fetchPage: CheckerDeps['fetchPage'];
  minIntervalSeconds: number;
  retention: { keep: number; maxAgeDays: number };
}

function invalid(reply: FastifyReply, request: FastifyRequest, message: string, field?: string | undefined) {
  return reply.code(400).send({
    error: 'invalid_request',
    message,
    ...(field !== undefined ? { field } : {}),
    requestId: request.id,
  });
}

function zodInvalid(reply: FastifyReply, request: FastifyRequest, error: z.ZodError) {
  const first = error.issues[0];
  const field = first?.path.join('.');
  return invalid(reply, request, first ? `${field || 'body'}: ${first.message}` : 'invalid request body', field);
}

function notFound(reply: FastifyReply, request: FastifyRequest, what = 'monitor') {
  return reply.code(404).send({ error: 'not_found', message: `No such ${what}.`, requestId: request.id });
}

function toWebhook(input: z.infer<typeof WebhookSchema>): MonitorWebhook {
  if (typeof input === 'string') return { url: input, events: ['changed'] };
  return {
    url: input.url,
    events: input.events,
    ...(input.headers !== undefined ? { headers: input.headers } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    ...(input.secret !== undefined ? { secret: input.secret } : {}),
  };
}

/** `trigger.selector` narrows the read; it is the same knob as `includeSelectors`. */
function applySelector(
  scrapeOptions: z.infer<typeof ScrapeOptionsSchema>,
  trigger: z.infer<typeof TriggerSchema>,
): MonitorRecord['scrapeOptions'] {
  const { formats: _formats, ...rest } = scrapeOptions;
  if (trigger.selector && !(rest.includeSelectors && rest.includeSelectors.length > 0)) {
    return { ...rest, includeSelectors: [trigger.selector] };
  }
  return rest;
}

function publicWebhook(webhook: MonitorWebhook | null): Record<string, unknown> | null {
  if (!webhook) return null;
  return {
    url: webhook.url,
    events: webhook.events,
    metadata: webhook.metadata ?? null,
    headers: webhook.headers ? Object.keys(webhook.headers) : [],
    signed: webhook.secret !== undefined,
  };
}

function serializeSchedule(schedule: MonitorRecord['schedule']): Record<string, unknown> {
  return {
    cron: schedule.cron,
    timezone: schedule.timezone,
    ...(schedule.every !== undefined ? { every: schedule.every } : {}),
  };
}

export function serializeMonitor(monitor: MonitorRecord, latest?: SnapshotRecord | null): Record<string, unknown> {
  return {
    id: monitor.id,
    monitorId: monitor.id,
    url: monitor.url,
    schedule: serializeSchedule(monitor.schedule),
    scrapeOptions: monitor.scrapeOptions,
    diff: monitor.diff,
    trigger: monitor.trigger,
    sensitivity: monitor.sensitivity,
    webhook: publicWebhook(monitor.webhook),
    status: monitor.status,
    createdAt: monitor.createdAt.toISOString(),
    updatedAt: monitor.updatedAt.toISOString(),
    lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
    nextCheckAt: monitor.nextCheckAt?.toISOString() ?? null,
    lastChangeAt: monitor.lastChangeAt?.toISOString() ?? null,
    lastError: monitor.lastError,
    stats: { checks: monitor.checks, changes: monitor.changes, pagesUnchanged: monitor.pagesUnchanged },
    ...(latest !== undefined
      ? {
          latestSnapshot: latest
            ? {
                id: latest.id,
                capturedAt: latest.capturedAt.toISOString(),
                contentHash: latest.contentHash,
                markdown: latest.content,
                snapshotUrl: snapshotUrl(BASE_PATH, monitor.id, latest.id),
              }
            : null,
        }
      : {}),
  };
}

function serializeCheck(monitorId: string, check: CheckRecord): Record<string, unknown> {
  return {
    id: check.id,
    checkedAt: check.checkedAt.toISOString(),
    changed: check.changed,
    reason: check.reason,
    diff: check.diff,
    error: check.error,
    snapshotUrl: check.snapshotId === null ? null : snapshotUrl(BASE_PATH, monitorId, check.snapshotId),
  };
}

function serializeDelivery(delivery: DeliveryRecord): Record<string, unknown> {
  return {
    id: delivery.id,
    event: delivery.eventType,
    url: delivery.url,
    status: delivery.status,
    attempts: delivery.attempts,
    lastError: delivery.lastError,
    responseStatus: delivery.responseStatus,
    nextRetryAt: delivery.status === 'pending' ? delivery.nextRetryAt.toISOString() : null,
    createdAt: delivery.createdAt.toISOString(),
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
  };
}

export async function registerMonitor(app: FastifyInstance, deps: MonitorRouteDeps): Promise<void> {
  const checkerDeps = (request: FastifyRequest): CheckerDeps => ({
    store: deps.store,
    fetchPage: deps.fetchPage,
    retention: deps.retention,
    basePath: BASE_PATH,
    logger: request.log,
  });

  const resolveSchedule = (input: z.infer<typeof ScheduleSchema>, reply: FastifyReply, request: FastifyRequest) => {
    try {
      const schedule = normalizeSchedule(input);
      assertMinimumInterval(schedule, deps.minIntervalSeconds);
      return schedule;
    } catch (error) {
      if (error instanceof ScheduleError) {
        void invalid(reply, request, error.message, error.field);
        return undefined;
      }
      throw error;
    }
  };

  app.post('/monitor', async (request, reply) => {
    const parsed = CreateSchema.safeParse(request.body);
    if (!parsed.success) return zodInvalid(reply, request, parsed.error);
    const body = parsed.data;

    const schedule = resolveSchedule(body.schedule, reply, request);
    if (!schedule) return reply;

    const { selector: _selector, ...trigger } = body.trigger;
    const monitor = await deps.store.create({
      apiKeyId: request.apiKey?.id ?? null,
      url: body.url,
      schedule,
      scrapeOptions: applySelector(body.scrapeOptions, body.trigger),
      diff: body.diff,
      trigger,
      sensitivity: body.sensitivity,
      webhook: body.webhook !== undefined ? toWebhook(body.webhook) : null,
      nextCheckAt: nextRun(schedule),
    });

    return reply.code(201).send({ success: true, ...serializeMonitor(monitor) });
  });

  app.get('/monitor', async (request, reply) => {
    const monitors = await deps.store.list(request.apiKey?.id ?? null);
    return reply.send({ success: true, monitors: monitors.map((m) => serializeMonitor(m)) });
  });

  app.get<{ Params: { id: string } }>('/monitor/:id', async (request, reply) => {
    const monitor = await deps.store.get(request.params.id);
    if (!monitor) return notFound(reply, request);
    const latest = await deps.store.latestSnapshot(monitor.id);
    return reply.send({ success: true, ...serializeMonitor(monitor, latest ?? null) });
  });

  app.patch<{ Params: { id: string } }>('/monitor/:id', async (request, reply) => {
    const existing = await deps.store.get(request.params.id);
    if (!existing) return notFound(reply, request);

    const parsed = PatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) return zodInvalid(reply, request, parsed.error);
    const body = parsed.data;

    const patch: Parameters<MonitorStore['update']>[1] = {};

    if (body.schedule !== undefined) {
      const schedule = resolveSchedule(body.schedule, reply, request);
      if (!schedule) return reply;
      patch.schedule = schedule;
      patch.nextCheckAt = nextRun(schedule);
    }

    if (body.scrapeOptions !== undefined || body.trigger !== undefined) {
      const scrape = body.scrapeOptions ?? existing.scrapeOptions;
      const trigger = body.trigger ?? existing.trigger;
      patch.scrapeOptions = applySelector(scrape, trigger);
      if (body.trigger !== undefined) {
        const { selector: _selector, ...rest } = body.trigger;
        patch.trigger = rest;
      }
    }

    if (body.diff !== undefined) patch.diff = body.diff;
    if (body.sensitivity !== undefined) patch.sensitivity = body.sensitivity;
    if (body.webhook !== undefined) patch.webhook = body.webhook === null ? null : toWebhook(body.webhook);

    if (body.status !== undefined) {
      patch.status = body.status;
      if (body.status === 'paused') {
        patch.nextCheckAt = null;
      } else if (existing.status !== 'active' || existing.nextCheckAt === null) {
        patch.nextCheckAt = nextRun(patch.schedule ?? existing.schedule);
        patch.lastError = null;
      }
    }

    const updated = await deps.store.update(existing.id, patch);
    if (!updated) return notFound(reply, request);
    return reply.send({ success: true, ...serializeMonitor(updated) });
  });

  app.delete<{ Params: { id: string } }>('/monitor/:id', async (request, reply) => {
    const deleted = await deps.store.delete(request.params.id);
    if (!deleted) return notFound(reply, request);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
    '/monitor/:id/history',
    async (request, reply) => {
      const monitor = await deps.store.get(request.params.id);
      if (!monitor) return notFound(reply, request);

      const limit = Math.min(HISTORY_PAGE, Math.max(1, Number.parseInt(request.query.limit ?? '', 10) || HISTORY_PAGE));
      const before = Number.parseInt(request.query.cursor ?? '', 10);
      const entries = await deps.store.history(monitor.id, {
        limit,
        before: Number.isFinite(before) ? before : undefined,
      });

      const last = entries[entries.length - 1];
      return reply.send({
        success: true,
        monitorId: monitor.id,
        entries: entries.map((check) => serializeCheck(monitor.id, check)),
        next: entries.length === limit && last ? `${BASE_PATH}/${monitor.id}/history?cursor=${last.id}` : null,
      });
    },
  );

  app.get<{ Params: { id: string; snapshotId: string } }>('/monitor/:id/snapshots/:snapshotId', async (request, reply) => {
    const snapshotId = Number.parseInt(request.params.snapshotId, 10);
    if (!Number.isFinite(snapshotId)) return notFound(reply, request, 'snapshot');
    const snapshot = await deps.store.getSnapshot(request.params.id, snapshotId);
    if (!snapshot) return notFound(reply, request, 'snapshot');
    return reply.send({
      success: true,
      id: snapshot.id,
      monitorId: snapshot.monitorId,
      url: snapshot.url,
      capturedAt: snapshot.capturedAt.toISOString(),
      contentHash: snapshot.contentHash,
      markdown: snapshot.content,
    });
  });

  app.post<{ Params: { id: string } }>('/monitor/:id/check', async (request, reply) => {
    const monitor = await deps.store.get(request.params.id);
    if (!monitor) return notFound(reply, request);

    const outcome = await runCheck(monitor, checkerDeps(request));
    const updated = (await deps.store.get(monitor.id)) ?? monitor;
    if (updated.status !== 'paused' && updated.nextCheckAt === null) {
      await deps.store.update(monitor.id, { nextCheckAt: nextRun(updated.schedule) });
    }

    return reply.send({
      success: true,
      monitorId: monitor.id,
      check: serializeCheck(monitor.id, outcome.check),
      webhookQueued: outcome.webhookQueued,
    });
  });

  app.get<{ Params: { id: string } }>('/monitor/:id/deliveries', async (request, reply) => {
    const monitor = await deps.store.get(request.params.id);
    if (!monitor) return notFound(reply, request);
    const deliveries = await deps.store.listDeliveries(monitor.id, 100);
    return reply.send({ success: true, monitorId: monitor.id, deliveries: deliveries.map(serializeDelivery) });
  });

  app.post<{ Params: { id: string; deliveryId: string } }>(
    '/monitor/:id/deliveries/:deliveryId/replay',
    async (request, reply) => {
      const deliveryId = Number.parseInt(request.params.deliveryId, 10);
      if (!Number.isFinite(deliveryId)) return notFound(reply, request, 'delivery');
      const replayed = await deps.store.replayDelivery(request.params.id, deliveryId);
      if (!replayed) {
        return reply.code(409).send({
          error: 'not_replayable',
          message: 'Only dead-lettered deliveries can be replayed.',
          requestId: request.id,
        });
      }
      return reply.send({ success: true, delivery: serializeDelivery(replayed) });
    },
  );
}
