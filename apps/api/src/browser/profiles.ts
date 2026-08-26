import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Log } from '../core/logger.js';

/**
 * Browser identity profiles, JS layer.
 *
 * The transport layer is not here: TLS and HTTP/2 emulation belong to
 * helix-fetch, which delegates them to `wreq-util`'s presets. What the browser
 * tier owns is everything a page can read about the machine it thinks it is
 * running on — WebGL strings, core count, memory, timezone, screen, fonts.
 *
 * A definition with `verified: false` was not captured from a real browser. Its
 * JS surface is plausible rather than measured, which is exactly the kind of
 * detail detection looks for. It is still applied when a caller names it —
 * a guessed identity beats leaking the host machine's real one — but it is
 * logged every time. `tools/capture` records a verified definition.
 */

export interface ProfileScreen {
  width: number;
  height: number;
  colorDepth: number;
}

export interface ProfileJs {
  canvasSeed?: string;
  webglVendor?: string;
  webglRenderer?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  timezone?: string;
  screen?: ProfileScreen;
  fonts?: string[];
}

export interface BrowserProfile {
  id: string;
  browser: string;
  version: string;
  platform: string;
  /** Null until `tools/capture` records it from a real browser. */
  capturedAt: string | null;
  /** False for a hand-written definition. Applied anyway, but logged on every use. */
  verified: boolean;
  headers?: { userAgent?: string; acceptLanguage?: string };
  js: ProfileJs;
}

function definitionsDir(): string {
  // src/browser -> apps/api -> apps -> repo root
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'packages', 'profiles', 'definitions');
}

let cache: Map<string, BrowserProfile> | undefined;

export function loadProfiles(logger?: Log, dir = definitionsDir()): Map<string, BrowserProfile> {
  if (cache) return cache;

  const loaded = new Map<string, BrowserProfile>();
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    // No definitions shipped is a valid state: the browser tier then applies
    // nothing, which is what it did before profiles existed.
    cache = loaded;
    return loaded;
  }

  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as BrowserProfile;
      if (!parsed.id || typeof parsed.js !== 'object') continue;
      loaded.set(parsed.id, parsed);
    } catch (error) {
      logger?.warn({ error, file }, 'skipped an unreadable browser profile');
    }
  }

  cache = loaded;
  return loaded;
}

/** Test seam: forget what was loaded so a different directory can be read. */
export function resetProfileCache(): void {
  cache = undefined;
}

export function getProfile(id: string | undefined, logger?: Log): BrowserProfile | undefined {
  if (!id) return undefined;
  const profile = loadProfiles(logger).get(id);

  // An unverified profile is still applied — it beats presenting the host
  // machine's real fingerprint, and silently ignoring a caller's explicit
  // request would be its own surprise. But it is said out loud, because the
  // values are plausible rather than measured.
  if (profile && !profile.verified) {
    logger?.warn(
      { profile: profile.id },
      'applying a profile that was never captured from a real browser; run tools/capture to record one',
    );
  }

  return profile;
}

/**
 * A stable 32-bit seed for this identity.
 *
 * Real browsers return an identical canvas hash on every read; randomising per
 * read is itself the tell. Deriving from the profile id makes the value stable
 * across renders without storing one.
 */
function seedFor(profile: BrowserProfile): number {
  const source = profile.js.canvasSeed && profile.js.canvasSeed !== 'per-session' ? profile.js.canvasSeed : profile.id;
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The init script a context runs before any page code.
 *
 * Every override is guarded: a property that cannot be redefined is left alone
 * rather than throwing, because a page that sees an exception from a getter has
 * learned more about us than the value would have told it.
 */
export function fingerprintScript(profile: BrowserProfile): string {
  const js = profile.js;
  const payload = {
    seed: seedFor(profile),
    webglVendor: js.webglVendor ?? null,
    webglRenderer: js.webglRenderer ?? null,
    hardwareConcurrency: js.hardwareConcurrency ?? null,
    deviceMemory: js.deviceMemory ?? null,
    screen: js.screen ?? null,
  };

  return `(() => {
  const p = ${JSON.stringify(payload)};
  const define = (target, prop, value) => {
    try {
      Object.defineProperty(target, prop, { get: () => value, configurable: true });
    } catch {}
  };

  if (p.hardwareConcurrency !== null) define(Navigator.prototype, 'hardwareConcurrency', p.hardwareConcurrency);
  if (p.deviceMemory !== null) define(Navigator.prototype, 'deviceMemory', p.deviceMemory);

  if (p.screen !== null) {
    define(Screen.prototype, 'width', p.screen.width);
    define(Screen.prototype, 'height', p.screen.height);
    define(Screen.prototype, 'availWidth', p.screen.width);
    define(Screen.prototype, 'availHeight', p.screen.height);
    define(Screen.prototype, 'colorDepth', p.screen.colorDepth);
    define(Screen.prototype, 'pixelDepth', p.screen.colorDepth);
  }

  // UNMASKED_VENDOR_WEBGL (37445) and UNMASKED_RENDERER_WEBGL (37446) are what
  // fingerprinters actually read; the unprefixed VENDOR is almost never useful.
  if (p.webglVendor !== null || p.webglRenderer !== null) {
    for (const ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!ctor) continue;
      const original = ctor.prototype.getParameter;
      ctor.prototype.getParameter = function (parameter) {
        if (parameter === 37445 && p.webglVendor !== null) return p.webglVendor;
        if (parameter === 37446 && p.webglRenderer !== null) return p.webglRenderer;
        return original.call(this, parameter);
      };
    }
  }

  // Canvas: perturb deterministically from the seed. A per-read random value
  // would be detected precisely because it varies between two reads.
  const toBlobOrDataUrl = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    try {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        const image = ctx.getImageData(0, 0, this.width, this.height);
        const d = image.data;
        // One deterministic sub-LSB nudge, spread across the buffer.
        for (let i = 0; i < d.length; i += 4 * 997) {
          d[i] = d[i] ^ (p.seed & 1);
        }
        ctx.putImageData(image, 0, 0);
      }
    } catch {}
    return toBlobOrDataUrl.apply(this, args);
  };
})();`;
}
