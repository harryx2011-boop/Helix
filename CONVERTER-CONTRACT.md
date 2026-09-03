# Converter API — build contract

Frozen interface between `apps/converter` (Next, :4400) and `apps/converter-api`
(Fastify, :8400). Both halves build against this simultaneously. Any change here
is a conversation, not a commit.

## 1. Identity

- Product name: **Converter API**. Part of Helix.
- Design system: **identical to Persona** — copy `apps/persona/tailwind.config.ts`
  and `app/globals.css` verbatim. Inter + JetBrains Mono, `--p-*` tokens,
  radii pill/card 10px/panel 14px, `cubic-bezier(0,0,0.2,1)`, 150–240ms.
  Light default, `.dark` toggle persisted to localStorage.
- Blue `#2f6fe4` is for actions only.

## 2. Ports

| Service | Port |
|---|---|
| Next frontend | 4400 |
| Fastify API | 8400 |
| Postgres (existing Helix) | 7432 |

## 3. Auth

Account required for **everything** — no anonymous conversion. Reuses Helix
auth. API consumers send `Authorization: Bearer hx_…`. No pricing, no billing,
no tiers anywhere in the product. Local deployment only.

## 4. Limits

- Max file: **5 GB**
- Concurrency: `os.cpus().length - 1` in-process queue
- Wall-clock timeout per job (prevents a wedged ffmpeg holding a slot)

## 5. Endpoints — per-operation

All accept `multipart/form-data`, single POST, streamed to disk.
All return `202 { id, status: "queued" }`.

```
POST /v1/convert    file, to,     options{}
POST /v1/compress   file, target|preset, options{}
POST /v1/gif        file, fps, width, options{}
POST /v1/image      file, to, resize, quality, options{}

GET  /v1/jobs/:id            → job state
GET  /v1/jobs/:id/events     → SSE progress stream
GET  /v1/jobs/:id/download   → output file
DELETE /v1/jobs/:id          → cancel + unlink
```

### SSE frames (`/v1/jobs/:id/events`)

```
data {"pct":12,"fps":48,"eta":31,"status":"running"}
data {"status":"done","url":"/v1/jobs/cv_8f2/download","size":8412934}
data {"status":"error","message":"…","stderr":"…"}
```

### Job object

```ts
type Job = {
  id: string            // cv_<nanoid>
  op: 'convert' | 'compress' | 'gif' | 'image'
  from: string; to: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  pct: number; eta: number | null
  inSize: number; outSize: number | null
  error: { message: string; stderr: string } | null
  createdAt: number; expiresAt: number   // +1h
}
```

## 6. Execution

- **ffmpeg** — video, audio, GIF.
- **sharp** (libvips) — still images: heic, jpg, png, webp, avif, tiff,
  resize/rotate/flip/quality.
- In-process queue, concurrency capped. No Redis.

### Security (non-negotiable)

- `spawn()` with an argv **array**. Never a shell string. No user value is ever
  interpolated into an argument.
- Every option validated before it reaches ffmpeg: `format` as a real enum over
  known formats, numerics range-checked (`crf` 0–51 etc). Filenames are
  server-generated UUIDs — the client's filename is display metadata only.
- Content type sniffed via ffprobe/magic bytes; reject on mismatch with the
  claimed extension.
- `-protocol_whitelist file` only. No concat/subfile. ffmpeg can never fetch a
  URL or read an arbitrary path.

## 7. Storage

`/var/tmp/helix-convert/<jobId>/` — input unlinked on success, output deleted at
T+1h, sweeper every 5 min. UI states retention plainly.

## 8. Frontend surface

```
/                       marketing page
/convert                the converter
/convert/[pair]         generated from lib/formats.ts manifest
/tools, /compress       category pages
/api                    docs (per-operation pages over these routes)
/history                localStorage job history
```

Nav: slim top bar (Convert · Compress · Tools · API), ⌘K command palette over
every tool. **No mega-menus. No pricing.**

### Marketing homepage

Hero is a **live mini-converter** — drop a file, it animates, and carries the
file into `/convert`. Below: format coverage grid · API quickstart with
curl/Node/Python tabs · how it works (3 steps).

### Converter panel

Single centered panel, progressive disclosure. Dropzone → file rows →
settings → convert.

- **Dropzone drag state**: dashed `--p-line-2` → solid `#2f6fe4`, panel lifts
  4px, bg → `--p-blue-soft`, 180ms. Files fade-up on drop, 60ms stagger.
- **Format picker**: pill row of likely targets + `More ▾` searchable popover
  (listbox, type-ahead).
- **Compression**: preset pills (Email · Discord · Web · Archive) + target-size
  field, both feeding a live estimate.
- **Sliders**: pill track 6px `--p-code`, blue fill, 16px white thumb with card
  shadow, mono value bubble on drag.
- **Editing** (trim, crop, resize, rotate, flip): inline in the row's expanded
  settings. One ffmpeg invocation, not separate tools.
- **Batch**: one shared setting, per-file override marked `custom`.
- **Queue**: inline rows, `.stripe-bar` fill, pct + ETA + cancel.
- **Done**: bar fills, holds, 220ms crossfade to a Download pill showing new
  size and delta.
- **Error**: row error state, plain-language sentence, `Retry` / `Remove`, plus
  a **log section** holding raw ffmpeg stderr.
- **Empty state**: dropzone + accepted kinds + "up to 5 GB" + retention line.
  No suggestion pills.
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
  with an `AnalyserNode` level meter.

### localStorage keys

```
converter:jobs      [{id,from,to,status,url,size,expiresAt}]
converter:presets   user-saved settings
converter:theme     'light' | 'dark'
converter:sound     boolean
```

Job history and settings only. **Files are never persisted client-side.**

## 9. Accessibility

- Full keyboard operation: dropzone is a focusable control, sliders take
  arrow/shift-arrow, format popover is a listbox with type-ahead and Esc
  restores focus.
- `aria-live` on job status; progress bars carry `role`/`aria-valuenow`.
- WCAG AA contrast, 44px minimum touch targets.
- `prefers-reduced-motion` honoured, including JS-driven animation.

## 10. Testing

Integration tests converting real fixtures, asserting output with ffprobe.
Unit tests on argument construction (injection, enums, ranges). Playwright E2E:
drop a file, assert the download appears.
