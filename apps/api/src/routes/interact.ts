import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { classifyTransportError } from '../core/block-detection.js';
import type { ExtractClient } from '../extract/client.js';
import {
  ActionError,
  guardPage,
  parseInteractActions,
  runInteractActions,
  type InteractAction,
  type InteractOutcome,
} from '../browser/interact-actions.js';
import type { Lookup } from '../core/url-guard.js';
import { sseSink } from './sse.js';
import {
  SessionBusyError,
  SessionLimitError,
  type Session,
  type SessionRegistry,
} from '../browser/sessions.js';
import { Screencast, cdpSessionFor, type CastSessionFactory } from '../browser/screencast.js';

/**
 * POST /interact, POST /interact/session, GET|DELETE /interact/session/:id,
 * and the live view at /interact/live/:id (+ /stream).
 *
 * The endpoint shape follows research/api-specs/browser-interaction-api.md §4;
 * the runtime is the Playwright pool and the in-process session registry. A
 * session is a leased page: it keeps cookies, storage and focus between calls
 * until the caller closes it or a timeout does.
 *
 * Failures inside a run are reported in a 200 with `success: false`, the same
 * envelope every other endpoint uses, plus the index of the action that failed.
 * A non-2xx means the request itself was wrong: bad body, unknown session,
 * session busy, or the operator's session cap.
 */

const InteractRequestSchema = z.object({
  url: z.string().url().optional(),
  sessionId: z.string().min(1).nullable().optional(),
  actions: z.array(z.unknown()).min(1).max(50),
  keepSessionOpen: z.boolean().default(false),
  headers: z.record(z.string()).optional(),
  viewport: z
    .object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(240).max(2160) })
    .optional(),
});

const OpenSessionSchema = z.object({
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
  viewport: z
    .object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(240).max(2160) })
    .optional(),
});

export interface InteractRouteDeps {
  sessions: SessionRegistry;
  extractClient: ExtractClient;
  /** Public origin of this instance; live-view URLs are built on it. */
  publicUrl: string;
  /** Overridable for tests; the default opens a CDP session on the page. */
  castFactory?: ((session: Session) => CastSessionFactory) | undefined;
  /** DNS for the URL guard; tests supply a fake. */
  lookup?: Lookup | undefined;
}

const SSE_HEARTBEAT_MS = 15_000;
/** Streams one session may fan out to. A leaked link cannot become unbounded work. */
const MAX_LIVE_VIEWERS = 4;

/** Playwright's wording when the page went away under a running call. */
const CLOSED_UNDER_RUN = /has been closed|target closed|session closed/i;

export async function registerInteract(app: FastifyInstance, deps: InteractRouteDeps): Promise<void> {
  const publicUrl = deps.publicUrl.replace(/\/$/, '');
  const casts = new WeakMap<Session, Screencast>();

  const liveViewUrl = (session: Session): string =>
    `${publicUrl}/v1/interact/live/${session.id}?token=${session.viewToken}`;

  const describe = (session: Session): Record<string, unknown> => ({
    sessionId: session.id,
    url: session.page.url(),
    createdAt: new Date(session.createdAt).toISOString(),
    lastActivityAt: new Date(session.lastActivityAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    idleExpiresAt: new Date(deps.sessions.idleDeadline(session)).toISOString(),
    liveViewUrl: liveViewUrl(session),
  });

  const castFor = (session: Session): Screencast => {
    const existing = casts.get(session);
    if (existing) return existing;
    const factory = deps.castFactory ? deps.castFactory(session) : cdpSessionFor(session.page);
    const cast = new Screencast(factory, { logger: app.log });
    casts.set(session, cast);
    session.onClose(() => void cast.stop());
    return cast;
  };

  const invalid = (reply: FastifyReply, requestId: string, message: string, field?: string) =>
    reply.code(400).send({ error: 'invalid_request', message, field, requestId });

  /**
   * Open a session and fence its page. The guard is part of opening: a page
   * that can reach the instance's own network must never be handed out.
   */
  const openGuarded = async (apiKeyId: string, options: { headers?: Record<string, string> | undefined; viewport?: { width: number; height: number } | undefined }) => {
    const session = await deps.sessions.open(apiKeyId, options);
    try {
      await guardPage(session.page, deps.lookup);
    } catch (error) {
      await deps.sessions.close(session.id, apiKeyId);
      throw error;
    }
    return session;
  };

  const failureEnvelope = (
    session: Session | undefined,
    sessionOpen: boolean,
    error: unknown,
    initialNavigation: boolean,
    closedUnderRun = false,
  ): Record<string, unknown> => {
    if (error instanceof ActionError) {
      // The implicit navigation from `url` sits ahead of the caller's list.
      const actionIndex = initialNavigation ? error.index - 1 : error.index;
      return {
        success: false,
        sessionId: session?.id,
        sessionOpen,
        failure: {
          url: session?.page.url(),
          reason: closedUnderRun && CLOSED_UNDER_RUN.test(error.message) ? 'session_closed' : error.reason,
          detail: actionIndex < 0 ? error.message.replace(/^actions\[-?\d+\] \(navigate\): /, 'initial navigation: ') : error.message,
          statusCode: error.statusCode,
          detectedBy: error.detectedBy,
          tier: 'chromium',
          tiersAttempted: ['chromium'],
          escalationAvailable: false,
          actionIndex: actionIndex < 0 ? null : actionIndex,
          actionType: error.actionType,
        },
      };
    }
    const text = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      sessionId: session?.id,
      sessionOpen,
      failure: {
        url: session?.page.url(),
        reason: closedUnderRun && CLOSED_UNDER_RUN.test(text) ? 'session_closed' : classifyTransportError(text),
        detail: text,
        tier: 'chromium',
        tiersAttempted: ['chromium'],
        escalationAvailable: false,
        actionIndex: null,
      },
    };
  };

  const successEnvelope = (
    session: Session,
    sessionOpen: boolean,
    outcome: InteractOutcome,
    timingMs: number,
  ): Record<string, unknown> => ({
    success: true,
    sessionId: session.id,
    sessionOpen,
    url: session.page.url(),
    output: outcome.output ?? null,
    data: outcome.data ?? null,
    screenshot: outcome.screenshot ?? null,
    javascriptReturns: outcome.javascriptReturns,
    actionsRun: outcome.actionsRun,
    ...(sessionOpen
      ? {
          liveViewUrl: liveViewUrl(session),
          expiresAt: new Date(session.expiresAt).toISOString(),
          idleExpiresAt: new Date(deps.sessions.idleDeadline(session)).toISOString(),
        }
      : {}),
    usage: {
      tokens: { input: outcome.usage.tokensInput, output: outcome.usage.tokensOutput },
      model: outcome.usage.model ?? null,
    },
    timingMs,
  });

  app.post('/interact', async (request, reply) => {
    const parsed = InteractRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return invalid(
        reply,
        request.id,
        first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
        first?.path.join('.'),
      );
    }

    const body = parsed.data;
    if (!body.sessionId && !body.url) {
      return invalid(reply, request.id, '`url` is required when no `sessionId` is given.', 'url');
    }

    let actions: InteractAction[];
    try {
      actions = parseInteractActions(body.actions);
    } catch (error) {
      const e = error as Error & { field?: string };
      return invalid(reply, request.id, e.message, e.field);
    }

    const apiKeyId = request.apiKey?.id ?? 'anonymous';
    const started = Date.now();

    let session: Session;
    let opened = false;
    if (body.sessionId) {
      const found = deps.sessions.get(body.sessionId, apiKeyId);
      if (!found) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'No such session. It may have been closed, or timed out.',
          requestId: request.id,
        });
      }
      session = found;
    } else {
      try {
        session = await openGuarded(apiKeyId, { headers: body.headers, viewport: body.viewport });
        opened = true;
      } catch (error) {
        return sendOpenFailure(reply, request.id, error);
      }
    }

    let release: () => void;
    try {
      release = deps.sessions.acquire(session);
    } catch (error) {
      if (error instanceof SessionBusyError) {
        return reply.code(409).send({ error: 'session_busy', message: error.message, requestId: request.id });
      }
      throw error;
    }

    const steps: InteractAction[] = body.url ? [{ type: 'navigate', url: body.url }, ...actions] : actions;
    const initialNavigation = Boolean(body.url);

    // `sessionOpen` answers for the registry, not for what the caller asked:
    // a DELETE or the hard timeout can take the page away under a run.
    const stillOpen = () => deps.sessions.get(session.id, apiKeyId) !== undefined;

    try {
      const outcome = await runInteractActions(session.page, steps, {
        extractClient: deps.extractClient,
        logger: request.log,
        lookup: deps.lookup,
      });
      if (initialNavigation) outcome.actionsRun -= 1;
      release();

      if (!body.keepSessionOpen) await deps.sessions.close(session.id, apiKeyId);
      const sessionOpen = body.keepSessionOpen && stillOpen();

      return reply.code(200).send(successEnvelope(session, sessionOpen, outcome, Date.now() - started));
    } catch (error) {
      release();
      const closedUnderRun = !stillOpen();
      // A failed run on a session the caller wants to keep stays open so the
      // caller can inspect it, retry, or close it. A one-shot run is cleaned
      // up, and so is a page whose script never came back.
      const unresponsive = error instanceof ActionError && error.pageUnresponsive;
      if (!body.keepSessionOpen || unresponsive) await deps.sessions.close(session.id, apiKeyId);
      const sessionOpen = body.keepSessionOpen && stillOpen();
      request.log.warn({ error, sessionId: session.id, opened, closedUnderRun }, 'interact run failed');
      return reply.code(200).send(failureEnvelope(session, sessionOpen, error, initialNavigation, closedUnderRun));
    }
  });

  app.post('/interact/session', async (request, reply) => {
    const parsed = OpenSessionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return invalid(
        reply,
        request.id,
        first ? `${first.path.join('.')}: ${first.message}` : 'invalid request body',
        first?.path.join('.'),
      );
    }

    const body = parsed.data;
    const apiKeyId = request.apiKey?.id ?? 'anonymous';

    let session: Session;
    try {
      session = await openGuarded(apiKeyId, { headers: body.headers, viewport: body.viewport });
    } catch (error) {
      return sendOpenFailure(reply, request.id, error);
    }

    if (body.url) {
      const release = deps.sessions.acquire(session);
      try {
        await runInteractActions(session.page, [{ type: 'navigate', url: body.url }], {
          extractClient: deps.extractClient,
          logger: request.log,
          lookup: deps.lookup,
        });
        release();
      } catch (error) {
        release();
        const closedUnderRun = deps.sessions.get(session.id, apiKeyId) === undefined;
        await deps.sessions.close(session.id, apiKeyId);
        return reply.code(200).send(failureEnvelope(session, false, error, true, closedUnderRun));
      }
    }

    return reply.code(201).send({
      success: true,
      ...describe(session),
      idleTimeoutSeconds: Math.round(deps.sessions.idleTimeoutMs / 1000),
      hardTimeoutSeconds: Math.round(deps.sessions.hardTimeoutMs / 1000),
    });
  });

  app.get<{ Params: { id: string } }>('/interact/session/:id', async (request, reply) => {
    const apiKeyId = request.apiKey?.id ?? 'anonymous';
    const session = deps.sessions.get(request.params.id, apiKeyId);
    if (!session) {
      return reply.code(404).send({ error: 'not_found', message: 'No such session.', requestId: request.id });
    }
    return reply.code(200).send({ success: true, ...describe(session), busy: session.busy });
  });

  app.delete<{ Params: { id: string } }>('/interact/session/:id', async (request, reply) => {
    const apiKeyId = request.apiKey?.id ?? 'anonymous';
    const closed = await deps.sessions.close(request.params.id, apiKeyId);
    if (!closed) {
      return reply.code(404).send({ error: 'not_found', message: 'No such session.', requestId: request.id });
    }
    return reply.code(204).send();
  });

  // Live view. Authenticated by the per-session token in the URL rather than
  // the API key: a browser tab opened from a link cannot send a bearer header.
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    '/interact/live/:id',
    async (request, reply) => {
      const session = deps.sessions.getByViewToken(request.params.id, request.query.token ?? '');
      if (!session) {
        return reply.code(401).send({
          error: 'unauthorized',
          message: 'No open session matches this link. It may have been closed, or timed out.',
          requestId: request.id,
        });
      }
      return reply.code(200).type('text/html; charset=utf-8').send(viewerHtml(session.id));
    },
  );

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    '/interact/live/:id/stream',
    async (request, reply) => {
      const session = deps.sessions.getByViewToken(request.params.id, request.query.token ?? '');
      if (!session) {
        return reply.code(401).send({
          error: 'unauthorized',
          message: 'No open session matches this link.',
          requestId: request.id,
        });
      }

      const cast = castFor(session);
      if (cast.viewers >= MAX_LIVE_VIEWERS) {
        return reply.code(429).send({
          error: 'too_many_viewers',
          message: `This session already has ${MAX_LIVE_VIEWERS} viewers. Close one to open another.`,
          requestId: request.id,
        });
      }

      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });

      // Frames go through a sink that honours socket backpressure: a viewer
      // that stops reading gets the newest frame when it resumes, and the
      // process never buffers the ones it missed.
      const sink = sseSink(res);
      sink.event('session', JSON.stringify({ sessionId: session.id, url: session.page.url() }));

      const unsubscribe = cast.subscribe((frame) => sink.frame(frame.data));
      const heartbeat = setInterval(() => sink.comment('ping'), SSE_HEARTBEAT_MS);
      heartbeat.unref();

      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        clearInterval(heartbeat);
        unsubscribe();
        offClose();
      };

      const offClose = session.onClose((reason) => {
        sink.event('closed', reason);
        cleanup();
        res.end();
      });

      request.raw.on('close', cleanup);
    },
  );
}

function sendOpenFailure(reply: FastifyReply, requestId: string, error: unknown) {
  if (error instanceof SessionLimitError) {
    return reply.code(429).send({
      error: 'session_limit_reached',
      message: error.message,
      requestId,
    });
  }
  const text = error instanceof Error ? error.message : String(error);
  return reply.code(503).send({
    error: 'service_unavailable',
    message: `Could not start a browser session: ${text}`,
    requestId,
  });
}

/**
 * The viewer. One image element fed by the event stream; nothing to load from
 * anywhere else, so it works on an instance with no outbound network.
 * Tokens: app dark ground, violet accent, 6px radius, mono micro-labels.
 */
function viewerHtml(sessionId: string): string {
  const safeId = sessionId.replace(/[^a-z0-9_]/gi, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Helix live view</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100vh; background: #0B1220; color: rgba(249,249,249,.88); font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; letter-spacing: .14px; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-bottom: 1px solid rgba(249,249,249,.08); font-family: ui-monospace, monospace; font-size: 12px; letter-spacing: .8px; }
  .live { color: #A78BFA; }
  .id { color: rgba(249,249,249,.56); }
  .url { color: rgba(249,249,249,.40); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: 0; }
  main { flex: 1; display: grid; place-items: center; padding: 16px; }
  .frame { max-width: 100%; max-height: calc(100vh - 88px); border-radius: 6px; border: 1px solid rgba(249,249,249,.08); background: #111827; display: none; }
  .frame[src] { display: block; }
  .status { color: rgba(249,249,249,.56); }
</style>
</head>
<body>
<header>
  <span class="live">[ LIVE ]</span>
  <span class="id">${safeId}</span>
  <span class="url" id="url"></span>
</header>
<main>
  <img class="frame" id="frame" alt="Live view of the session">
  <p class="status" id="status">Connecting to the session.</p>
</main>
<script>
  var frame = document.getElementById('frame');
  var status = document.getElementById('status');
  var url = document.getElementById('url');
  var stream = new EventSource(location.pathname + '/stream' + location.search);
  stream.addEventListener('session', function (e) {
    try { url.textContent = JSON.parse(e.data).url || ''; } catch (_) {}
    status.textContent = 'Waiting for the first frame. A still page sends none until something changes.';
  });
  stream.addEventListener('frame', function (e) {
    frame.src = 'data:image/jpeg;base64,' + e.data;
    status.hidden = true;
  });
  stream.addEventListener('closed', function (e) {
    status.hidden = false;
    status.textContent = 'Session closed (' + e.data + ').';
    stream.close();
  });
  stream.onerror = function () {
    status.hidden = false;
    status.textContent = 'Disconnected from the session.';
  };
</script>
</body>
</html>
`;
}
