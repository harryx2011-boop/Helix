import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { BrowserContext, Page } from 'playwright';
import { registerInteract } from './interact.js';
import { SessionRegistry } from '../browser/sessions.js';
import type { PageLease } from '../browser/pool.js';
import type { ExtractClient } from '../extract/client.js';
import type { CastSession } from '../browser/screencast.js';
import type { ApiKey } from '../core/api-keys.js';
import type { Lookup } from '../core/url-guard.js';

const lookup: Lookup = async () => [{ address: '93.184.216.34', family: 4 }];

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKey;
  }
}

const keyFor = (id: string): ApiKey => ({ id }) as ApiKey;

const ARTICLE = `<html><body><article>${'Real article text about a real topic. '.repeat(40)}</article></body></html>`;

interface FakePage {
  goto: ReturnType<typeof vi.fn>;
  content: ReturnType<typeof vi.fn>;
  url: () => string;
  click: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  keyboard: { press: ReturnType<typeof vi.fn>; type: ReturnType<typeof vi.fn> };
  evaluate: ReturnType<typeof vi.fn>;
  evaluateHandle: ReturnType<typeof vi.fn>;
  route: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  waitForSelector: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
}

function fakePage(overrides: Partial<FakePage> = {}): FakePage {
  let current = 'about:blank';
  return {
    goto: vi.fn(async (url: string) => {
      current = url;
      return { status: () => 200, allHeaders: async () => ({}) };
    }),
    content: vi.fn(async () => ARTICLE),
    url: () => current,
    click: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    keyboard: { press: vi.fn(async () => undefined), type: vi.fn(async () => undefined) },
    evaluate: vi.fn(async () => 'from-page'),
    evaluateHandle: vi.fn(async () => ({
      evaluate: async () => 11,
      jsonValue: async () => 'from-page',
      dispose: async () => undefined,
    })),
    route: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => Buffer.from('png')),
    ...overrides,
  };
}

type FrameEvent = { data: string; sessionId: number; metadata: { deviceWidth: number; deviceHeight: number } };

function fakeCdp() {
  let handler: ((event: FrameEvent) => void) | undefined;
  const send = vi.fn(async () => undefined);
  const session = {
    send,
    detach: vi.fn(async () => undefined),
    on: (_event: 'Page.screencastFrame', listener: (event: FrameEvent) => void) => {
      handler = listener;
    },
  } as unknown as CastSession;
  return {
    session,
    started: () => send.mock.calls.some((call) => (call as unknown[])[0] === 'Page.startScreencast'),
    emit: (data: string) => handler?.({ data, sessionId: 1, metadata: { deviceWidth: 10, deviceHeight: 10 } }),
  };
}

interface Harness {
  app: FastifyInstance;
  sessions: SessionRegistry;
  pages: FakePage[];
  leases: (PageLease & { close: ReturnType<typeof vi.fn> })[];
  extractClient: ExtractClient & { structured: ReturnType<typeof vi.fn> };
  cdp: ReturnType<typeof fakeCdp>;
}

async function harness(options: { maxSessions?: number; page?: () => FakePage; leaseDelay?: boolean } = {}): Promise<Harness> {
  const pages: FakePage[] = [];
  const leases: Harness['leases'] = [];
  const sessions = new SessionRegistry({
    lease: async () => {
      if (options.leaseDelay) await new Promise((resolve) => setTimeout(resolve, 5));
      const page = options.page ? options.page() : fakePage();
      pages.push(page);
      const lease = {
        page: page as unknown as Page,
        context: {} as BrowserContext,
        close: vi.fn(async () => undefined),
      };
      leases.push(lease);
      return lease;
    },
    maxSessions: options.maxSessions ?? 4,
    idleTimeoutMs: 60_000,
    hardTimeoutMs: 600_000,
  });

  const extractClient = {
    extract: vi.fn(async () => ({ markdown: 'Keyboard $49.99', text: '', links: [], extractorUsed: 't', contentHash: 'h' })),
    structured: vi.fn(async () => ({
      data: { answer: 'Keyboard available at $49.99' },
      tokensInput: 100,
      tokensOutput: 10,
      modelUsed: 'gpt-4o-mini',
      blocksKept: 1,
      blocksTotal: 1,
    })),
  } as unknown as Harness['extractClient'];

  const cdp = fakeCdp();

  const app = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/v1/interact/live/')) return;
    request.apiKey = keyFor((request.headers['x-test-key'] as string | undefined) ?? 'key_a');
  });
  await app.register(
    async (instance) => {
      await registerInteract(instance, {
        sessions,
        extractClient,
        publicUrl: 'http://helix.local:7400/',
        castFactory: () => async () => cdp.session,
        lookup,
      });
    },
    { prefix: '/v1' },
  );
  await app.ready();

  return { app, sessions, pages, leases, extractClient, cdp };
}

describe('POST /v1/interact', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  afterEach(async () => {
    await h.sessions.closeAll();
    await h.app.close();
  });

  it('requires a url when no session is given', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/v1/interact', payload: { actions: [{ type: 'screenshot' }] } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request', field: 'url' });
  });

  it('rejects a malformed action and names it', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com', actions: [{ type: 'click' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request', field: 'actions.0.selector' });
  });

  it('runs a one-shot session: navigates, acts, extracts, then closes', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: {
        url: 'https://example.com/shop',
        actions: [
          { type: 'click', selector: '#accept-cookies' },
          { type: 'screenshot' },
          { type: 'extract', prompt: 'Get the price of the first result' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      success: true,
      sessionOpen: false,
      url: 'https://example.com/shop',
      output: 'Keyboard available at $49.99',
      data: { answer: 'Keyboard available at $49.99' },
      actionsRun: 3,
      usage: { tokens: { input: 100, output: 10 }, model: 'gpt-4o-mini' },
    });
    expect(body.sessionId).toMatch(/^sess_/);
    expect(body.screenshot).toMatch(/^data:image\/png;base64,/);
    expect(body.liveViewUrl).toBeUndefined();
    expect(h.pages[0]?.goto).toHaveBeenCalledWith('https://example.com/shop', expect.objectContaining({ waitUntil: 'domcontentloaded' }));
    expect(h.pages[0]?.route).toHaveBeenCalledWith('**/*', expect.any(Function));
    expect(h.pages[0]?.click).toHaveBeenCalledWith('#accept-cookies', { timeout: 10_000 });
    expect(h.sessions.count()).toBe(0);
    expect(h.leases[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('keeps a session open, resumes it without re-navigating, and closes on DELETE', async () => {
    const first = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com/login', actions: [{ type: 'type', selector: '#user', text: 'me' }], keepSessionOpen: true },
    });
    expect(first.statusCode).toBe(200);
    const { sessionId, liveViewUrl, sessionOpen, expiresAt, idleExpiresAt } = first.json();
    expect(sessionOpen).toBe(true);
    expect(liveViewUrl).toBe(`http://helix.local:7400/v1/interact/live/${sessionId}?token=${h.sessions.get(sessionId, 'key_a')?.viewToken}`);
    expect(typeof expiresAt).toBe('string');
    expect(typeof idleExpiresAt).toBe('string');
    expect(h.sessions.count()).toBe(1);

    const second = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { sessionId, actions: [{ type: 'press', key: 'Enter' }], keepSessionOpen: true },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ success: true, sessionId, sessionOpen: true, actionsRun: 1 });
    expect(h.pages[0]?.goto).toHaveBeenCalledTimes(1);
    expect(h.pages[0]?.keyboard.press).toHaveBeenCalledWith('Enter');

    const status = await h.app.inject({ method: 'GET', url: `/v1/interact/session/${sessionId}` });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ success: true, sessionId, url: 'https://example.com/login', busy: false });

    const closed = await h.app.inject({ method: 'DELETE', url: `/v1/interact/session/${sessionId}` });
    expect(closed.statusCode).toBe(204);
    expect(h.sessions.count()).toBe(0);

    const again = await h.app.inject({ method: 'DELETE', url: `/v1/interact/session/${sessionId}` });
    expect(again.statusCode).toBe(404);
  });

  it('a session with url and sessionId navigates first', async () => {
    const first = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com/a', actions: [{ type: 'screenshot' }], keepSessionOpen: true },
    });
    const { sessionId } = first.json();
    const second = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { sessionId, url: 'https://example.com/b', actions: [{ type: 'screenshot' }] },
    });
    expect(second.json()).toMatchObject({ success: true, url: 'https://example.com/b', sessionOpen: false, actionsRun: 1 });
    expect(h.pages[0]?.goto).toHaveBeenCalledTimes(2);
  });

  it('answers 404 for an unknown session and for another key\'s session', async () => {
    const unknown = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { sessionId: 'sess_0000000000000000', actions: [{ type: 'screenshot' }] },
    });
    expect(unknown.statusCode).toBe(404);

    const opened = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com', actions: [{ type: 'screenshot' }], keepSessionOpen: true },
    });
    const { sessionId } = opened.json();
    const other = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      headers: { 'x-test-key': 'key_b' },
      payload: { sessionId, actions: [{ type: 'screenshot' }] },
    });
    expect(other.statusCode).toBe(404);
    const otherDelete = await h.app.inject({ method: 'DELETE', url: `/v1/interact/session/${sessionId}`, headers: { 'x-test-key': 'key_b' } });
    expect(otherDelete.statusCode).toBe(404);
    expect(h.sessions.count()).toBe(1);
  });

  it('refuses a second concurrent request on the same session with 409', async () => {
    const opened = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com', actions: [{ type: 'screenshot' }], keepSessionOpen: true },
    });
    const { sessionId } = opened.json();
    const session = h.sessions.get(sessionId, 'key_a')!;
    const release = h.sessions.acquire(session);

    const busy = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { sessionId, actions: [{ type: 'screenshot' }] },
    });
    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toMatchObject({ error: 'session_busy' });
    release();
  });

  it('reports a failed action inside a 200 and closes a one-shot session', async () => {
    await h.app.close();
    h = await harness({
      page: () =>
        fakePage({
          click: vi.fn(async () => {
            throw new Error('Timeout 10000ms exceeded. waiting for locator("#gone")');
          }),
        }),
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com', actions: [{ type: 'wait', milliseconds: 1 }, { type: 'click', selector: '#gone' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: false,
      sessionOpen: false,
      failure: {
        reason: 'timeout',
        actionIndex: 1,
        actionType: 'click',
        tier: 'chromium',
        escalationAvailable: false,
        url: 'https://example.com',
      },
    });
    expect(h.sessions.count()).toBe(0);
  });

  it('a failed run on a kept session leaves it open for the caller', async () => {
    await h.app.close();
    h = await harness({
      page: () =>
        fakePage({
          click: vi.fn(async () => {
            throw new Error('Timeout 10000ms exceeded');
          }),
        }),
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com', actions: [{ type: 'click', selector: '#gone' }], keepSessionOpen: true },
    });
    const body = res.json();
    expect(body).toMatchObject({ success: false, sessionOpen: true, failure: { reason: 'timeout', actionIndex: 0 } });
    expect(h.sessions.get(body.sessionId, 'key_a')).toBeDefined();
  });

  it('reports sessionOpen false when the session was closed under the run', async () => {
    await h.app.close();
    const ref: { sessions?: SessionRegistry } = {};
    h = await harness({
      page: () =>
        fakePage({
          // The page is torn out from under the run: the session goes, then the
          // action fails as Playwright would once the target is gone.
          click: vi.fn(async () => {
            await ref.sessions!.closeAll();
            throw new Error('Target page, context or browser has been closed');
          }),
        }),
    });
    ref.sessions = h.sessions;

    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com', actions: [{ type: 'click', selector: '#slow' }], keepSessionOpen: true },
    });
    const body = res.json();
    expect(body).toMatchObject({ success: false, sessionOpen: false, failure: { reason: 'session_closed', actionIndex: 0 } });
    expect(body.liveViewUrl).toBeUndefined();
    expect(h.sessions.count()).toBe(0);
  });

  it('refuses a url that points at the instance or its network', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'http://127.0.0.1:7402/health', actions: [{ type: 'screenshot' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: false, sessionOpen: false, failure: { reason: 'unsafe_url', actionIndex: null } });
    expect(h.pages[0]?.goto).not.toHaveBeenCalled();
    expect(h.sessions.count()).toBe(0);
  });

  it('marks a failed initial navigation with a null action index', async () => {
    await h.app.close();
    h = await harness({
      page: () =>
        fakePage({
          goto: vi.fn(async () => ({ status: () => 503, allHeaders: async () => ({}) })),
        }),
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com', actions: [{ type: 'screenshot' }] },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.failure.actionIndex).toBeNull();
    expect(body.failure.statusCode).toBe(503);
    expect(body.failure.detail).toMatch(/^initial navigation: /);
  });

  it('enforces the operator session cap with 429', async () => {
    await h.app.close();
    h = await harness({ maxSessions: 1 });

    const first = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com', actions: [{ type: 'screenshot' }], keepSessionOpen: true },
    });
    expect(first.statusCode).toBe(200);

    const second = await h.app.inject({
      method: 'POST',
      url: '/v1/interact',
      payload: { url: 'https://example.com', actions: [{ type: 'screenshot' }] },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ error: 'session_limit_reached' });
  });

  it('holds the cap under a burst of concurrent opens', async () => {
    await h.app.close();
    h = await harness({ maxSessions: 2, leaseDelay: true });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        h.app.inject({
          method: 'POST',
          url: '/v1/interact',
          payload: { url: 'https://example.com', actions: [{ type: 'screenshot' }], keepSessionOpen: true },
        }),
      ),
    );
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 200)).toHaveLength(2);
    expect(codes.filter((c) => c === 429)).toHaveLength(8);
    expect(h.sessions.count()).toBe(2);
    expect(h.leases).toHaveLength(2);
  });
});

describe('POST /v1/interact/session', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  afterEach(async () => {
    await h.sessions.closeAll();
    await h.app.close();
  });

  it('opens a reusable session and navigates when given a url', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/v1/interact/session', payload: { url: 'https://example.com/start' } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      success: true,
      url: 'https://example.com/start',
      idleTimeoutSeconds: 60,
      hardTimeoutSeconds: 600,
    });
    expect(body.sessionId).toMatch(/^sess_/);
    expect(body.liveViewUrl).toContain(`/v1/interact/live/${body.sessionId}?token=`);
    expect(h.sessions.count()).toBe(1);
  });

  it('opens an empty session with no body', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/v1/interact/session' });
    expect(res.statusCode).toBe(201);
    expect(res.json().url).toBe('about:blank');
  });

  it('closes the session again when the first navigation fails', async () => {
    await h.app.close();
    h = await harness({
      page: () => fakePage({ goto: vi.fn(async () => ({ status: () => 403, allHeaders: async () => ({}) })) }),
    });
    const res = await h.app.inject({ method: 'POST', url: '/v1/interact/session', payload: { url: 'https://example.com' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: false, sessionOpen: false, failure: { reason: 'blocked' } });
    expect(h.sessions.count()).toBe(0);
  });
});

describe('live view', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  afterEach(async () => {
    await h.sessions.closeAll();
    await h.app.close();
  });

  it('serves the viewer only with the session token', async () => {
    const opened = await h.app.inject({ method: 'POST', url: '/v1/interact/session' });
    const { sessionId, liveViewUrl } = opened.json();
    const token = new URL(liveViewUrl).searchParams.get('token');

    const denied = await h.app.inject({ method: 'GET', url: `/v1/interact/live/${sessionId}?token=wrong` });
    expect(denied.statusCode).toBe(401);

    const missing = await h.app.inject({ method: 'GET', url: `/v1/interact/live/${sessionId}` });
    expect(missing.statusCode).toBe(401);

    const ok = await h.app.inject({ method: 'GET', url: `/v1/interact/live/${sessionId}?token=${token}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toMatch(/text\/html/);
    expect(ok.body).toContain('[ LIVE ]');
    expect(ok.body).toContain(sessionId);
    expect(ok.body).not.toContain(token);
  });

  it('streams screencast frames and announces the close', async () => {
    const opened = await h.app.inject({ method: 'POST', url: '/v1/interact/session' });
    const { sessionId, liveViewUrl } = opened.json();
    const token = new URL(liveViewUrl).searchParams.get('token');

    const address = await h.app.listen({ port: 0, host: '127.0.0.1' });
    const response = await fetch(`${address}/v1/interact/live/${sessionId}/stream?token=${token}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';
    const readUntil = async (needle: string) => {
      while (!received.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
      }
    };

    await readUntil('event: session');
    expect(received).toContain(`"sessionId":"${sessionId}"`);

    await vi.waitFor(() => expect(h.cdp.started()).toBe(true));
    h.cdp.emit('QUJD');
    await readUntil('event: frame\ndata: QUJD');

    await h.sessions.close(sessionId, 'key_a');
    await readUntil('event: closed\ndata: closed');
    const tail = await reader.read();
    expect(tail.done).toBe(true);
  });

  it('caps the viewers on one session', async () => {
    const opened = await h.app.inject({ method: 'POST', url: '/v1/interact/session' });
    const { sessionId, liveViewUrl } = opened.json();
    const token = new URL(liveViewUrl).searchParams.get('token');
    const address = await h.app.listen({ port: 0, host: '127.0.0.1' });
    const streamUrl = `${address}/v1/interact/live/${sessionId}/stream?token=${token}`;

    const controllers = Array.from({ length: 4 }, () => new AbortController());
    const viewers = await Promise.all(controllers.map((c) => fetch(streamUrl, { signal: c.signal })));
    expect(viewers.map((v) => v.status)).toEqual([200, 200, 200, 200]);

    const fifth = await fetch(streamUrl);
    expect(fifth.status).toBe(429);
    expect((await fifth.json()).error).toBe('too_many_viewers');

    for (const c of controllers) c.abort();
    await h.sessions.close(sessionId, 'key_a');
  });
});
