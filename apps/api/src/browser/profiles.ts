import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/**
 * `packages/profiles/definitions` at the repo root in development; beside
 * `dist/` when the bundle is staged. Walks upward from this module, as
 * `mcp/spec.ts` does for openapi.yaml, so both layouts resolve.
 */
function definitionsDir(): string {
  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'packages', 'profiles', 'definitions');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // src/browser -> apps/api -> apps -> repo root
  return join(start, '..', '..', '..', '..', 'packages', 'profiles', 'definitions');
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
 * A per-instance secret the canvas seed is keyed with.
 *
 * Derived once from whichever instance secret exists, and from random bytes if
 * none does. It never leaves the process; only its effect on pixels is visible.
 */
let instanceSecret: Buffer | undefined;

function secret(): Buffer {
  if (instanceSecret) return instanceSecret;
  const configured = process.env['HELIX_ENCRYPTION_KEY'] ?? process.env['HELIX_BOOTSTRAP_KEY'];
  instanceSecret = configured
    ? createHash('sha256').update(`canvas:${configured}`).digest()
    : randomBytes(32);
  return instanceSecret;
}

/** Test seam: forget the derived secret so a different environment can be read. */
export function resetInstanceSecret(): void {
  instanceSecret = undefined;
}

/**
 * A stable 32-bit seed for this identity, keyed with an instance-local secret.
 *
 * Two properties have to hold at once, and only one of them is obvious.
 *
 * Stable: real browsers return an identical canvas hash on every read, so a
 * value that varies between two reads is itself the tell.
 *
 * *Unpredictable to the page.* Deriving the seed from the profile id alone —
 * which is what this did first — makes it a pure function of a value that ships
 * in a public repo. A tracker recomputes it off-box, inverts the transform, and
 * recovers the true hardware canvas hash: strictly worse than not perturbing at
 * all, because every install then hands out the same stable identifier behind a
 * veneer of protection. (Cortex shipped and measured exactly this: 0 of 4096
 * bytes differed after inversion.)
 *
 * Keying with an instance secret keeps the stability and removes the
 * predictability. The fallback is random rather than public — it degrades
 * toward unpredictable, never toward guessable.
 */
function seedFor(profile: BrowserProfile): number {
  const source = profile.js.canvasSeed && profile.js.canvasSeed !== 'per-session' ? profile.js.canvasSeed : profile.id;
  const digest = createHmac('sha256', secret()).update(source).digest();
  return digest.readUInt32BE(0);
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

  // Canvas: perturb deterministically from the seed, which is keyed with an
  // instance secret the page cannot compute. A per-read random value would be
  // detected because it varies between two reads; a publicly-derivable one is
  // worse still, because the transform can simply be replayed and inverted.
  //
  // The offset walks with a small PRNG rather than a fixed stride, and the
  // delta varies per pixel, so knowing one touched byte does not give the rest.
  const toBlobOrDataUrl = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    try {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        const image = ctx.getImageData(0, 0, this.width, this.height);
        const d = image.data;
        let state = p.seed >>> 0;
        const next = () => {
          // xorshift32: cheap, and every bit of the seed reaches the output.
          state ^= state << 13; state >>>= 0;
          state ^= state >>> 17;
          state ^= state << 5; state >>>= 0;
          return state;
        };
        for (let i = 0; i < d.length; ) {
          const r = next();
          // Nudge one channel by ±1, clamped. Sub-perceptual, but it moves the hash.
          const delta = (r & 1) === 0 ? 1 : -1;
          const v = d[i] + delta;
          d[i] = v < 0 ? 0 : v > 255 ? 255 : v;
          // 4..~1024 bytes on, so the touched set is not a fixed lattice.
          i += 4 * (1 + ((r >>> 1) & 0xff));
        }
        ctx.putImageData(image, 0, 0);
      }
    } catch {}
    return toBlobOrDataUrl.apply(this, args);
  };
})();`;
}
