import { describe, expect, it, vi } from 'vitest';
import { runPipeline, type PipelineDeps } from './pipeline.js';
import { StealthRobots, isStealthTier, wantsChallengeRetry } from './stealth-policy.js';
import type { FetchClient, RenderOptions } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';

const ARTICLE = `<html><body><article>${'Real article text about a real topic. '.repeat(30)}</article></body></html>`;
const ARTICLE_TEXT = 'Real article text about a real topic. '.repeat(30);
const CHALLENGE = `<html><head><title>Just a moment...</title></head>
<body><div class="cf-browser-verification">Checking your browser before accessing</div></body></html>`;

function fetchClient(fetched: string, renders: string[]): FetchClient & { render: ReturnType<typeof vi.fn> } {
  let call = 0;
  return {
    fetch: vi.fn(async () => ({ success: true, status: 200, headers: {}, body: fetched, timingMs: 5 })),
    render: vi.fn(async (_options: RenderOptions) => {
      const body = renders[Math.min(call++, renders.length - 1)] ?? '';
      return { success: true, status: 200, headers: {}, body, finalUrl: 'https://example.com/a', timingMs: 5 };
    }),
    health: vi.fn(async () => true),
  } as unknown as FetchClient & { render: ReturnType<typeof vi.fn> };
}

const extractClient = {
  extract: vi.fn(async ({ html }: { html: string }) => {
    const text = html.includes('Real article') ? ARTICLE_TEXT : '';
    return { markdown: text, text, links: [], extractorUsed: 'trafilatura', contentHash: 'h' };
  }),
  health: vi.fn(async () => true),
} as unknown as ExtractClient;

const robotsSaying = (allowed: boolean) => {
  const source = { forUrl: vi.fn(async () => ({ isAllowed: () => allowed })) };
  const gate = new StealthRobots();
  gate.configure(source);
  return { gate, source };
};

const deps = (over: Partial<PipelineDeps>): PipelineDeps => ({
  fetchClient: fetchClient('', [ARTICLE]),
  extractClient,
  ...over,
});

describe('stealth rungs follow robots.txt (Harry, 2026-11-18, answer 8)', () => {
  it('S13: stops before the browser rung on a robots-disallowed URL; the tls tier still ran', async () => {
    const client = fetchClient(CHALLENGE, [ARTICLE]);
    const { gate } = robotsSaying(false);
    const result = await runPipeline(
      { url: 'https://example.com/a', formats: ['markdown'] },
      deps({ fetchClient: client, stealthRobots: gate }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('robots_denied');
    expect(result.tiersAttempted).toEqual(['tls']);
    expect(client.render).not.toHaveBeenCalled();
  });

  it('S14: climbs to the browser rung when robots.txt allows the URL', async () => {
    const client = fetchClient(CHALLENGE, [ARTICLE]);
    const { gate, source } = robotsSaying(true);
    const result = await runPipeline(
      { url: 'https://example.com/a', formats: ['markdown'] },
      deps({ fetchClient: client, stealthRobots: gate }),
    );
    expect(result.success).toBe(true);
    expect(source.forUrl).toHaveBeenCalledWith('https://example.com/a');
    expect(client.render).toHaveBeenCalledTimes(1);
  });

  it('S15: an unconfigured gate allows every URL and reads no robots.txt', async () => {
    expect(await new StealthRobots().allows('https://example.com/a')).toBe(true);
  });

  it('S16: only the browser rung is a stealth rung; plain and tls are unchanged', () => {
    expect(isStealthTier('browser')).toBe(true);
    expect(isStealthTier('tls')).toBe(false);
    expect(isStealthTier('plain')).toBe(false);
  });
});

describe('a challenge on the browser rung gets one solver retry (answer 10)', () => {
  it('S17: renders again with solveCloudflare when the first render is a challenge page', async () => {
    const client = fetchClient(CHALLENGE, [CHALLENGE, ARTICLE]);
    const result = await runPipeline(
      { url: 'https://example.com/a', formats: ['markdown'], tier: 'browser' },
      deps({ fetchClient: client }),
    );
    expect(result.success).toBe(true);
    expect(client.render).toHaveBeenCalledTimes(2);
    expect(client.render.mock.calls[1]?.[0]).toMatchObject({ solveCloudflare: true });
  });

  it('S18: does not retry when the caller already asked for the solver', async () => {
    const client = fetchClient(CHALLENGE, [CHALLENGE, ARTICLE]);
    await runPipeline(
      { url: 'https://example.com/a', formats: ['markdown'], tier: 'browser', solveCloudflare: true },
      deps({ fetchClient: client }),
    );
    expect(client.render).toHaveBeenCalledTimes(1);
  });

  it('S20: a challenge the solver could not clear reports how long the solver tried', async () => {
    const client = fetchClient(CHALLENGE, [CHALLENGE]);
    client.render.mockImplementation(async (options: RenderOptions) => ({
      success: true, status: 200, headers: {}, body: CHALLENGE, timingMs: 5,
      ...(options.solveCloudflare ? { challengeMs: 16_400 } : {}),
    }));
    const result = await runPipeline(
      { url: 'https://example.com/a', formats: ['markdown'], tier: 'browser' },
      deps({ fetchClient: client }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('challenge');
    expect(result.challengeMs).toBe(16_400);
  });

  it('S19: retries only on a challenge verdict', () => {
    expect(wantsChallengeRetry({ solveCloudflare: undefined, reason: 'challenge' })).toBe(true);
    expect(wantsChallengeRetry({ solveCloudflare: true, reason: 'challenge' })).toBe(false);
    expect(wantsChallengeRetry({ solveCloudflare: undefined, reason: 'blocked' })).toBe(false);
    expect(wantsChallengeRetry({ solveCloudflare: undefined, reason: undefined })).toBe(false);
  });
});
