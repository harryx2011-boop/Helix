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
];

export function launchArgsFor(engine: RenderEngine): string[] {
  return engine === 'chromium' ? [...CHROMIUM_ARGS] : [];
}

const ENGINE_FAMILIES: Record<RenderEngine, readonly string[]> = {
  chromium: ['chrome', 'chromium', 'edge', 'brave', 'opera'],
  firefox: ['firefox'],
  webkit: ['safari', 'webkit'],
};

export function profileMatchesEngine(profile: BrowserProfile, engine: RenderEngine): boolean {
  return ENGINE_FAMILIES[engine].includes(profile.browser.toLowerCase());
}

export function supportsMobileEmulation(engine: RenderEngine): boolean {
  return engine !== 'firefox';
}
