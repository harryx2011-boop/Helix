import { describe, expect, it } from 'vitest';
import {
  contentLooksAbsent,
  DEFAULT_MAX_TIER,
  minimumViableTier,
  normalizeTier,
  shouldEscalate,
  TIER_ORDER,
  type Tier,
} from './escalation.js';
import type { ResponseFacts } from './block-detection.js';

/**
 * v3 ladder: plain, tls, browser. The browser rung is helix-scrape's patched
 * Chromium, or the Playwright pool when the request needs a screenshot,
 * actions or a phone layout; that choice is a capability, not a tier.
 */

const ARTICLE = `<html><body><article>${'Real sentences carrying real content. '.repeat(20)}</article></body></html>`;

function facts(overrides: Partial<ResponseFacts> = {}): ResponseFacts {
  return {
    statusCode: 200,
    headers: {},
    body: ARTICLE,
    extractedText: 'Real sentences carrying real content. '.repeat(20),
    ...overrides,
  };
}

const BLOCKED = facts({ statusCode: 429, body: '<html><body>Access denied</body></html>', extractedText: '' });

describe('the ladder', () => {
  it('has three rungs, browser last', () => {
    expect(TIER_ORDER).toEqual(['plain', 'tls', 'browser']);
    expect(DEFAULT_MAX_TIER).toBe('browser');
  });

  it('walks every rung in order on evidence', () => {
    const walked: Tier[] = ['plain'];
    let current: Tier = 'plain';
    for (let i = 0; i < TIER_ORDER.length; i++) {
      const decision = shouldEscalate({ currentTier: current, response: BLOCKED, capabilities: {} });
      if (!decision.escalate || !decision.nextTier) break;
      current = decision.nextTier;
      walked.push(current);
    }
    expect(walked).toEqual(['plain', 'tls', 'browser']);
  });

  it('stops at browser: nothing sits above it', () => {
    const decision = shouldEscalate({ currentTier: 'browser', response: BLOCKED, capabilities: {} });
    expect(decision.escalate).toBe(false);
  });
});

describe('old tier names', () => {
  it.each(['lightpanda', 'camoufox'] as const)('maps the removed %s tier to browser, with a warning', (name) => {
    const mapped = normalizeTier(name);
    expect(mapped.tier).toBe('browser');
    expect(mapped.warning).toMatch(new RegExp(`${name}.*removed.*browser`));
  });

  it('maps chromium, the old name of the same rung, to browser without a warning', () => {
    expect(normalizeTier('chromium')).toEqual({ tier: 'browser' });
  });

  it.each(['auto', 'plain', 'tls', 'browser'] as const)('keeps %s as it is', (name) => {
    expect(normalizeTier(name)).toEqual({ tier: name });
  });
});

describe('the lower ladder is unchanged', () => {
  it('starts an auto request at tls, never plain', () => {
    expect(minimumViableTier({})).toBe('tls');
  });

  it('starts visual and JavaScript work at browser', () => {
    expect(minimumViableTier({ screenshot: true })).toBe('browser');
    expect(minimumViableTier({ waitFor: 500 })).toBe('browser');
  });

  it('walks plain to tls on evidence', () => {
    const decision = shouldEscalate({ currentTier: 'plain', response: BLOCKED, capabilities: {} });
    expect(decision.escalate).toBe(true);
    expect(decision.nextTier).toBe('tls');
  });

});

describe('an empty extraction on a server-rendered page', () => {
  const BOILERPLATE = `<html><body><nav>${'Home About Donate Jobs Community Events Blog Contact '.repeat(6)}</nav><main></main><footer>${'Copyright notice, privacy policy, terms of use, sitemap. '.repeat(6)}</footer></body></html>`;

  it('reads as content absent even though the raw HTML carries boilerplate text', () => {
    expect(contentLooksAbsent(BOILERPLATE, '')).toBe(true);
  });

  it('escalates off the cheap tier', () => {
    const decision = shouldEscalate({
      currentTier: 'plain',
      response: facts({ body: BOILERPLATE, extractedText: '' }),
      capabilities: {},
    });
    expect(decision.escalate).toBe(true);
    expect(decision.nextTier).toBe('tls');
  });

  it('keeps an extraction of 200 or more characters as content present', () => {
    expect(contentLooksAbsent(BOILERPLATE, 'x'.repeat(200))).toBe(false);
  });

  it('falls back to the raw-HTML checks when no extraction ran', () => {
    expect(contentLooksAbsent(BOILERPLATE)).toBe(false);
    expect(contentLooksAbsent('<html><body><div id="root"></div></body></html>')).toBe(true);
  });
});

describe('a short page that is complete', () => {
  const EXAMPLE = `<!doctype html><html lang=en><head><meta charset=utf-8><title>Example Domain</title><style>body{font:16px/1.6 system-ui}</style></head><body><p>This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it for testing and monitoring purposes.</p><script src=/s.js></script></body></html>`;
  const EXAMPLE_TEXT =
    'This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it for testing and monitoring purposes.';

  it('reads as content present when the extractor found nearly all the visible text', () => {
    expect(contentLooksAbsent(EXAMPLE, EXAMPLE_TEXT)).toBe(false);
  });

  it('stops at tls instead of climbing to a browser', () => {
    const decision = shouldEscalate({
      currentTier: 'tls',
      response: facts({ body: EXAMPLE, extractedText: EXAMPLE_TEXT }),
      capabilities: {},
    });
    expect(decision.escalate).toBe(false);
  });

  it('still escalates a loading shell whose only text is a placeholder', () => {
    const shell = '<html><body><div id="app">Loading...</div><script src="/main.js"></script></body></html>';
    expect(contentLooksAbsent(shell, 'Loading...')).toBe(true);
  });

  it('still escalates a short page that asks for JavaScript', () => {
    const html =
      '<html><body><noscript>You need to enable JavaScript to run this app.</noscript><p>Welcome to our product, the best way to manage your team tasks and projects online today.</p></body></html>';
    expect(contentLooksAbsent(html, 'Welcome to our product, the best way to manage your team tasks and projects online today.')).toBe(true);
  });
});

