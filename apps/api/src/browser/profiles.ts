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

export interface UaBrand {
  brand: string;
  version: string;
}

/** What the launched browser reports about itself, read once per launch. */
export interface BrowserIdentity {
  userAgent: string;
  brands: UaBrand[];
  fullVersionList: UaBrand[];
  platform: string;
  platformVersion: string;
  architecture: string;
  bitness: string;
}

export interface UserAgentOverride {
  userAgent: string;
  acceptLanguage: string;
  userAgentMetadata: {
    brands: UaBrand[];
    fullVersionList: UaBrand[];
    platform: string;
    platformVersion: string;
    architecture: string;
    model: string;
    mobile: boolean;
    bitness: string;
    wow64: boolean;
  };
}

/** The headless shell's UA with the reduced version a real Chrome sends. */
export function headfulUserAgent(userAgent: string): string {
  return userAgent.replace(/HeadlessChrome\/(\d+)[\d.]*/, 'Chrome/$1.0.0.0');
}

function platformOf(userAgent: string): string | undefined {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS X')) return 'macOS';
  if (userAgent.includes('Android')) return 'Android';
  if (/Linux|X11/.test(userAgent)) return 'Linux';
  return undefined;
}

/**
 * The UA, Accept-Language and client hints for one page.
 *
 * Playwright's `userAgent` option changes the string but not `sec-ch-ua` or
 * `navigator.userAgentData`, which keep saying "HeadlessChrome" at the real
 * version. The browser's own brand list is kept, GREASE entry and order
 * included, with the headless brand renamed and the version moved to the UA's.
 */
export function userAgentOverride(
  identity: BrowserIdentity,
  profile: BrowserProfile | undefined,
  mobile: boolean,
): UserAgentOverride {
  const userAgent = profile?.headers?.userAgent ?? headfulUserAgent(identity.userAgent);
  const major = /Chrome\/(\d+)/.exec(userAgent)?.[1];
  const rebrand = (list: UaBrand[], full: boolean): UaBrand[] =>
    list.map(({ brand, version }) => {
      if (brand !== 'HeadlessChrome' && brand !== 'Chromium' && brand !== 'Google Chrome') return { brand, version };
      const renamed = brand === 'HeadlessChrome' ? 'Google Chrome' : brand;
      if (!major || version.split('.')[0] === major) return { brand: renamed, version };
      return { brand: renamed, version: full ? `${major}.0.0.0` : major };
    });
  const platform = platformOf(userAgent) ?? identity.platform;

  return {
    userAgent,
    // Chrome adds the q-values itself; passing them through doubles them.
    acceptLanguage: (profile?.headers?.acceptLanguage ?? 'en-US,en')
      .split(',')
      .map((tag) => tag.split(';')[0]?.trim())
      .join(','),
    userAgentMetadata: {
      brands: rebrand(identity.brands, false),
      fullVersionList: rebrand(identity.fullVersionList, true),
      platform,
      platformVersion: platform === identity.platform ? identity.platformVersion : '',
      architecture: identity.architecture,
      model: '',
      mobile,
      bitness: identity.bitness,
      wow64: false,
    },
  };
}

/**
 * The init script a context runs before any page code.
 *
 * With no profile it still runs on chromium: the headless shell has no
 * `window.chrome` and no plugins, which a page reads without any identity
 * being asked for. Every replaced function and getter reports itself as
 * native code through one patched `Function.prototype.toString`.
 *
 * Every override is guarded: a property that cannot be redefined is left alone
 * rather than throwing, because a page that sees an exception from a getter has
 * learned more about us than the value would have told it.
 */
export function fingerprintScript(profile: BrowserProfile | undefined, chromium = true): string {
  const js = profile?.js ?? {};
  const payload = {
    ...(profile ? { seed: seedFor(profile) } : {}),
    chromium,
    webglVendor: js.webglVendor ?? null,
    webglRenderer: js.webglRenderer ?? null,
    hardwareConcurrency: js.hardwareConcurrency ?? null,
    deviceMemory: js.deviceMemory ?? null,
    screen: js.screen ?? null,
  };

  return `(() => {
  const p = ${JSON.stringify(payload)};

  const nativeToString = Function.prototype.toString;
  const disguised = new WeakMap();
  const native = (fn) => {
    disguised.set(fn, 'function ' + fn.name + '() { [native code] }');
    return fn;
  };
  Function.prototype.toString = native({
    toString() {
      return disguised.has(this) ? disguised.get(this) : nativeToString.call(this);
    },
  }.toString);

  const define = (target, prop, value) => {
    try {
      const original = Object.getOwnPropertyDescriptor(target, prop);
      const get = native(Object.getOwnPropertyDescriptor({ get [prop]() { return value; } }, prop).get);
      Object.defineProperty(target, prop, { get, enumerable: original ? original.enumerable : true, configurable: true });
    } catch {}
  };

  if (navigator.webdriver) define(Navigator.prototype, 'webdriver', false);

  if (p.chromium) {
    try {
      if (!('chrome' in window)) {
        const app = {
          isInstalled: false,
          getDetails() { return null; },
          getIsInstalled() { return false; },
          installState(callback) { if (typeof callback === 'function') setTimeout(() => callback('not_installed'), 0); },
          runningState() { return 'cannot_run'; },
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        };
        const chrome = {
          loadTimes() {
            const t = performance.timing;
            const nav = performance.getEntriesByType('navigation')[0];
            const paint = performance.getEntriesByName('first-paint')[0];
            const protocol = nav ? nav.nextHopProtocol : 'http/1.1';
            const spdy = protocol === 'h2' || protocol === 'h3';
            return {
              requestTime: t.requestStart / 1000,
              startLoadTime: t.navigationStart / 1000,
              commitLoadTime: t.responseStart / 1000,
              finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000,
              finishLoadTime: t.loadEventEnd / 1000,
              firstPaintTime: paint ? (performance.timeOrigin + paint.startTime) / 1000 : 0,
              firstPaintAfterLoadTime: 0,
              navigationType: 'Other',
              wasFetchedViaSpdy: spdy,
              wasNpnNegotiated: spdy,
              npnNegotiatedProtocol: spdy ? protocol : 'unknown',
              wasAlternateProtocolAvailable: false,
              connectionInfo: protocol,
            };
          },
          csi() {
            const t = performance.timing;
            return { startE: t.navigationStart, onloadT: t.loadEventEnd, pageT: performance.now(), tran: 15 };
          },
          app,
        };
        for (const fn of [chrome.loadTimes, chrome.csi, app.getDetails, app.getIsInstalled, app.installState, app.runningState]) native(fn);
        Object.defineProperty(window, 'chrome', { value: chrome, writable: true, enumerable: true, configurable: false });
      }
    } catch {}

    // Chrome's fixed PDF plugin list. The fakes are real Plugin / PluginArray
    // instances by prototype, and the prototype accessors answer for them, so
    // their own keys match a real browser's: indexes and names, never 'length'.
    try {
      if (navigator.plugins.length === 0) {
        const fakes = new WeakMap();
        const fake = (proto, data, items, key) => {
          const object = Object.create(proto);
          fakes.set(object, data);
          items.forEach((item, i) => Object.defineProperty(object, i, { value: item, enumerable: true, configurable: true }));
          for (const item of items) Object.defineProperty(object, fakes.get(item)[key], { value: item, configurable: true });
          data.length = items.length;
          data.item = (i) => items[i] ?? null;
          data.namedItem = (name) => items.find((item) => fakes.get(item)[key] === name) ?? null;
          return object;
        };
        const doc = 'Portable Document Format';
        const mimes = ['application/pdf', 'text/pdf'].map((type) =>
          fake(MimeType.prototype, { type, suffixes: 'pdf', description: doc, enabledPlugin: null }, [], ''),
        );
        const plugins = ['PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer', 'Microsoft Edge PDF Viewer', 'WebKit built-in PDF']
          .map((name) => fake(Plugin.prototype, { name, filename: 'internal-pdf-viewer', description: doc }, mimes, 'type'));
        for (const mime of mimes) fakes.get(mime).enabledPlugin = plugins[0];
        const pluginArray = fake(PluginArray.prototype, {}, plugins, 'name');
        const mimeArray = fake(MimeTypeArray.prototype, {}, mimes, 'type');

        const answer = (proto, getters, methods) => {
          for (const prop of getters) {
            const d = Object.getOwnPropertyDescriptor(proto, prop);
            if (!d || !d.get) continue;
            const original = d.get;
            const get = native(Object.getOwnPropertyDescriptor({
              get [prop]() { return fakes.has(this) ? fakes.get(this)[prop] : original.call(this); },
            }, prop).get);
            Object.defineProperty(proto, prop, { ...d, get });
          }
          for (const prop of methods) {
            const original = proto[prop];
            proto[prop] = native({
              [prop](arg) { return fakes.has(this) ? fakes.get(this)[prop](arg) : original.apply(this, arguments); },
            }[prop]);
          }
        };
        answer(PluginArray.prototype, ['length'], ['item', 'namedItem']);
        answer(MimeTypeArray.prototype, ['length'], ['item', 'namedItem']);
        answer(Plugin.prototype, ['name', 'filename', 'description', 'length'], ['item', 'namedItem']);
        answer(MimeType.prototype, ['type', 'suffixes', 'description', 'enabledPlugin'], []);
        define(Navigator.prototype, 'plugins', pluginArray);
        define(Navigator.prototype, 'mimeTypes', mimeArray);
        define(Navigator.prototype, 'pdfViewerEnabled', true);
      }
    } catch {}
  }

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
      ctor.prototype.getParameter = native({
        getParameter(parameter) {
          if (parameter === 37445 && p.webglVendor !== null) return p.webglVendor;
          if (parameter === 37446 && p.webglRenderer !== null) return p.webglRenderer;
          return original.call(this, parameter);
        },
      }.getParameter);
    }
  }

  // Canvas: perturb deterministically from the seed, which is keyed with an
  // instance secret the page cannot compute. A per-read random value would be
  // detected because it varies between two reads; a publicly-derivable one is
  // worse still, because the transform can simply be replayed and inverted.
  //
  // Which pixels move, and which way, is a hash of the seed and the pixel's
  // canvas coordinates, so a getImageData of any sub-rectangle agrees with the
  // full-canvas export, and knowing one touched pixel does not give the rest.
  // The noise goes on a scratch copy: writing it back into the page's canvas
  // would stack on every read and change the hash each time.
  if (p.seed !== undefined) {
    const perturb = (d, x0, y0, width) => {
      for (let i = 0; i < d.length; i += 4) {
        const px = i >> 2;
        let h = Math.imul(((x0 + (px % width)) * 73856093) ^ ((y0 + ((px / width) | 0)) * 19349663) ^ p.seed, 0x9e3779b1);
        h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
        // About one pixel in 64, one channel by ±1: sub-perceptual, but it moves the hash.
        if ((h & 63) === 0) d[i] += h & 64 ? 1 : -1;
      }
    };
    const getImageData = CanvasRenderingContext2D.prototype.getImageData;
    const noisy = (canvas) => {
      if (!(canvas.width > 0 && canvas.height > 0)) return canvas;
      try {
        const scratch = document.createElement('canvas');
        scratch.width = canvas.width;
        scratch.height = canvas.height;
        const ctx = scratch.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        const image = getImageData.call(ctx, 0, 0, scratch.width, scratch.height);
        perturb(image.data, 0, 0, scratch.width);
        ctx.putImageData(image, 0, 0);
        return scratch;
      } catch {
        return canvas;
      }
    };
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toDataURL = native({
      toDataURL() { return toDataURL.apply(noisy(this), arguments); },
    }.toDataURL);
    HTMLCanvasElement.prototype.toBlob = native({
      toBlob(callback) { return toBlob.apply(noisy(this), arguments); },
    }.toBlob);
    CanvasRenderingContext2D.prototype.getImageData = native({
      getImageData(sx, sy, sw, sh) {
        const image = getImageData.apply(this, arguments);
        try { perturb(image.data, Math.trunc(sx), Math.trunc(sy), image.width); } catch {}
        return image;
      },
    }.getImageData);
  }
})();`;
}
