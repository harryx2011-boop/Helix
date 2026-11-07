import { chromium, firefox, webkit, type BrowserType } from 'playwright';
import type { BrowserProfile } from './profiles.js';

export type RenderEngine = 'chromium' | 'firefox' | 'webkit';

export const RENDER_ENGINES: readonly RenderEngine[] = ['chromium', 'firefox', 'webkit'] as const;

export function isRenderEngine(value: string): value is RenderEngine {
  return (RENDER_ENGINES as readonly string[]).includes(value);
}

const TYPES: Record<RenderEngine, BrowserType> = { chromium, firefox, webkit };

export function browserTypeFor(engine: RenderEngine): BrowserType {
  return TYPES[engine];
}

const CHROMIUM_ARGS: readonly string[] = [
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-blink-features=AutomationControlled',
  // WebRTC's STUN is UDP, which no HTTP proxy carries: unlocked, a page reaches loopback
  // and the LAN around the guard proxy, and shows the real address behind a caller's proxy.
  // Both spellings, measured: the headless shell honours only the forced value, the full
  // Chromium build only the plain policy switch.
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
];

/**
 * Firefox's equivalent of the lock above. Measured: Playwright's Firefox sent no STUN
 * packet without it either; the pref keeps it that way if a build turns WebRTC on.
 */
export const FIREFOX_PREFS: Readonly<Record<string, boolean>> = { 'media.peerconnection.ice.proxy_only': true };

export function launchArgsFor(engine: RenderEngine): string[] {
  return engine === 'chromium' ? [...CHROMIUM_ARGS] : [];
}

/**
 * Whether an identity can be presented on this engine at all.
 *
 * The transport layer already refuses to assemble an identity piecemeal (see
 * `apps/scrape/helix_scrape/profiles.py`); the same rule has to hold here. A
 * Chrome profile on Firefox contradicts itself in the one place detection looks
 * first — `navigator.userAgent` says Chrome while the JS engine answers like
 * Gecko, and no amount of getter patching reconciles the two. That is strictly
 * worse than presenting nothing, because a coherent unspoofed Firefox is
 * unremarkable while a Chrome-claiming Gecko is a positive signal.
 *
 * So a profile is applied only on the engine family it describes, and a
 * mismatch drops the profile rather than the request: the caller still gets
 * their page, and `profileUsed` comes back absent so the substitution is
 * visible instead of silent.
 */
const ENGINE_FAMILIES: Record<RenderEngine, readonly string[]> = {
  chromium: ['chrome', 'chromium', 'edge', 'brave', 'opera'],
  firefox: ['firefox'],
  webkit: ['safari', 'webkit'],
};

export function profileMatchesEngine(profile: BrowserProfile, engine: RenderEngine): boolean {
  return ENGINE_FAMILIES[engine].includes(profile.browser.toLowerCase());
}

/**
 * Firefox accepts `isMobile` and silently does nothing with it: measured, the
 * viewport narrows but `ontouchstart` never appears, so a page branching on
 * touch still serves its desktop layout. Reporting that as a phone render would
 * repeat exactly the lie the plain and tls `mobile` warning exists to prevent.
 */
export function supportsMobileEmulation(engine: RenderEngine): boolean {
  return engine !== 'firefox';
}
