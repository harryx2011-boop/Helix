import { chromium, firefox, webkit, type BrowserType } from 'playwright';
import type { BrowserProfile } from './profiles.js';

/**
 * Engines the chromium tier can be driven by.
 *
 * Playwright ships all three, so the cost of offering them is not the download
 * but the details that differ underneath: launch flags, what a context option
 * actually does, and whether an identity still hangs together. Each of those is
 * settled here rather than at the call site, because a per-engine `if` scattered
 * through the pool is how one engine quietly loses a security control.
 */
export type RenderEngine = 'chromium' | 'firefox' | 'webkit';

export const RENDER_ENGINES: readonly RenderEngine[] = ['chromium', 'firefox', 'webkit'] as const;

export function isRenderEngine(value: string): value is RenderEngine {
  return (RENDER_ENGINES as readonly string[]).includes(value);
}

const TYPES: Record<RenderEngine, BrowserType> = { chromium, firefox, webkit };

export function browserTypeFor(engine: RenderEngine): BrowserType {
  return TYPES[engine];
}

/**
 * Launch flags, per engine.
 *
 * The Chromium set is not decoration: `--no-sandbox` and `--disable-dev-shm-usage`
 * are what keep it alive in a container with a small `/dev/shm`. They are also
 * Chromium-only switches — Firefox and WebKit take a different command line
 * entirely and treat an unknown flag as an error or as a URL to open, so passing
 * them through would break the launch rather than degrade it.
 */
const CHROMIUM_ARGS: readonly string[] = [
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

export function launchArgsFor(engine: RenderEngine): string[] {
  return engine === 'chromium' ? [...CHROMIUM_ARGS] : [];
}

/**
 * Whether an identity can be presented on this engine at all.
 *
 * The transport layer already refuses to assemble an identity piecemeal (see
 * the coherence validator in apps/fetch); the same rule has to hold here. A
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
 * repeat exactly the lie the lightpanda `mobile` warning exists to prevent.
 */
export function supportsMobileEmulation(engine: RenderEngine): boolean {
  return engine !== 'firefox';
}
