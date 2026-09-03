# Converter API — state of the build

ffmpeg-based file converter in the Helix monorepo. Next frontend on **4400**,
Fastify API on **8400**. Spec of record: `CONVERTER-CONTRACT.md` at the repo
root, derived from 40 scoping answers.

## Status: v1 working end to end

| | |
|---|---|
| Backend tests | 48 passing (24 unit, 8 ffmpeg integration, 16 HTTP) |
| Frontend E2E | 6 passing (Playwright, real browser against real API) |
| Typecheck | clean, both apps |
| Verified by hand | curl for all four operations, browser round trip, light + dark |

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

## Not done

- **Helix auth is not wired.** Every endpoint is currently open; the contract
  says account-required. This is the main gap before it is usable as specified.
- Two format lists exist — `lib/formats.ts` (`ACCEPTED_EXTS`) and the picker's
  own `TARGETS`. One should own the supported set.
- No `eslint.config.mjs` for either app.
- sharp installs with `--ignore-scripts` in some flows; run `npm rebuild sharp`
  if the image path throws.
- HEIC depends on the libvips build; verify before promising it in the UI.
