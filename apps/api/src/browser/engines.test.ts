import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  browserTypeFor,
  isRenderEngine,
  launchArgsFor,
  profileMatchesEngine,
  RENDER_ENGINES,
  supportsMobileEmulation,
  webRtcLockScript,
} from './engines.js';
import type { BrowserProfile } from './profiles.js';


function profile(browser: string): BrowserProfile {
  return {
    id: `${browser}-test`,
    browser,
    version: '1',
    platform: 'windows',
    capturedAt: null,
    verified: false,
    js: {},
  };
}

describe('launch arguments', () => {
  it('passes the container flags to chromium', () => {
    const args = launchArgsFor('chromium');
    expect(args).toContain('--no-sandbox');
    expect(args).toContain('--disable-dev-shm-usage');
  });

  it('turns off the automation flag that sets navigator.webdriver', () => {
    expect(launchArgsFor('chromium')).toContain('--disable-blink-features=AutomationControlled');
  });

  it('sends no chromium switches to firefox or webkit', () => {
    expect(launchArgsFor('firefox')).toEqual([]);
    expect(launchArgsFor('webkit')).toEqual([]);
  });
});

describe('WebRTC lock', () => {
  it('S23: only webkit needs a page script; chromium and firefox are locked at launch', () => {
    expect(webRtcLockScript('webkit')).toBeTypeOf('string');
    expect(webRtcLockScript('chromium')).toBeUndefined();
    expect(webRtcLockScript('firefox')).toBeUndefined();
  });

  it('S24: the webkit script leaves a page no way to open a peer connection', () => {
    class Peer {}
    const page: Record<string, unknown> = { RTCPeerConnection: Peer, webkitRTCPeerConnection: Peer, RTCDataChannel: Peer };
    page['globalThis'] = page;
    runInNewContext(webRtcLockScript('webkit') ?? '', page);
    expect(page['RTCPeerConnection']).toBeUndefined();
    expect(page['webkitRTCPeerConnection']).toBeUndefined();
    expect(page['RTCDataChannel']).toBeUndefined();
    expect(() => {
      page['RTCPeerConnection'] = Peer;
    }).toThrow(TypeError);
    expect(page['RTCPeerConnection']).toBeUndefined();
  });
});

describe('engine names', () => {
  it('accepts the three real engines and nothing else', () => {
    for (const engine of RENDER_ENGINES) expect(isRenderEngine(engine)).toBe(true);
    expect(isRenderEngine('lightpanda')).toBe(false);
    expect(isRenderEngine('camoufox')).toBe(false);
    expect(isRenderEngine('')).toBe(false);
  });

  it('resolves a distinct playwright type per engine', () => {
    const types = RENDER_ENGINES.map((e) => browserTypeFor(e));
    expect(new Set(types).size).toBe(RENDER_ENGINES.length);
  });
});

describe('profile and engine coherence', () => {
  it('applies a chromium-family identity only on chromium', () => {
    for (const browser of ['chrome', 'chromium', 'edge']) {
      expect(profileMatchesEngine(profile(browser), 'chromium')).toBe(true);
      expect(profileMatchesEngine(profile(browser), 'firefox')).toBe(false);
      expect(profileMatchesEngine(profile(browser), 'webkit')).toBe(false);
    }
  });

  it('matches firefox and safari identities to their own engines', () => {
    expect(profileMatchesEngine(profile('firefox'), 'firefox')).toBe(true);
    expect(profileMatchesEngine(profile('firefox'), 'chromium')).toBe(false);
    expect(profileMatchesEngine(profile('safari'), 'webkit')).toBe(true);
    expect(profileMatchesEngine(profile('safari'), 'chromium')).toBe(false);
  });

  it('ignores case, because the definitions are hand-written', () => {
    expect(profileMatchesEngine(profile('Chrome'), 'chromium')).toBe(true);
  });

  it('refuses an identity naming a browser no engine here provides', () => {
    for (const engine of RENDER_ENGINES) {
      expect(profileMatchesEngine(profile('lynx'), engine)).toBe(false);
    }
  });
});

describe('mobile emulation support', () => {
  it('excludes firefox, which accepts isMobile without emulating touch', () => {
    expect(supportsMobileEmulation('chromium')).toBe(true);
    expect(supportsMobileEmulation('webkit')).toBe(true);
    expect(supportsMobileEmulation('firefox')).toBe(false);
  });
});
