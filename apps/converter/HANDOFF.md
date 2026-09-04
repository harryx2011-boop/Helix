# Converter API — state of the build

ffmpeg-based file converter in the Helix monorepo. Next frontend on **4400**,
Fastify API on **8400**. Spec of record: `CONVERTER-CONTRACT.md` at the repo
root, derived from 40 scoping answers.

## Status: v1 working end to end

| | |
|---|---|
| Backend tests | 74 passing (27 unit, 8 ffmpeg, 12 image, 16 HTTP, 11 auth) |
| Frontend E2E | 11 passing (Playwright, real browser against real API) |
| Typecheck + lint | clean, both apps |
| Endpoints | all 9 operations verified end to end, outputs opened and checked |
| Verified by hand | curl per endpoint, browser round trip, light + dark, motion states |

## Run it

```bash
# API — needs ffmpeg + ffprobe on PATH
cd apps/converter-api && npm install && npm run dev     # :8400

# Frontend
cd apps/converter && npm install && npm run dev         # :4400
```

`apps/converter/.env.local` sets `NEXT_PUBLIC_CONVERTER_MOCK=false` and points
at `http://localhost:8400`. Set `MOCK=true` to run the UI with no backend.

```bash
cd apps/converter-api && npm test      # vitest
cd apps/converter && npm run e2e       # playwright, needs both servers up
```

## What exists

**Backend** (`apps/converter-api/src/`)

- `ffmpeg/formats.ts` — format enums, ffprobe container-set mapping
- `ffmpeg/options.ts` — zod schemas; every option is an enum or a bounded number
- `ffmpeg/args.ts` — the only place an argv is built
- `ffmpeg/run.ts` — spawn, progress parsing, plain-language error mapping
- `ffmpeg/image.ts` — sharp/libvips path for stills
- `jobs/manager.ts`, `jobs/queue.ts` — job lifecycle, concurrency = cores − 1
- `routes/jobs.ts` — the four endpoints, SSE, download
- `storage/temp.ts` — temp dirs, 1 hour retention, 5-minute sweeper

**Frontend** (`apps/converter/`)

- Persona's design tokens verbatim, plus `--p-on-blue` for AA contrast on the
  dark-mode blue
- `components/ui/pill-button.tsx` — pill buttons; motion layered by role
  (hover/press always · idle sheen on the one primary CTA · breathing ring while
  queued · fill-as-progress while running · settle on done), never two at once
- `components/converter/*` — dropzone, panel, rows, format picker, compression
  controls, progress, error log, waveform + A/B preview
- `lib/formats.ts` — 69 pairs (63 conversions + 6 compressors) generating every
  `/convert/[pair]` route, the format grid, and the ⌘K palette
- Header and footer live in `app/layout.tsx`, so placement is identical on every
  page

## Bugs found and fixed during the build

1. **ffprobe container sets.** `format_name` is a comma list (`mov,mp4,m4a,…`);
   taking the first match read every MP4 as a MOV and would have rejected valid
   uploads. Now a `Set<Format>`, and the extension claim is tested for
   membership.
2. **Multipart field ordering.** `file.fields` only holds fields parsed *before*
   the file part, and curl sends the file first, so every real client got
   `to: Required`. Hand-built test bodies put fields first and hid it. Now walks
   every part.
3. **CORS on the SSE stream.** The handler writes to `reply.raw`, bypassing the
   CORS plugin's hook, so browser conversions hung at 0% while curl was fine.
   Headers are now carried over explicitly.
4. **Infinite render loop on `/history`.** `loadJobs()` called `write()` during a
   `useSyncExternalStore` snapshot read, dispatching an event that triggered
   another read; the unstable array identity compounded it. Snapshots are cached
   and invalidated on write; the expiry prune no longer writes during a read.
5. **Entrypoint guard.** `import.meta.url.includes('index')` was true on any
   import, so importing the module started a listener.
6. **Malformed options JSON** returned 500 instead of 400.
7. **`/convert` had no header or footer** — the only page missing them. Chrome
   hoisted into the layout.
8. **Downloads pointed at the frontend.** Two different `API_BASE` constants
   read two different env vars, and the SSE frame's relative `url` was stored
   raw, so every download and A/B preview 404'd against :4400. One constant now,
   resolved through `downloadUrl()`.
9. **The running-state stripes never animated.** `@keyframes stripes` and
   `shimmer` lived only in the Tailwind config, and Tailwind emits a keyframe
   only when its `animate-*` utility appears in content — nothing used them. The
   progress fill was a static stripe pattern. Moved into `globals.css`.
10. **The busy primary button was `disabled`**, rendering the progress fill at
   50% opacity under a not-allowed cursor. It is `aria-busy` now, so it keeps
   full contrast and stays focusable for the label change.
11. **Image rotation silently did nothing.** `sharp().rotate()` was called
   twice; the second call is ignored, so the EXIF auto-orient won and the user's
   angle was dropped.
12. **HEIC output threw.** libvips needs an explicit codec; without
   `compression: 'av1'` sharp raises "Expected one of: av1, hevc". HEIC was the
   reason sharp was chosen and had never been converted until now.
13. **The picker offered 8 formats the API rejects** (`opus`, `aiff`, `wma`,
   `bmp`, `mpg`, `ts`, `3gp`, `m4v`) — each a guaranteed 400. Targets now derive
   from one list mirroring the server enums.
14. **The key badge had no accessible name** — only a `title` — and the first
   fix leaked the full key into `aria-label`. It is masked in both.

## Decisions from the 40 answers

- Server-side ffmpeg, not WASM. localStorage holds **job history and settings
  only** — files are never persisted client-side.
- Account required for everything. **No pricing, no billing, local only.**
- 5 GB cap. Jobs still carry a wall-clock timeout so a wedged ffmpeg cannot hold
  a queue slot forever.
- Per-operation endpoints (`/v1/convert`, `/compress`, `/gif`, `/image`).
- Single multipart POST up, SSE down, in-process queue, temp dir + 1h GC.
- Notification per completed job; a batch collapses to one.
- Web Audio: synthesized chimes (opt-in), waveform preview, A/B playback.

## Contract changes made during the build

- `convert` accepts `options.targetBytes`, so a format change and a size target
  can be requested together (the panel needed this and had no endpoint for it).
- `publicJob` exposes `name`, so `/history` can show the filename rather than
  only `mp4 → mp3`.

## Auth

Helix has **no session layer** — it authenticates with `helix-` bearer keys
only. So the browser holds a key the same way an API client does: entered on
`/settings` or the sign-in panel, kept in `localStorage` under `converter:key`,
sent as a header on XHR and fetch. `EventSource` and plain download links
cannot set headers, so those two URLs alone carry `?key=` — same origin,
naming a job the key already owns.

- On by default. `CONVERT_AUTH=off` opens it for local use, and `/health`
  reports which mode is live so the UI can say so.
- Keys are verified against the same `api_keys` table the rest of Helix writes,
  matched on a SHA-256 hash. Unknown and revoked are indistinguishable (401);
  an unreachable database is 503, not 401.
- **Jobs are owned.** Every read, cancel and download checks `ownerId`, and a
  mismatch is 404 rather than 403 — existence is not disclosed.

## Settings and providers

`/settings` carries the key field, live service state read from `/health`, the
sound switch, and what actually runs a conversion. Each provider wears its
**real mark** from `public/providers/`, never a monogram: FFmpeg, sharp,
libvips, Helix, PostgreSQL, Vercel. Marks were fetched, opened and compared by
eye — the favicon service returned a generic globe for the Helix domain, so
that one uses the project's own `logo.svg` instead. A test asserts all six load
and that no two share a file.

The app's own icon (`app/icon.png`) is the Helix glyph rendered from that SVG.

## Not done

- The `/settings` page is read-only about the service; it cannot change
  server-side configuration. Helix's own `/settings` registry pattern would be
  the way to do that.
- sharp installs with `--ignore-scripts` in some flows; run `npm rebuild sharp`
  if the image path throws.
- Design review left three open items, all judgement calls: two primary-button
  languages (marketing uses ink-black pills, the app uses the blue PillButton),
  two type scales (arbitrary px in marketing, Tailwind rungs in the converter),
  and `body { min-height: 100vh }` which should be `100dvh`.
