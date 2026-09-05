# Converter — build contract

`apps/converter` (Next, :4400). Fully client-side: there is no backend, no
account, and no network round-trip for the file being converted. Everything
in this document describes what runs inside the visited browser tab.

## 1. Identity

- Product name: **Converter API** (name kept from the pre-rearchitecture
  product; "API" now refers to the browser APIs it runs on, not a server
  endpoint). Part of Helix.
- Design system: **dark-default**, matching the Helix dashboard's app surface
  (`apps/dashboard/components/app/app-grid.tsx`) rather than Persona's
  light-default. Inter + JetBrains Mono, `--p-*` tokens carried over
  unchanged, radii pill/card 10px/panel 14px, `cubic-bezier(0,0,0.2,1)`,
  150–240ms — none of these are theme-specific, so they stay as they were.
  `.dark` is the default class on `<html>`; the Settings toggle can still
  switch to light.
- Blue `#2f6fe4` (light) / `#6b9bf2` (dark) is for actions only.

## 2. Ports

| Service | Port |
|---|---|
| Next frontend | 4400 |

No backend, no database. `apps/converter-api` (Fastify, formerly :8400) is
deleted.

## 3. Auth

**None.** There is no account, no API key, no sign-in gate. Nothing about
using the converter requires identifying yourself, because nothing you do
here is sent anywhere.

## 4. Limits

- Max file: **2 GB**. This used to be a 5 GB server-disk quota; there is no
  server now, so the ceiling is about what a browser tab can hold in memory
  at once (the source file, its decoded frames, and the output buffer all
  live in the tab's heap simultaneously; wasm32 linear memory tops out at
  4 GB and real browsers get unstable well before that under memory
  pressure from other tabs). 2 GB is a conservative, tested-safe line for a
  single-tab conversion, not a hard technical ceiling — it can be revisited
  if evidence says otherwise.
- Concurrency: one job at a time per file row, each in its own Web Worker.
  Multiple files in a batch each get their own worker and run in true
  parallel, bounded only by the browser's own device-memory/CPU limits.
- No wall-clock timeout: there is no shared server resource a wedged job
  could starve. `cancel()` on a `JobHandle` terminates the worker outright,
  which is the only correct way to stop wasm code that ignores cooperative
  cancellation.

## 5. Engine — per-operation

One entry point, `submitEngineJob()` in `apps/converter/lib/engine/index.ts`,
routes to one of two workers by output kind:

```ts
type EngineRequest =
  | { op: 'convert'; file: File; to: string; options: ConvertOptions }
  | { op: 'compress'; file: File; to?: string; target?: number; preset?: CompressPreset; options: ConvertOptions }
  | { op: 'gif'; file: File; fps: number; width: number; options: Partial<Omit<GifOptions, 'fps' | 'width'>> }
  | { op: 'image'; file: File; to: string; resize?: { width: number; height: number }; quality?: number; options: ImageOptions };

function submitEngineJob(req: EngineRequest): JobHandle;

type JobHandle = {
  id: string;
  promise: Promise<{ url: string; size: number }>;   // resolves 'done', rejects on error/cancel
  onProgress(cb: (frame: ProgressFrame) => void): () => void;
  cancel(): void;
};
```

### Progress frames (`JobHandle.onProgress`)

Same shape the old SSE stream used, so the UI layer barely changed:

```
{ status: 'running', pct: 12, fps: 48, eta: 31 }
{ status: 'done', url: 'blob:http://localhost:4400/…', size: 8412934 }
{ status: 'error', message: '…', stderr: '…' }
{ status: 'cancelled' }
```

`url` is a `URL.createObjectURL()` blob URL, valid only for the lifetime of
the tab. It is never persisted; a page reload loses it, same as the
converted bytes it points to.

### Job identity

`id` is `cv_<counter><timestamp-base36>` — a client-side sequence number,
not a server-issued id. There is no `Job` object to fetch by id and no
`GET /v1/jobs/:id` equivalent: the `JobHandle` returned by `submitEngineJob`
is the only handle you get, and `onProgress`/`cancel` are called on it
directly rather than looked up later.

## 6. Execution

- **ffmpeg.wasm** (`@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/core` 0.12.10, single
  build for all video/audio/GIF operations) — spawned in its own Web Worker
  (`lib/engine/workers/ffmpeg.worker.ts`), which also hosts `@ffmpeg/ffmpeg`'s
  own internal worker for the core itself.
  - **Single-threaded core, deliberately** (`@ffmpeg/core`, not
    `@ffmpeg/core-mt`). The multithreaded build deadlocked mid-encode in
    testing on every input tried, including a plain h264-to-h264 pass with
    no filters — a known category of failure for pthread/Atomics-based wasm
    threading under sandboxed or virtualized browser environments. The
    single-threaded core encoded a 2-second 320×240 clip in under 4 seconds
    and never hung. COOP/COEP headers (§8) stay on regardless, since they
    cost nothing unused and are exactly what `-mt` would need if revisited.
- **jsquash** (`@jsquash/jpeg`, `@jsquash/png`, `@jsquash/webp`,
  `@jsquash/avif`, `@jsquash/resize`) — still-image decode/encode/resize, in
  a separate Web Worker (`lib/engine/workers/image.worker.ts`). Each codec is
  a Rust/C wasm module wrapped by Google's jSquash project; `resize` is
  Squoosh's own lanczos3 resizer.
- **utif2** — TIFF decode/encode. Pure JS, no wasm.
- **libheif-js** (`wasm-bundle` variant) — HEIC/HEIF **decode only**. See §7
  for why encode is absent.
- No `sharp`/libvips anywhere; that was a Node native binding and cannot run
  in a browser tab.

### Worker bundling (why it needs its own build step)

`scripts/build-workers.mjs` bundles `lib/engine/workers/*.worker.ts` with
**esbuild**, entirely outside Next's own webpack/RSC pipeline, into
`public/workers/*.js`, and copies every `.wasm` binary the jsquash/libheif-js
Emscripten modules load at runtime (via `locateFile`, resolved relative to
the worker script's own URL) alongside them. Run via `predev`/`prebuild` npm
scripts, so `next dev`/`next build` always see fresh bundles.

This exists because two more obvious approaches both broke Next 15's
client-reference-manifest plugin once the worker's dependency graph reached
`libheif-js` and jsquash's lazy wasm loaders:

1. **`worker-loader`** (a webpack loader made for exactly this) crashed
   Next's RSC manifest generation outright (`InvariantError: Expected
   clientReferenceManifest to be defined`), even with the loader scoped to
   client-only compilation via `isServer` in `next.config.ts`'s `webpack()`
   hook.
2. **Webpack 5's native `new Worker(new URL('./worker.ts', import.meta.url))`
   syntax** is never wired up by Next's own webpack config at all — it
   served the worker as raw, unbundled TypeScript source with unresolved
   bare specifiers (`import decodeJpeg from '@jsquash/jpeg/decode'` shipped
   verbatim to the browser, which cannot resolve a bare npm specifier at
   runtime).

A plain esbuild pass run before Next ever starts sidesteps both: Next's
compiler never sees the worker files or their dependency graph, because the
page only ever references the *already-built* `/workers/*.js` string paths
at runtime, and `ConverterPanel` itself is loaded via
`next/dynamic(..., { ssr: false })` (through a small client-component
wrapper, `converter-panel-loader.tsx`, since `ssr: false` cannot be passed
from a Server Component directly) so the server compiler never touches the
panel's import graph at all.

## 7. Known format-coverage gaps

Two formats are deliberately **not offered as an output target**, found and
confirmed during this rearchitecture rather than silently dropped:

- **HEIC/HEIF encode.** `libheif-js`'s open-source wasm build only decodes.
  Real HEIC/HEIF *encoding* needs an HEVC encoder, which is
  patent-encumbered and absent from every open wasm codec build — the same
  reason browsers don't natively encode HEIC. (The old server-side `sharp`
  path was never really encoding HEIC either: `heif({ compression: 'av1' })`
  produces AVIF bytes in an HEIF container, not real HEVC HEIC.) HEIC/HEIF
  remains a fully supported **input**: converting *from* HEIC to anything
  else works normally.
- **WebM/VP9 encode.** `@ffmpeg/core`'s `libvpx-vp9` encoder hangs
  indefinitely after encoding exactly one frame, confirmed on every input
  tried, with and without `-row-mt`. This reproduced consistently enough
  (never completing, never erroring, just parked) that it reads as a real
  limitation of this wasm core build rather than a flaky test. Decoding a
  WebM **input** is unaffected — only the VP9 encode path hangs — so WebM
  stays a valid source format, just not a target. `defaultTarget()` no
  longer proposes WebM for an mp4 input; it proposes `mov` instead, which
  shares the same libx264 path already proven to work.

Every other operation the old server exposed — h264/mp4/mov/mkv/avi video,
mp3/wav/m4a/aac/flac/ogg audio, GIF export and GIF-from-video, jpg/png/webp/
avif/tiff stills, all trim/crop/resize/rotate/flip/quality/target-size
options — is confirmed working end to end via the Playwright suite (§11),
including a real conversion, not just a UI check.

## 8. Browser requirements

`next.config.ts` sets three headers on every response, required for the
workers and their wasm modules to load at all:

```ts
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    ],
  }];
},
```

COOP/COEP together enable cross-origin isolation, which `SharedArrayBuffer`
requires (kept for future multithreading even though the shipped core is
single-threaded — see §6). COEP's `require-corp` additionally requires
**every** subresource, including same-origin worker chunks, to carry a CORP
header, or the browser blocks the load outright with no useful error — this
is what the third header is for, and its absence was the first of several
worker-loading failures found during the rearchitecture.

`serverExternalPackages: ['libheif-js']` in `next.config.ts` keeps the
package's `require()`-based wasm loader out of Next's server (Node.js)
compilation pass, which cannot resolve it and would otherwise corrupt the
page's RSC manifest even though the package is only ever reached from a
Web Worker.

## 9. Frontend surface

```
/                       marketing page
/convert                the converter
/convert/[pair]         generated from lib/formats.ts manifest
/tools, /compress       category pages
/history                localStorage job history
/settings               sound toggle, provider credits
```

Nav: slim top bar (Convert · Compress · Tools), ⌘K command palette over every
tool. **No mega-menus. No pricing.** The `/api-docs` page and its API
quickstart component are deleted along with the HTTP API they documented —
shipping curl examples against a server that no longer exists would be
actively misleading.

### Marketing homepage

Hero is a **live mini-converter** — drop a file, it animates, and carries the
file into `/convert`. Below: format coverage grid · a "your file never
leaves this tab" section (replacing the old API-over-HTTP section, which no
longer applies) · how it works (3 steps).

### Converter panel

Single centered panel, progressive disclosure. Dropzone → file rows →
settings → convert. All of the following is a UI/UX decision independent of
where execution happens, and is unchanged from before the rearchitecture:

- **Dropzone drag state**: dashed `--p-line-2` → solid `#2f6fe4`, panel lifts
  4px, bg → `--p-blue-soft`, 180ms. Files fade-up on drop, 60ms stagger.
- **Format picker**: pill row of likely targets + `More ▾` searchable
  popover (listbox, type-ahead). Targets are read from
  `lib/formats.ts`'s `OUTPUT_TARGETS`, which mirrors
  `lib/engine/formats.ts`'s enum and excludes HEIC and WebM per §7 — the
  picker can never offer a format the engine will reject or hang on.
- **Compression**: preset pills (Email · Discord · Web · Archive) + target-size
  field, both feeding a live estimate.
- **Sliders**: pill track 6px `--p-code`, blue fill, 16px white thumb with card
  shadow, mono value bubble on drag.
- **Editing** (trim, crop, resize, rotate, flip): inline in the row's expanded
  settings. One ffmpeg.wasm invocation, not separate tools.
- **Batch**: one shared setting, per-file override marked `custom`. Each file
  in a batch runs in its own Web Worker, genuinely in parallel.
- **Queue**: inline rows, `.stripe-bar` fill, pct + ETA + cancel. Cancel calls
  `JobHandle.cancel()`, which terminates the worker outright — the only
  correct way to stop wasm code, which does not cooperate with abort
  signals.
- **Done**: bar fills, holds, 220ms crossfade to a Download pill showing new
  size and delta. The download is a plain `<a href="blob:...">` — no
  network request happens when you click it.
- **Error**: row error state, plain-language sentence, `Retry` / `Remove`,
  plus a **log section** holding raw ffmpeg stderr (or, for image jobs, the
  wasm codec's error message).
- **Empty state**: dropzone + accepted kinds + "up to 2 GB" + a line stating
  the file never leaves the tab (not a retention line — there is nothing to
  retain).
- **Presets**: user-saved to `localStorage`, shown as pills beside built-ins.

### Button motion — layered by role, never simultaneous

| State | Motion |
|---|---|
| any button | hover ↑2px + tonal bg, press scale .98, blue focus ring, 150–200ms ease-out |
| primary, idle | gradient sheen sweeps L→R 2.4s, every 5s |
| primary, queued | breathing ring, 3s |
| primary, running | fill as progress + travelling stripes |
| primary, done | settle → Download |

All pills fully rounded. `prefers-reduced-motion` stops every one of them.

### Notifications + audio

- **Notification** per completed job; a batch collapses to one batch-complete
  notification. Permission requested on first conversion, never on load.
  Click focuses the tab and scrolls to the row.
- **Web Audio**: synthesized chimes (success 440→660Hz sine 180ms; error 220Hz
  triangle 260ms), muted until opt-in, toggle persisted. Waveform preview via
  `decodeAudioData` on audio rows. A/B preview playback of source vs output
  with an `AnalyserNode` level meter — both source and output are blob URLs
  now, always same-origin, so the old cross-origin `crossOrigin="anonymous"`
  handling on the media elements is gone; it never applies anymore.

### localStorage keys

```
converter:jobs      [{id,from,to,status,url,size,expiresAt}]
converter:presets   user-saved settings
converter:theme     'light' | 'dark'
converter:sound     boolean
```

Job history and settings only, same as before. `url` on a stored job is
always `null` now — the actual blob URL is session-lifetime, so persisting
it as if durable would be misleading; the `/history` page is a record of
what ran, not a place to re-download from. **Files are never persisted
client-side**, and now the *output* isn't either, past the tab's own
lifetime.

## 10. Accessibility

- Full keyboard operation: dropzone is a focusable control, sliders take
  arrow/shift-arrow, format popover is a listbox with type-ahead and Esc
  restores focus.
- `aria-live` on job status; progress bars carry `role`/`aria-valuenow`.
- WCAG AA contrast, 44px minimum touch targets.
- `prefers-reduced-motion` honoured, including JS-driven animation.

## 11. Testing

- **Unit tests** (`lib/engine/__tests__/*.test.ts`, vitest): format-enum
  validation (closed set, HEIC/WebM correctly excluded from outputs),
  numeric-range validation on every option (crf 0–51, quality 1–100, fps,
  dimensions, trim ordering) — the same bar the old server-side security
  section demanded, adapted from injection-prevention (a shell never sees
  these values now) to crash/hang-prevention (a malformed value can still
  wedge or crash the wasm module or spin a worker forever). Argv-construction
  tests confirm ffmpeg.wasm's `exec()` args are built correctly and that the
  GIF two-pass render step produces a plain `string[]`, never a function —
  `postMessage` cannot structured-clone a closure, which was a real bug
  caught here before it shipped.
- **Playwright E2E** (`e2e/convert.spec.ts`): drops a real file and asserts
  the download affordance appears — a genuine ffmpeg.wasm video conversion
  and a genuine jsquash image conversion, not a mocked network call, plus
  navigation, keyboard operation, and the settings page's provider marks.
  Needs real internet access on first run (ffmpeg-core's wasm binary is
  fetched from unpkg.com and cached as a blob URL for the worker's
  lifetime); confirmed runnable and passing (9/9) with a real Chromium
  instance in this environment.
