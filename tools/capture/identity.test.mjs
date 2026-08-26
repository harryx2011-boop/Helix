import { describe, expect, it } from 'vitest';
import {
  browserFromUserAgent,
  HEADER_TABLE_SIZE,
  platformFromSurface,
  recordingProblems,
  RESOLVABLE,
  versionFromUserAgent,
  versionMismatch,
} from './identity.mjs';

/**
 * These decide whether a recording is written and what identity it claims. A
 * wrong answer here produces a definition marked `verified: true` that describes
 * a browser nobody runs — worse than having no definition at all.
 */

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const HEADLESS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.0.0 Safari/537.36';
const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

function surface(overrides = {}) {
  return {
    userAgent: CHROME_MAC,
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2070 SUPER, D3D11)',
    maxTouchPoints: 0,
    ...overrides,
  };
}

describe('browserFromUserAgent', () => {
  it('reads Edge before Chrome, because Edge claims to be both', () => {
    expect(browserFromUserAgent(EDGE)).toBe('edge');
    expect(browserFromUserAgent(CHROME_MAC)).toBe('chrome');
  });

  it('reads Safari, which every WebKit UA also mentions', () => {
    expect(browserFromUserAgent(SAFARI)).toBe('safari');
  });

  it('returns unknown rather than guessing', () => {
    expect(browserFromUserAgent('curl/8.4.0')).toBe('unknown');
  });
});

describe('platformFromSurface', () => {
  it('distinguishes the desktop platforms', () => {
    expect(platformFromSurface(surface({ userAgent: CHROME_MAC }))).toBe('macos');
    expect(platformFromSurface(surface({ userAgent: CHROME_WIN }))).toBe('windows');
  });

  it('needs both a mobile UA and touch points before it says ios', () => {
    expect(platformFromSurface(surface({ userAgent: IOS, maxTouchPoints: 5 }))).toBe('ios');
    // A Mac with a touchscreen-shaped report is still a Mac.
    expect(platformFromSurface(surface({ userAgent: CHROME_MAC, maxTouchPoints: 5 }))).toBe('macos');
  });
});

describe('versionFromUserAgent', () => {
  it('reads each engine from the token that carries its own version', () => {
    expect(versionFromUserAgent(CHROME_MAC, 'chrome')).toBe('137');
    expect(versionFromUserAgent(EDGE, 'edge')).toBe('131');
    // Safari/605 is the WebKit build; Version/18.5 is Safari's own.
    expect(versionFromUserAgent(SAFARI, 'safari')).toBe('18');
  });

  it('is unknown when the token is absent', () => {
    expect(versionFromUserAgent('curl/8.4.0', 'chrome')).toBe('unknown');
  });
});

describe('recordingProblems', () => {
  it('accepts a recording from a real headed browser with a GPU', () => {
    expect(recordingProblems(surface())).toEqual([]);
  });

  it('refuses a headless user-agent, which is itself the signal', () => {
    const problems = recordingProblems(surface({ userAgent: HEADLESS }));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('HeadlessChrome');
  });

  it('refuses a software rasteriser, which fingerprints as no GPU', () => {
    for (const renderer of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
      'Mesa/X.org, llvmpipe (LLVM 15.0.7, 256 bits)',
      'Software Rasterizer',
    ]) {
      const problems = recordingProblems(surface({ webglRenderer: renderer }));
      expect(problems.some((p) => p.includes('software rasteriser'))).toBe(true);
    }
  });

  it('refuses a recording with no renderer at all', () => {
    const problems = recordingProblems(surface({ webglRenderer: null }));

    expect(problems.some((p) => p.includes('WebGL reported nothing'))).toBe(true);
  });

  it('reports every problem at once rather than one at a time', () => {
    const problems = recordingProblems(surface({ userAgent: HEADLESS, webglRenderer: null }));

    expect(problems).toHaveLength(2);
  });
});

describe('versionMismatch', () => {
  it('catches a recording stored under a different version', () => {
    expect(versionMismatch('chrome-137', '151')).toEqual({ expected: '137', recorded: '151' });
  });

  it('is silent when they agree', () => {
    expect(versionMismatch('chrome-137', '137')).toBeUndefined();
  });

  it('is silent when there is nothing to compare', () => {
    expect(versionMismatch('chrome-137', 'unknown')).toBeUndefined();
    expect(versionMismatch('safari-ios-18-1-1', 'unknown')).toBeUndefined();
  });
});

describe('the resolvable identity list', () => {
  it('matches what apps/fetch advertises, or a capture names a profile it falls back from', () => {
    // Mirrors available() in apps/fetch/src/profile.rs. If that list changes,
    // this fails, which is the point.
    expect(RESOLVABLE).toEqual([
      'chrome-137',
      'chrome-136',
      'chrome-135',
      'chrome-134',
      'chrome-133',
      'chrome-132',
      'chrome-131',
      'edge-131',
      'edge-127',
      'safari-18-5',
      'safari-18-3-1',
      'safari-17-5',
      'safari-ios-18-1-1',
    ]);
  });

  it('carries an HTTP/2 table size for every engine it can record', () => {
    for (const engine of ['chrome', 'edge', 'firefox', 'safari']) {
      expect(HEADER_TABLE_SIZE[engine]).toBeGreaterThan(0);
    }
    // Safari is the one that differs, and getting it wrong is a single-field giveaway.
    expect(HEADER_TABLE_SIZE.safari).toBe(4096);
    expect(HEADER_TABLE_SIZE.chrome).toBe(65536);
  });
});
