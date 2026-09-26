import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { webhookTargetProblem } from '../core/webhook-target.js';
import { snapshotUrl, type CheckOutcome } from '../monitor/checker.js';
import { assertMinimumInterval, nextRun, normalizeSchedule, ScheduleError } from '../monitor/schedule.js';
import type { MonitorScheduler } from '../monitor/scheduler.js';
import type {
  CheckRecord,
  DeliveryRecord,
  MonitorJsonOptions,
  MonitorRecord,
  MonitorStore,
  MonitorWebhook,
  SnapshotRecord,
} from '../monitor/store.js';
import { MONITOR_LIST_LIMIT } from '../monitor/store.js';
import { PROVIDERS, rejectFabricationKeywords } from './scrape.js';

/**
 * Monitor.
 *
 * Create a watch on one URL, read its state and timeline, adjust or pause it,
 * delete it. Checks run on the scheduler, not in the request; `POST .../check`
 * asks the scheduler for one right now, under the same claim and budget.
 *
 * Every monitor belongs to the API key that created it. A key that holds
 * another key's monitor id gets 404, the same answer as for an id that does
 * not exist.
 */

const BASE_PATH = '/v1/monitor';
const HISTORY_PAGE = 50;

const ScheduleWindowSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
});

const ScheduleSchema = z.union([
  z.string().min(1),
  z.object({
    cron: z.string().min(1).optional(),
    every: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
    window: ScheduleWindowSchema.optional(),
  }),
]);

const ScrapeOptionsSchema = z.object({
  formats: z.array(z.literal('markdown')).optional(),
  tier: z.enum(['auto', 'plain', 'tls', 'lightpanda', 'chromium', 'camoufox']).optional(),
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

const DiffPatchSchema = z.object({
  granularity: z.enum(['word', 'line', 'character']).optional(),
  inline: z.boolean().optional(),
});

const JsonOptionsSchema = z.object({
  schema: z.record(z.unknown()),
  prompt: z.string().max(4_000).optional(),
  provider: z.enum(PROVIDERS).optional(),
  model: z.string().max(200).optional(),
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
  jsonOptions: JsonOptionsSchema.optional(),
  trigger: TriggerSchema.default({}),
  sensitivity: z.enum(['any', 'significant']).default('any'),
  webhook: WebhookSchema.optional(),
});

const PatchSchema = z
  .object({
    schedule: ScheduleSchema.optional(),
    scrapeOptions: ScrapeOptionsSchema.optional(),
    diff: DiffPatchSchema.optional(),
    jsonOptions: JsonOptionsSchema.nullable().optional(),
    trigger: TriggerSchema.optional(),
    sensitivity: z.enum(['any', 'significant']).optional(),
    webhook: WebhookSchema.nullable().optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'nothing to update' });

export interface MonitorRouteDeps {
  store: MonitorStore;
  scheduler: MonitorScheduler<CheckOutcome>;
  minIntervalSeconds: number;
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

function toScrapeOptions(input: z.infer<typeof ScrapeOptionsSchema>): MonitorRecord['scrapeOptions'] {
  const { formats: _formats, ...rest } = input;
  return rest;
}

function toJsonOptions(input: z.infer<typeof JsonOptionsSchema>): MonitorJsonOptions {
  return {
    schema: input.schema,
    ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
  };
}

/** `trigger.selector` and a non-empty `includeSelectors` name the same knob twice. */
function selectorConflict(scrape: MonitorRecord['scrapeOptions'], trigger: z.infer<typeof TriggerSchema>): boolean {
  return trigger.selector !== undefined && (scrape.includeSelectors?.length ?? 0) > 0;
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
    ...(schedule.window !== undefined ? { window: schedule.window } : {}),
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
    jsonOptions: monitor.jsonOptions,
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
  const owner = (request: FastifyRequest): string | null => request.apiKey?.id ?? null;

  /** The monitor, if it exists and belongs to the calling key. */
  const load = async (request: FastifyRequest<{ Params: { id: string } }>): Promise<MonitorRecord | undefined> => {
    const monitor = await deps.store.get(request.params.id);
    return monitor && monitor.apiKeyId === owner(request) ? monitor : undefined;
  };

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

  const resolveWebhook = (
    input: z.infer<typeof WebhookSchema>,
    reply: FastifyReply,
    request: FastifyRequest,
  ): MonitorWebhook | undefined => {
    const webhook = toWebhook(input);
    const problem = webhookTargetProblem(webhook.url);
    if (problem) {
      void invalid(reply, request, `webhook.url: ${problem}`, 'webhook.url');
      return undefined;
    }
    return webhook;
  };

  app.post('/monitor', async (request, reply) => {
    const parsed = CreateSchema.safeParse(request.body);
    if (!parsed.success) return zodInvalid(reply, request, parsed.error);
    const body = parsed.data;

    const schedule = resolveSchedule(body.schedule, reply, request);
    if (!schedule) return reply;

    const scrapeOptions = toScrapeOptions(body.scrapeOptions);
    if (selectorConflict(scrapeOptions, body.trigger)) {
      return invalid(reply, request, 'trigger.selector: set this or scrapeOptions.includeSelectors, not both', 'trigger.selector');
    }

    let webhook: MonitorWebhook | null = null;
    if (body.webhook !== undefined) {
      const resolved = resolveWebhook(body.webhook, reply, request);
      if (!resolved) return reply;
      webhook = resolved;
    }

    let jsonOptions: MonitorJsonOptions | null = null;
    if (body.jsonOptions !== undefined) {
      try {
        rejectFabricationKeywords(body.jsonOptions.schema, 'jsonOptions.schema');
      } catch (error) {
        const e = error as Error & { field?: string; hint?: string };
        return invalid(reply, request, e.hint ? `${e.message} ${e.hint}` : e.message, e.field);
      }
      jsonOptions = toJsonOptions(body.jsonOptions);
    }

    const monitor = await deps.store.create({
      apiKeyId: owner(request),
      url: body.url,
      schedule,
      scrapeOptions,
      diff: body.diff,
      jsonOptions,
      trigger: body.trigger,
      sensitivity: body.sensitivity,
      webhook,
      nextCheckAt: nextRun(schedule),
    });

    return reply.code(201).send({ success: true, ...serializeMonitor(monitor) });
  });

  app.get('/monitor', async (request, reply) => {
    const monitors = await deps.store.list(owner(request));
    return reply.send({
      success: true,
      monitors: monitors.map((m) => serializeMonitor(m)),
      truncated: monitors.length >= MONITOR_LIST_LIMIT,
    });
  });

  app.get<{ Params: { id: string } }>('/monitor/:id', async (request, reply) => {
    const monitor = await load(request);
    if (!monitor) return notFound(reply, request);
    const latest = await deps.store.latestSnapshot(monitor.id);
    return reply.send({ success: true, ...serializeMonitor(monitor, latest ?? null) });
  });

  app.patch<{ Params: { id: string } }>('/monitor/:id', async (request, reply) => {
    const existing = await load(request);
    if (!existing) return notFound(reply, request);

    const parsed = PatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) return zodInvalid(reply, request, parsed.error);
    const body = parsed.data;

    const patch: Parameters<MonitorStore['update']>[1] = {};

    // A null `nextCheckAt` on a monitor that is not paused is a running
    // check's claim. Setting a time now would let the scheduler claim it
    // again before that check ends; the check's own reschedule reads the
    // new schedule when it finishes.
    const claimed = existing.status !== 'paused' && existing.nextCheckAt === null;

    if (body.schedule !== undefined) {
      const schedule = resolveSchedule(body.schedule, reply, request);
      if (!schedule) return reply;
      patch.schedule = schedule;
      if (!claimed && existing.status !== 'paused') patch.nextCheckAt = nextRun(schedule);
    }

    if (body.scrapeOptions !== undefined || body.trigger !== undefined) {
      const scrape = body.scrapeOptions !== undefined ? toScrapeOptions(body.scrapeOptions) : existing.scrapeOptions;
      const trigger = body.trigger ?? existing.trigger;
      if (selectorConflict(scrape, trigger)) {
        return invalid(reply, request, 'trigger.selector: set this or scrapeOptions.includeSelectors, not both', 'trigger.selector');
      }
      if (body.scrapeOptions !== undefined) patch.scrapeOptions = scrape;
      if (body.trigger !== undefined) patch.trigger = body.trigger;
    }

    if (body.diff !== undefined) {
      patch.diff = {
        granularity: body.diff.granularity ?? existing.diff.granularity,
        inline: body.diff.inline ?? existing.diff.inline,
      };
    }
    if (body.jsonOptions !== undefined) {
      if (body.jsonOptions === null) {
        patch.jsonOptions = null;
      } else {
        try {
          rejectFabricationKeywords(body.jsonOptions.schema, 'jsonOptions.schema');
        } catch (error) {
          const e = error as Error & { field?: string; hint?: string };
          return invalid(reply, request, e.hint ? `${e.message} ${e.hint}` : e.message, e.field);
        }
        patch.jsonOptions = toJsonOptions(body.jsonOptions);
      }
    }
    if (body.sensitivity !== undefined) patch.sensitivity = body.sensitivity;
    if (body.webhook !== undefined) {
      if (body.webhook === null) {
        patch.webhook = null;
      } else {
        const resolved = resolveWebhook(body.webhook, reply, request);
        if (!resolved) return reply;
        patch.webhook = resolved;
      }
    }

    if (body.status !== undefined) {
      patch.status = body.status;
      if (body.status === 'paused') {
        patch.nextCheckAt = null;
      } else if (existing.status === 'paused') {
        patch.nextCheckAt = nextRun(patch.schedule ?? existing.schedule);
        patch.lastError = null;
      } else if (existing.status === 'error') {
        patch.lastError = null;
      }
    }

    const updated = await deps.store.update(existing.id, patch);
    if (!updated) return notFound(reply, request);
    return reply.send({ success: true, ...serializeMonitor(updated) });
  });

  app.delete<{ Params: { id: string } }>('/monitor/:id', async (request, reply) => {
    const monitor = await load(request);
    if (!monitor) return notFound(reply, request);
    const deleted = await deps.store.delete(monitor.id);
    if (!deleted) return notFound(reply, request);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
    '/monitor/:id/history',
    async (request, reply) => {
      const monitor = await load(request);
      if (!monitor) return notFound(reply, request);

      let limit = HISTORY_PAGE;
      if (request.query.limit !== undefined) {
        if (!/^\d+$/.test(request.query.limit)) {
          return invalid(reply, request, 'limit: must be an integer between 1 and 50', 'limit');
        }
        limit = Number.parseInt(request.query.limit, 10);
        if (limit < 1 || limit > HISTORY_PAGE) {
          return invalid(reply, request, 'limit: must be an integer between 1 and 50', 'limit');
        }
      }
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
    const monitor = await load(request);
    if (!monitor) return notFound(reply, request);
    const snapshotId = Number.parseInt(request.params.snapshotId, 10);
    if (!Number.isFinite(snapshotId)) return notFound(reply, request, 'snapshot');
    const snapshot = await deps.store.getSnapshot(monitor.id, snapshotId);
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
    const monitor = await load(request);
    if (!monitor) return notFound(reply, request);

    const result = await deps.scheduler.runNow(monitor.id);
    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
          return notFound(reply, request);
        case 'paused':
          return reply.code(409).send({
            error: 'monitor_paused',
            message: 'This monitor is paused. Resume it with `status: active` before checking.',
            requestId: request.id,
          });
        case 'in_progress':
          return reply.code(409).send({
            error: 'check_in_progress',
            message: 'A check of this monitor is already running.',
            requestId: request.id,
          });
        case 'busy':
          return reply
            .code(503)
            .header('retry-after', '15')
            .send({
              error: 'busy',
              message: 'Every check slot on this instance is in use. Retry shortly.',
              requestId: request.id,
            });
      }
    }

    return reply.send({
      success: true,
      monitorId: monitor.id,
      check: serializeCheck(monitor.id, result.outcome.check),
      webhookQueued: result.outcome.webhookQueued,
    });
  });

  app.get<{ Params: { id: string } }>('/monitor/:id/deliveries', async (request, reply) => {
    const monitor = await load(request);
    if (!monitor) return notFound(reply, request);
    const deliveries = await deps.store.listDeliveries(monitor.id, 100);
    return reply.send({ success: true, monitorId: monitor.id, deliveries: deliveries.map(serializeDelivery) });
  });

  app.post<{ Params: { id: string; deliveryId: string } }>(
    '/monitor/:id/deliveries/:deliveryId/replay',
    async (request, reply) => {
      const monitor = await load(request);
      if (!monitor) return notFound(reply, request);
      const deliveryId = Number.parseInt(request.params.deliveryId, 10);
      if (!Number.isFinite(deliveryId)) return notFound(reply, request, 'delivery');
      const replayed = await deps.store.replayDelivery(monitor.id, deliveryId);
      if (!replayed) {
        if (!(await deps.store.getDelivery(monitor.id, deliveryId))) return notFound(reply, request, 'delivery');
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
