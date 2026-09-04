import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_TIER,
  minimumViableTier,
  shouldEscalate,
  TIER_ORDER,
  type Tier,
} from './escalation.js';
import type { ResponseFacts } from './block-detection.js';

/**
 * The camoufox tier is the expensive end of the ladder and runs in a process
 * the operator had to start. So the property under test is not that it works —
 * it is that nothing reaches it by accident. Evidence walks a request up to
 * chromium; only an explicit ceiling goes further.
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
  it('puts camoufox above chromium, and last', () => {
    expect(TIER_ORDER.at(-1)).toBe('camoufox');
    expect(TIER_ORDER.indexOf('camoufox')).toBeGreaterThan(TIER_ORDER.indexOf('chromium'));
  });

  it('stops the default ceiling below camoufox', () => {
    expect(DEFAULT_MAX_TIER).toBe('chromium');
  });
});

describe('camoufox is opt-in, never inferred', () => {
  it('does not escalate into camoufox on evidence of a block', () => {
    const decision = shouldEscalate({
      currentTier: 'chromium',
      response: BLOCKED,
      capabilities: {},
    });
    expect(decision.escalate).toBe(false);
    expect(decision.nextTier).toBeUndefined();
  });

  it('does not escalate into camoufox when content is absent', () => {
    const decision = shouldEscalate({
      currentTier: 'chromium',
      response: facts({ body: '<html><body><div id="root"></div></body></html>', extractedText: '' }),
      capabilities: {},
    });
    expect(decision.escalate).toBe(false);
  });

  it('never selects camoufox as a starting tier, whatever the capabilities', () => {
    const capabilitySets = [
      {},
      { screenshot: true },
      { actions: true },
      { visualLayout: true },
      { pdfRender: true },
      { waitFor: 5_000 },
      { proxy: true },
      { screenshot: true, actions: true, proxy: true, waitFor: 1_000 },
    ];
    for (const caps of capabilitySets) {
      expect(minimumViableTier(caps)).not.toBe('camoufox');
    }
  });

  it('reaches camoufox only when the caller raises the ceiling to it', () => {
    const decision = shouldEscalate({
      currentTier: 'chromium',
      response: BLOCKED,
      capabilities: {},
      maxTier: 'camoufox',
    });
    expect(decision.escalate).toBe(true);
    expect(decision.nextTier).toBe('camoufox');
  });

  it('still requires evidence once the ceiling allows it', () => {
    // A ceiling is permission to go higher, not a reason to.
    const decision = shouldEscalate({
      currentTier: 'chromium',
      response: facts(),
      capabilities: {},
      maxTier: 'camoufox',
    });
    expect(decision.escalate).toBe(false);
    expect(decision.reason).toBe('content present');
  });
});

describe('camoufox capabilities', () => {
  it('can serve the visual work chromium serves, so a raised ceiling is usable', () => {
    // Reached through the ceiling rather than as a floor: the tier below is
    // still preferred, and this only confirms camoufox is not skipped as
    // incapable once a request has been allowed to climb.
    for (const caps of [{ screenshot: true }, { actions: true }, { pdfRender: true }]) {
      const decision = shouldEscalate({
        currentTier: 'chromium',
        response: BLOCKED,
        capabilities: caps,
        maxTier: 'camoufox',
      });
      expect(decision.nextTier).toBe('camoufox');
    }
  });
});

describe('the lower ladder is unchanged', () => {
  it('starts a plain request at the cheapest tier', () => {
    expect(minimumViableTier({})).toBe('plain');
  });

  it('still starts visual work at chromium', () => {
    expect(minimumViableTier({ screenshot: true })).toBe('chromium');
  });

  it('walks plain to tls on evidence', () => {
    const decision = shouldEscalate({ currentTier: 'plain', response: BLOCKED, capabilities: {} });
    expect(decision.escalate).toBe(true);
    expect(decision.nextTier).toBe('tls');
  });

  it('keeps every tier reachable in order under a raised ceiling', () => {
    const walked: Tier[] = ['plain'];
    let current: Tier = 'plain';
    for (let i = 0; i < TIER_ORDER.length; i++) {
      const decision = shouldEscalate({
        currentTier: current,
        response: BLOCKED,
        capabilities: {},
        maxTier: 'camoufox',
      });
      if (!decision.escalate || !decision.nextTier) break;
      current = decision.nextTier;
      walked.push(current);
    }
    expect(walked).toEqual(['plain', 'tls', 'lightpanda', 'chromium', 'camoufox']);
  });
});
