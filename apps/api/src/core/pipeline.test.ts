import { describe, expect, it, vi } from 'vitest';
import { runPipeline, type PipelineDeps } from './pipeline.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';

const ARTICLE = `<html><body><article>${'Real article text about a real topic. '.repeat(30)}</article></body></html>`;
const ARTICLE_TEXT = 'Real article text about a real topic. '.repeat(30);

const CLOUDFLARE_CHALLENGE = `<html><head><title>Just a moment...</title></head>
<body><div class="cf-browser-verification">Checking your browser before accessing</div></body></html>`;

const SPA_SHELL = `<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>`;

function fetchClientReturning(
  responses: { status: number; body: string; headers?: Record<string, string> }[],
): FetchClient {
  let call = 0;
  return {
    fetch: vi.fn(async () => {
      const r = responses[Math.min(call, responses.length - 1)];
      call++;
      return {
        success: true,
        status: r?.status ?? 200,
        headers: r?.headers ?? {},
        body: r?.body ?? '',
        profileUsed: 'chrome-149-macos',
        timingMs: 10,
      };
    }),
    health: vi.fn(async () => true),
  } as unknown as FetchClient;
}

function extractClientReturning(text: string): ExtractClient {
  return {
    extract: vi.fn(async () => ({
      markdown: text,
      text,
      title: 'Test',
      language: 'en',
      links: [],
      extractorUsed: 'trafilatura',
      contentHash: 'abc123',
    })),
    health: vi.fn(async () => true),
  } as unknown as ExtractClient;
}

function browserPoolReturning(html: string): BrowserPool {
  return {
    render: vi.fn(async () => ({
      html,
      status: 200,
      headers: {},
      finalUrl: 'https://example.com',
      timingMs: 500,
    })),
    stats: () => ({ browsers: 1, activeContexts: 0, pagesServed: 1 }),
    close: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
  } as unknown as BrowserPool;
}

const deps = (over: Partial<PipelineDeps>): PipelineDeps => ({
  fetchClient: fetchClientReturning([{ status: 200, body: ARTICLE }]),
  extractClient: extractClientReturning(ARTICLE_TEXT),
  ...over,
});

describe('runPipeline', () => {
  it('returns content from the cheapest tier when the page is plain HTML', async () => {
    const result = await runPipeline({ url: 'https://example.com', formats: ['markdown'] }, deps({}));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tier).toBe('plain');
    expect(result.tiersAttempted).toEqual(['plain']);
    expect(result.content.markdown).toContain('Real article text');
  });

  it('NEVER returns a Cloudflare challenge as content, even at HTTP 200', async () => {
    // The invariant this whole pipeline exists to hold. A challenge page that
    // reaches the caller as markdown silently poisons their dataset.
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([
          { status: 200, body: CLOUDFLARE_CHALLENGE, headers: { 'cf-mitigated': 'challenge' } },
        ]),
        extractClient: extractClientReturning('Checking your browser'),
        browserPool: browserPoolReturning(CLOUDFLARE_CHALLENGE),
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('challenge');
    // Recognised by the body markers, which survive every tier — the header is
    // only present on the first hop.
    expect(result.detectedBy).toContain('cloudflare-challenge');
    // The caller can see what was tried, so a retry is an informed decision.
    expect(result.tiersAttempted.length).toBeGreaterThan(1);
  });

  it('escalates off a shell page rather than returning nothing', async () => {
    // A shell yields no text, so the pipeline must move up. It stops at the
    // first tier that actually produces content — here `tls`, without paying
    // for a browser.
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: SPA_SHELL }]),
        extractClient: {
          extract: vi
            .fn()
            .mockResolvedValueOnce({
              markdown: '',
              text: '',
              links: [],
              extractorUsed: 'trafilatura',
              contentHash: 'empty',
            })
            .mockResolvedValue({
              markdown: ARTICLE_TEXT,
              text: ARTICLE_TEXT,
              links: [],
              extractorUsed: 'trafilatura',
              contentHash: 'abc',
            }),
          health: vi.fn(async () => true),
        } as unknown as ExtractClient,
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tiersAttempted).toEqual(['plain', 'tls']);
    expect(result.tier).toBe('tls');
  });

  it('reaches a browser tier when no cheaper tier can produce content', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: SPA_SHELL }]),
        extractClient: {
          extract: vi.fn(async ({ html }: { html: string }) =>
            html === SPA_SHELL
              ? {
                  markdown: '',
                  text: '',
                  links: [],
                  extractorUsed: 'trafilatura',
                  contentHash: 'empty',
                }
              : {
                  markdown: ARTICLE_TEXT,
                  text: ARTICLE_TEXT,
                  links: [],
                  extractorUsed: 'trafilatura',
                  contentHash: 'abc',
                },
          ),
          health: vi.fn(async () => true),
        } as unknown as ExtractClient,
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(browserPool.render).toHaveBeenCalled();
    expect(result.tiersAttempted).toContain('lightpanda');
  });

  it('does not escalate for server-rendered pages that merely look like SPAs', async () => {
    // A Next.js page that ships real content needs no browser. Escalating on
    // framework markers alone burns the expensive tier for nothing.
    const nextjs = `<html><body><div id="__next"><article>${'Server-rendered content. '.repeat(40)}</article></div><script id="__NEXT_DATA__">{}</script></body></html>`;
    const browserPool = browserPoolReturning(nextjs);

    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: nextjs }]),
        extractClient: extractClientReturning('Server-rendered content. '.repeat(40)),
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tier).toBe('plain');
    expect(browserPool.render).not.toHaveBeenCalled();
  });

  it('starts at chromium when a screenshot is requested', async () => {
    // Capability requirements are known up front; walking the ladder first would
    // waste two round trips on tiers that cannot produce an image.
    const browserPool = browserPoolReturning(ARTICLE);
    const fetchClient = fetchClientReturning([{ status: 200, body: ARTICLE }]);

    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown', 'screenshot'] },
      deps({ fetchClient, browserPool }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tier).toBe('chromium');
    expect(fetchClient.fetch).not.toHaveBeenCalled();
  });

  it('honours an explicit tier as both floor and ceiling', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], tier: 'plain' },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: SPA_SHELL }]),
        extractClient: extractClientReturning(''),
        browserPool,
      }),
    );

    // The caller asked for plain. Silently upgrading would misreport the cost.
    expect(result.tiersAttempted).toEqual(['plain']);
    expect(browserPool.render).not.toHaveBeenCalled();
  });

  it('reports a typed failure when every tier is exhausted', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 403, body: 'Access denied' }]),
        extractClient: extractClientReturning(''),
        browserPool: browserPoolReturning('Access denied'),
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('blocked');
    // A different profile or proxy may still work, and the caller is told so.
    expect(result.escalationAvailable).toBe(true);
  });

  it('surfaces a missing browser pool rather than pretending the page was empty', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['screenshot'] },
      deps({ browserPool: undefined }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.detail).toContain('no browser pool');
  });
});
