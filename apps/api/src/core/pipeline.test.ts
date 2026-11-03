import { describe, expect, it, vi } from 'vitest';
import { runPipeline, type PipelineDeps } from './pipeline.js';
import type { FetchClient } from '../fetch/client.js';
import type { ExtractClient } from '../extract/client.js';
import type { BrowserPool } from '../browser/pool.js';
import { TierMemory } from './tier-memory.js';
import { CookieJar } from './cookie-jar.js';

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
    expect(result.tier).toBe('tls');
    expect(result.tiersAttempted).toEqual(['tls']);
    expect(result.content.markdown).toContain('Real article text');
  });

  it('NEVER returns a Cloudflare challenge as content, even at HTTP 200', async () => {
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
    expect(result.detectedBy).toContain('cloudflare-challenge');
    expect(result.tiersAttempted.length).toBeGreaterThan(1);
  });

  it('escalates off a shell page rather than returning nothing', async () => {
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
    expect(result.tiersAttempted).toEqual(['tls', 'lightpanda']);
    expect(result.tier).toBe('lightpanda');
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
    expect(result.tier).toBe('tls');
    expect(browserPool.render).not.toHaveBeenCalled();
  });

  it('starts at chromium when a screenshot is requested', async () => {
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

describe('runPipeline with skipExtraction', () => {
  it('never calls extractClient.extract', async () => {
    const extractClient = extractClientReturning(ARTICLE_TEXT);
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['screenshot'], skipExtraction: true },
      deps({ extractClient, browserPool }),
    );

    expect(result.success).toBe(true);
    expect(extractClient.extract).not.toHaveBeenCalled();
  });

  it('still returns success for ordinary content with no extracted text at all', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['screenshot'], skipExtraction: true },
      deps({ browserPool }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.content.markdown).toBe('');
  });

  it('NEVER returns a Cloudflare challenge as success, even with extraction skipped', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['screenshot'], skipExtraction: true },
      deps({
        fetchClient: fetchClientReturning([
          { status: 200, body: CLOUDFLARE_CHALLENGE, headers: { 'cf-mitigated': 'challenge' } },
        ]),
        browserPool: browserPoolReturning(CLOUDFLARE_CHALLENGE),
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('challenge');
    expect(result.detectedBy).toContain('cloudflare-challenge');
  });

  it('behaves like the extracted-empty-string case at the ceiling tier: succeeds with empty content, matching /scrape parity', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['screenshot'], skipExtraction: true, tier: 'chromium' },
      deps({ browserPool: browserPoolReturning('') }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.content.markdown).toBe('');
  });
});

describe('runPipeline with a proxy', () => {
  it('never routes a proxied request through lightpanda', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], proxy: 'http://proxy.local:8080' },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: SPA_SHELL }]),
        extractClient: {
          extract: vi.fn(async ({ html }: { html: string }) =>
            html === SPA_SHELL
              ? { markdown: '', text: '', links: [], extractorUsed: 'trafilatura', contentHash: 'empty' }
              : { markdown: ARTICLE_TEXT, text: ARTICLE_TEXT, links: [], extractorUsed: 'trafilatura', contentHash: 'abc' },
          ),
          health: vi.fn(async () => true),
        } as unknown as ExtractClient,
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    expect(result.tiersAttempted).not.toContain('lightpanda');
    expect(result.tiersAttempted).toContain('chromium');
    expect(browserPool.render).toHaveBeenCalledWith(
      expect.objectContaining({ engine: 'chromium', proxy: 'http://proxy.local:8080' }),
    );
  });
});

describe('runPipeline — Retry-After', () => {
  const blockedWith = (headers: Record<string, string>) =>
    deps({
      fetchClient: fetchClientReturning([
        { status: 429, body: CLOUDFLARE_CHALLENGE, headers },
      ]),
    });

  it('surfaces a numeric Retry-After from a blocked response', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], tier: 'tls' },
      blockedWith({ 'retry-after': '120' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.retryAfterSeconds).toBe(120);
  });

  it('reads the header whatever case it arrives in', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], tier: 'tls' },
      blockedWith({ 'Retry-After': '45' }),
    );

    if (!result.success) expect(result.retryAfterSeconds).toBe(45);
  });

  it('parses the HTTP-date form', async () => {
    const at = new Date(Date.now() + 90_000).toUTCString();
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], tier: 'tls' },
      blockedWith({ 'retry-after': at }),
    );

    if (!result.success) {
      expect(result.retryAfterSeconds).toBeGreaterThan(80);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(91);
    }
  });

  it('drops a Retry-After beyond a day rather than clamping it', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], tier: 'tls' },
      blockedWith({ 'retry-after': '999999' }),
    );

    if (!result.success) expect(result.retryAfterSeconds).toBeUndefined();
  });

  it('drops an unparseable Retry-After', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], tier: 'tls' },
      blockedWith({ 'retry-after': 'soon' }),
    );

    if (!result.success) expect(result.retryAfterSeconds).toBeUndefined();
  });

  it('reports no Retry-After when the host sent none', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], tier: 'tls' },
      blockedWith({}),
    );

    if (!result.success) expect(result.retryAfterSeconds).toBeUndefined();
  });
});

describe('runPipeline � empty extraction on a server-rendered page', () => {
  const BOILERPLATE = `<html><body><nav>${'Home About Donate Jobs Community Events Blog Contact '.repeat(6)}</nav><main></main><footer>${'Copyright notice, privacy policy, terms of use, sitemap. '.repeat(6)}</footer></body></html>`;

  const extractEmptyOnBoilerplate = (): ExtractClient =>
    ({
      extract: vi.fn(async ({ html }: { html: string }) =>
        html === BOILERPLATE
          ? { markdown: '', text: '', links: [], extractorUsed: 'trafilatura', contentHash: 'empty' }
          : { markdown: ARTICLE_TEXT, text: ARTICLE_TEXT, links: [], extractorUsed: 'trafilatura', contentHash: 'abc' },
      ),
      health: vi.fn(async () => true),
    }) as unknown as ExtractClient;

  it('escalates past a cheap tier whose page extracts to nothing', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([
          { status: 200, body: BOILERPLATE },
          { status: 200, body: ARTICLE },
        ]),
        extractClient: extractEmptyOnBoilerplate(),
        browserPool: browserPoolReturning(ARTICLE),
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tiersAttempted).toEqual(['tls', 'lightpanda']);
    expect(result.tier).toBe('lightpanda');
    expect(result.content.markdown).toContain('Real article text');
  });

  it('records each climb and the reason for it', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([
          { status: 200, body: BOILERPLATE },
          { status: 200, body: ARTICLE },
        ]),
        extractClient: extractEmptyOnBoilerplate(),
        browserPool: browserPoolReturning(ARTICLE),
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]).toMatchObject({ from: 'tls', to: 'lightpanda' });
    expect(result.escalations[0]?.reason).toEqual(expect.any(String));
    expect(result.escalations[0]?.reason.length).toBeGreaterThan(0);
  });

  it('records no climb when the first tier serves the page', async () => {
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: ARTICLE }]),
        extractClient: extractEmptyOnBoilerplate(),
        browserPool: browserPoolReturning(ARTICLE),
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tier).toBe('tls');
    expect(result.escalations).toEqual([]);
  });

  it('returns the empty page as-is once the ladder is spent', async () => {
    const browserPool = browserPoolReturning(BOILERPLATE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: BOILERPLATE }]),
        extractClient: extractEmptyOnBoilerplate(),
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tiersAttempted).toEqual(['tls', 'lightpanda', 'chromium']);
    expect(result.content.markdown).toBe('');
  });

  it('stops at the first tier when the domain does not resolve', async () => {
    const fetchClient = {
      fetch: vi.fn(async () => ({ success: false, error: 'dns error: failed to lookup address information', timingMs: 5 })),
      health: vi.fn(async () => true),
    } as unknown as FetchClient;
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://no-such-host.invalid', formats: ['markdown'] },
      deps({ fetchClient, extractClient: extractClientReturning(''), browserPool }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('dns');
    expect(result.tiersAttempted).toEqual(['tls']);
    expect(browserPool.render).not.toHaveBeenCalled();
  });

  it('does not escalate when no requested format needs extracted text', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['rawHtml'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: BOILERPLATE }]),
        extractClient: extractEmptyOnBoilerplate(),
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tiersAttempted).toEqual(['tls']);
    expect(result.content.rawHtml).toBe(BOILERPLATE);
    expect(browserPool.render).not.toHaveBeenCalled();
  });
});

describe('runPipeline ladder costs', () => {
  const EXAMPLE = `<!doctype html><html lang=en><head><title>Example Domain</title></head><body><p>This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it for testing and monitoring purposes.</p><script src=/s.js></script></body></html>`;
  const EXAMPLE_TEXT =
    'This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it for testing and monitoring purposes.';
  const EMPTY = { markdown: '', text: '', links: [], extractorUsed: 'trafilatura', contentHash: 'empty' };
  const FULL = { markdown: ARTICLE_TEXT, text: ARTICLE_TEXT, links: [], extractorUsed: 'trafilatura', contentHash: 'abc' };
  const extractEmptyOnShell = () =>
    ({
      extract: vi.fn(async ({ html }: { html: string }) => (html === SPA_SHELL ? EMPTY : FULL)),
      health: vi.fn(async () => true),
    }) as unknown as ExtractClient;
  const slowFetch = (ms: number, body: string) =>
    ({
      fetch: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, ms));
        return { success: true, status: 200, headers: {}, body, timingMs: ms };
      }),
      health: vi.fn(async () => true),
    }) as unknown as FetchClient;

  it('serves a short complete page from tls without a browser', async () => {
    const browserPool = browserPoolReturning(EXAMPLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: EXAMPLE }]),
        extractClient: extractClientReturning(EXAMPLE_TEXT),
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tiersAttempted).toEqual(['tls']);
    expect(browserPool.render).not.toHaveBeenCalled();
  });

  it('skips a browser tier the pool has not enabled', async () => {
    const browserPool = Object.assign(browserPoolReturning(ARTICLE), { disabledEngines: () => ['lightpanda'] });
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: SPA_SHELL }]),
        extractClient: extractEmptyOnShell(),
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tiersAttempted).toEqual(['tls', 'chromium']);
  });

  it('does not send a recognised block page to the extractor', async () => {
    const challenge = '<html><head><title>Just a moment...</title></head><body>cf</body></html>';
    const extractClient = extractEmptyOnShell();
    await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 403, body: challenge, headers: { 'cf-mitigated': 'challenge' } }]),
        extractClient,
        browserPool: browserPoolReturning(ARTICLE),
      }),
    );

    const htmls = vi.mocked(extractClient.extract).mock.calls.map(([req]) => req.html);
    expect(htmls).not.toContain(challenge);
  });

  it('waits out a short Retry-After before the next tier', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    const started = Date.now();
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], timeout: 30_000 },
      deps({
        fetchClient: fetchClientReturning([{ status: 429, body: 'Too many requests', headers: { 'retry-after': '1' } }]),
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    expect(browserPool.render).toHaveBeenCalled();
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
  });

  it('stops instead of climbing when Retry-After outlasts the budget', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], timeout: 30_000 },
      deps({
        fetchClient: fetchClientReturning([{ status: 429, body: 'Too many requests', headers: { 'retry-after': '120' } }]),
        browserPool,
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.retryAfterSeconds).toBe(120);
    expect(result.tiersAttempted).toEqual(['tls']);
    expect(browserPool.render).not.toHaveBeenCalled();
  });

  it('gives a later tier only what is left of one shared timeout', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], timeout: 1_000 },
      deps({ fetchClient: slowFetch(300, SPA_SHELL), extractClient: extractEmptyOnShell(), browserPool }),
    );

    const [{ timeout }] = vi.mocked(browserPool.render).mock.calls[0] as [{ timeout: number }];
    expect(timeout).toBeLessThanOrEqual(710);
    expect(timeout).toBeGreaterThan(0);
  });

  it('fails with timeout once the shared budget is spent, without starting another tier', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], timeout: 200 },
      deps({ fetchClient: slowFetch(300, SPA_SHELL), extractClient: extractEmptyOnShell(), browserPool }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('timeout');
    expect(browserPool.render).not.toHaveBeenCalled();
  });
});

describe('runPipeline tier memory', () => {
  it('starts a repeat visit at the tier a block pushed the host to', async () => {
    const tierMemory = new TierMemory();
    const challenge = '<html><head><title>Just a moment...</title></head><body>cf</body></html>';
    const fetchClient = fetchClientReturning([{ status: 403, body: challenge, headers: { 'cf-mitigated': 'challenge' } }]);
    const browserPool = browserPoolReturning(ARTICLE);
    const first = await runPipeline({ url: 'https://walled.test/a', formats: ['markdown'] }, deps({ fetchClient, browserPool, tierMemory }));
    expect(first.success && first.tier).toBe('lightpanda');

    const second = await runPipeline({ url: 'https://walled.test/b', formats: ['markdown'] }, deps({ fetchClient, browserPool, tierMemory }));
    expect(second.tiersAttempted).toEqual(['lightpanda']);
    expect(fetchClient.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not learn a climb made for missing content', async () => {
    const tierMemory = new TierMemory();
    const extractClient = {
      extract: vi.fn(async ({ html }: { html: string }) =>
        html === SPA_SHELL
          ? { markdown: '', text: '', links: [], extractorUsed: 'trafilatura', contentHash: 'empty' }
          : { markdown: ARTICLE_TEXT, text: ARTICLE_TEXT, links: [], extractorUsed: 'trafilatura', contentHash: 'abc' },
      ),
      health: vi.fn(async () => true),
    } as unknown as ExtractClient;
    await runPipeline(
      { url: 'https://spa.test/', formats: ['markdown'] },
      deps({ fetchClient: fetchClientReturning([{ status: 200, body: SPA_SHELL }]), extractClient, browserPool: browserPoolReturning(ARTICLE), tierMemory }),
    );
    expect(tierMemory.floor('https://spa.test/x')).toBeUndefined();
  });

  it('forgets the floor when a visit started there fails', async () => {
    const tierMemory = new TierMemory();
    tierMemory.learn('https://walled.test/', 'chromium');
    const blocked = '<html><head><title>Just a moment...</title></head><body>cf</body></html>';
    const result = await runPipeline(
      { url: 'https://walled.test/c', formats: ['markdown'] },
      deps({ browserPool: Object.assign(browserPoolReturning(blocked), {}), tierMemory, extractClient: extractClientReturning('') }),
    );
    expect(result.success).toBe(false);
    expect(tierMemory.floor('https://walled.test/')).toBeUndefined();
  });
});

describe('runPipeline tier budget', () => {
  it('answers with a timeout when a tier ignores its budget', async () => {
    const browserPool = Object.assign(browserPoolReturning(ARTICLE), {
      render: vi.fn(() => new Promise(() => undefined)),
    }) as unknown as BrowserPool;
    const started = Date.now();
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], tier: 'chromium', timeout: 300 },
      deps({ browserPool }),
    );

    expect(Date.now() - started).toBeLessThan(2_500);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('timeout');
  });
});

describe('runPipeline cookies', () => {
  const fetchSettingCookie = () =>
    ({
      fetch: vi.fn(async () => ({
        success: true,
        status: 200,
        headers: {},
        setCookies: ['cf_clearance=abc; Path=/; HttpOnly'],
        body: ARTICLE,
        profileUsed: 'chrome-149',
        timingMs: 10,
      })),
      health: vi.fn(async () => true),
    }) as unknown as FetchClient;

  it('replays a cookie the host set to the next fetch with the same identity', async () => {
    const cookieJar = new CookieJar();
    const fetchClient = fetchSettingCookie();
    await runPipeline({ url: 'https://walled.test/a', formats: ['markdown'], profile: 'chrome-149' }, deps({ fetchClient, cookieJar }));
    await runPipeline({ url: 'https://walled.test/b', formats: ['markdown'], profile: 'chrome-149' }, deps({ fetchClient, cookieJar }));

    const second = vi.mocked(fetchClient.fetch).mock.calls[1]?.[0];
    expect(second?.headers).toMatchObject({ Cookie: 'cf_clearance=abc' });
  });

  it('lets a caller Cookie header win over the jar', async () => {
    const cookieJar = new CookieJar();
    const fetchClient = fetchSettingCookie();
    await runPipeline({ url: 'https://walled.test/a', formats: ['markdown'], profile: 'chrome-149' }, deps({ fetchClient, cookieJar }));
    await runPipeline(
      { url: 'https://walled.test/b', formats: ['markdown'], profile: 'chrome-149', headers: { cookie: 'mine=1' } },
      deps({ fetchClient, cookieJar }),
    );

    const second = vi.mocked(fetchClient.fetch).mock.calls[1]?.[0];
    expect(second?.headers).toEqual({ cookie: 'mine=1' });
  });

  it('reports the cookies the page set, for a crawl session to keep', async () => {
    const result = await runPipeline({ url: 'https://walled.test/a', formats: ['markdown'] }, deps({ fetchClient: fetchSettingCookie() }));
    expect(result.success && result.setCookies).toEqual(['cf_clearance=abc; Path=/; HttpOnly']);
  });
});

describe('runPipeline resource blocking', () => {
  const shellThenArticle = () =>
    ({
      extract: vi.fn(async ({ html }: { html: string }) =>
        html === SPA_SHELL
          ? { markdown: '', text: '', links: [], extractorUsed: 'trafilatura', contentHash: 'empty' }
          : { markdown: ARTICLE_TEXT, text: ARTICLE_TEXT, links: [], extractorUsed: 'trafilatura', contentHash: 'abc' },
      ),
      health: vi.fn(async () => true),
    }) as unknown as ExtractClient;

  it('asks the browser to skip images, fonts and media on a host that has not blocked', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({ fetchClient: fetchClientReturning([{ status: 200, body: SPA_SHELL }]), extractClient: shellThenArticle(), browserPool }),
    );
    expect(vi.mocked(browserPool.render).mock.calls[0]?.[0]).toMatchObject({ blockResources: true });
  });

  it('loads everything once the host has blocked, since a bot wall reads missing assets as a tell', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 403, body: 'Access denied', headers: { 'cf-mitigated': 'challenge' } }]),
        browserPool,
      }),
    );
    expect(vi.mocked(browserPool.render).mock.calls[0]?.[0]).toMatchObject({ blockResources: false });
  });

  it('tells the browser a pdf is wanted, so nothing it needs is blocked', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    await runPipeline({ url: 'https://example.com', formats: ['markdown', 'pdf'] }, deps({ browserPool }));
    expect(vi.mocked(browserPool.render).mock.calls[0]?.[0]).toMatchObject({ pdf: true });
  });
});

describe('runPipeline camoufox as the last rung', () => {
  function extractByHtml(): ExtractClient {
    return {
      extract: vi.fn(async ({ html }: { html: string }) => {
        const text = html.includes('<article>') ? ARTICLE_TEXT : '';
        return {
          markdown: text,
          text,
          title: 'Test',
          language: 'en',
          links: [],
          extractorUsed: 'trafilatura',
          contentHash: 'abc123',
        };
      }),
      health: vi.fn(async () => true),
    } as unknown as ExtractClient;
  }

  function poolWithCamoufox(ready: boolean): BrowserPool {
    return {
      render: vi.fn(async (opts: { engine: string }) => ({
        html: opts.engine === 'camoufox' ? ARTICLE : CLOUDFLARE_CHALLENGE,
        status: 200,
        headers: {},
        finalUrl: 'https://example.com',
        timingMs: 500,
      })),
      camoufoxReady: () => ready,
      stats: () => ({ browsers: 1, activeContexts: 0, pagesServed: 1 }),
      close: vi.fn(async () => undefined),
      start: vi.fn(async () => undefined),
    } as unknown as BrowserPool;
  }

  it('walks into camoufox when the probe found it and chromium was blocked', async () => {
    const browserPool = poolWithCamoufox(true);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: CLOUDFLARE_CHALLENGE }]),
        extractClient: extractByHtml(),
        browserPool,
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tier).toBe('camoufox');
    expect(result.tiersAttempted).toContain('camoufox');
  });

  it('stops at chromium when camoufox did not answer the probe', async () => {
    const browserPool = poolWithCamoufox(false);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({
        fetchClient: fetchClientReturning([{ status: 200, body: CLOUDFLARE_CHALLENGE }]),
        extractClient: extractByHtml(),
        browserPool,
      }),
    );

    expect(result.tiersAttempted).not.toContain('camoufox');
    if (!result.success) expect(result.reason).toBe('challenge');
  });
});

describe('runPipeline conditional requests', () => {
  it('answers a 304 as an unchanged success rather than an empty failure', async () => {
    const extractClient = extractClientReturning(ARTICLE_TEXT);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'], headers: { 'if-none-match': '"v1"' } },
      deps({ fetchClient: fetchClientReturning([{ status: 304, body: '' }]), extractClient }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.notModified).toBe(true);
    expect(result.statusCode).toBe(304);
    expect(extractClient.extract).not.toHaveBeenCalled();
  });

  it('does not escalate a 304, since a higher tier cannot produce a body either', async () => {
    const browserPool = browserPoolReturning(ARTICLE);
    const result = await runPipeline(
      { url: 'https://example.com', formats: ['markdown'] },
      deps({ fetchClient: fetchClientReturning([{ status: 304, body: '' }]), browserPool }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tiersAttempted).toEqual(['tls']);
    expect(browserPool.render).not.toHaveBeenCalled();
  });
});
