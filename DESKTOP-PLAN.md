# Helix desktop plan

**Date:** 2026-09-25 · **Status:** Phases 0–1 done, Phases 2–7 planned. Decisions D1–D4 made.

Helix becomes a Windows desktop app. It keeps the core `/app` UI plus the API, extract and fetch services. It drops the marketing site, needs no external database, and opens no console windows.

| Phase | Work | State |
|---|---|---|
| 0 | No visible console windows | Done 2026-09-25 |
| 1 | Vulcan moves out to `D:\vulcan-scratchpad` | Done 2026-09-25 |
| 2 | Marketing and docs removed | Planned (D2) |
| 3 | No external database | Planned (D1) |
| 4 | API serves the UI and builds to plain JS | Planned |
| 5 | Extract as one windowless exe | Planned (D3) |
| 6 | `apps/desktop` Electron shell | Planned |
| 7 | Installer and release | Planned (D4) |

Order: the database goes before Electron, because the desktop app cannot ship a Postgres server.

## Phase 0: console windows (done)

**Cause.** Nothing in this repo spawns Python. `~/.claude/hooks/helix-ensure.js` started each service detached. A detached process has no console, so when it started a second console program, Windows gave that program a new, visible console. Three services did this:

- `.venv\Scripts\python.exe` is a venv redirector that starts the real interpreter.
- The tsx CLI starts a second `node.exe`.
- `pg_ctl` runs `cmd.exe /C postgres.exe`.

`helix-fetch.exe` starts nothing, so it never had a window. `windowsHide` could not help: libuv adds `CREATE_NO_WINDOW` only when no stdio slot is a file, and Windows ignores that flag alongside `DETACHED_PROCESS` anyway.

**Fix.**

- Extract now runs under `pythonw.exe`.
- The API runs as a single `node --import tsx src/index.ts` process.
- `pg_ctl` now runs attached, with every stdio slot ignored and `-l <log>`. Postgres and its backends inherit the windowless console, and outlive `pg_ctl` because libuv's job lets grandchildren break away.

**Evidence.** A throwaway stack (Postgres 7499, extract 7412, API 7410 against a fresh cluster) was launched this way:

- 19 processes, 0 with a visible window.
- Both health checks returned 200.
- The API ran its migrations.
- Services outlived the launcher.
- Logs still reached their files.

**The rule for every later phase:** spawn the real program directly. Never go through a launcher that starts another console program.

## Phase 1: Vulcan leaves Helix

Vulcan is now a standalone Next.js app at `D:\vulcan-scratchpad`: port 4700, 26 tests, verified live against `~/.claude/projects` (2,265 files, 94,569 requests), local commit `eb63c2d`. Deleted from Helix:

- `app/(app)/app/vulcan/`, `app/api/vulcan/summary`, `lib/vulcan/`, `components/vulcan/`
- the `[data-surface='vulcan']` block in `globals.css`
- the sidebar row and the `localTools` plumbing through `AppShell`/`Sidebar`/`CommandPalette`
- the palette entry and `VULCAN-CONTRACT.md`

## Phase 2: remove marketing and docs

**Move first.** These are core tools that sit in `(marketing)` only by folder:

- `(marketing)/convert/*` and `(marketing)/checks/*` move into the app shell.
- Shared pieces move out of `components/marketing/` into a neutral folder: `ambient`, `ascii-fields`, `ascii-fluid`, `animated-code`, `segmented`, `icon-type`, `status/history-bars`, `status/status-data`, `checks/*`. Eleven core files import them today.

**Then delete:**

- The landing page and the 14 capability pages.
- `docs/`, `architecture`, `self-host`, `status`, `privacy`, `terms` and `canvas/*`.
- The rest of `components/marketing/`, plus `lib/github-stars.ts`, `lib/canvas.ts` and `lib/canvas-skills.ts`.
- The docs-driven handlers: `llms.txt`, `md/[[...slug]]`, `search-index.json`, `agent-onboarding/SKILL.md`, and `lib/docs-content.ts`.
- Removing the docs means also removing the command palette's doc search (`command-palette/doc-index.ts`), its "Open docs" action, and the `/docs` links in `top-bar.tsx`. The palette fails at runtime, not at build, if one is missed.

**Keep:** `lib/codegen.ts`, `lib/mcp-tool-names.ts`, `lib/setup-prompt.ts`, `lib/status.ts`, `lib/catalog.ts`, `lib/api.ts`.

**Route `/` to `/app`.** A static export does not run `redirects()`, so this needs a client-side page.

**Consequence:** `helixapi-dev.vercel.app` loses its site. Whether hosted mode (Clerk, Supabase, onboarding, `app/api/**`, `HELIX_MULTI_TENANT`) goes with it is D2.

**Left alone:** `research/firecrawl-capture/` has uncommitted edits from another session. `WEBSITE.md` §2–§5 get marked retired rather than deleted.

## Phase 3: no external database

**Recommended: PGlite**, a WASM Postgres running inside the API process, with its data in a folder.

- It keeps all ~100 query sites, the 12 migrations, the `FOR UPDATE SKIP LOCKED` job queue, and the test fakes that match on SQL text.
- `uuid-ossp` and pgvector ship as PGlite extensions.

**The seam.** `db/pool.ts` becomes a driver registry (`HELIX_DB=pglite|pg`). PGlite sits behind the same `query`/`connect`/`transaction` shape, and a mutex serialises `connect()`, because PGlite has a single connection. `DATABASE_URL` becomes optional, and the Postgres start leaves `helix-ensure.js`.

**Spike before committing.** Check each of these:

- The worker's claims and request traffic serialising on one connection.
- `migrate.ts` running on PGlite.
- A 500-page crawl's speed.
- pgvector loading.

**Alternative: SQLite repositories.** This follows the `MonitorStore` pattern: 21 files and ~100 query sites translated off Postgres-isms (`$N`, `::uuid`, `= ANY`, `text[]`, `jsonb`, enums, `FILTER`, `percentile_cont`), and ~20 SQL-matching tests rewritten. It is roughly a week of rewriting with no gain the user can see over PGlite.

**Also in this phase:** a results sweeper. Nothing deletes `jobs` or `documents` today, despite `expires_at`.

## Phase 4: the API serves the UI and builds to JS

- `@fastify/static` serves the dashboard's `out/`, with an SPA fallback that excludes `/v1`, `/settings`, `/internal` and `/mcp`. The UI and API then share an origin: `resolveBaseUrl` already uses `origin + /v1` off port 3400, and CORS stops mattering.
- `next.config.ts:8` already claims Fastify serves the export. It does not, yet.
- esbuild bundles `apps/api` to one JS file, so Electron's own Node runs it without tsx.

## Phase 5: extract as one windowless exe

- PyInstaller, `--noconsole`, one-folder build of `helix_extract`.
- `sentence-transformers` (with torch, over 1 GB) is a hard dependency today. Making local embeddings a lazy, optional import keeps the installer small (D3).

## Phase 6: `apps/desktop`

**Supervision.** Electron's main process supervises three children, each spawned directly with `windowsHide`:

- the API (`process.execPath` with `ELECTRON_RUN_AS_NODE=1`)
- the extract exe
- `helix-fetch.exe`

It health-polls before opening the window, shows a splash with a status line, restarts a crashed child, and takes every child down on quit.

**Keys.** First run generates the bootstrap key and admin token, stores them with `safeStorage`, and hands them to the renderer through preload, so `ApiKeyGate` never asks.

**Window.** It loads `http://127.0.0.1:<port>/app`, never `file://`.

**Ports.** The app uses its own block (8400–8402, registered in `reference/ports.md` when built), so it never collides with the dev stack on 7400–7402.

**Bundled assets.** Playwright's Chromium headless shell ships in `extraResources`. The ffmpeg.wasm core is vendored, so `/convert` works offline.

## Phase 7: installer

- NSIS, with `artifactName: Helix-Setup-${version}.${ext}`.
- The version follows the product line.
- Where releases publish is D4.

## Decisions

Decided by Harry 2026-09-25.

| # | Question | Decision |
|---|---|---|
| D1 | Database approach | **PGlite**, spike first |
| D2 | Hosted mode (Clerk, Supabase, multi-tenant, Vercel deploy) | **Delete.** The desktop app is single-user. Postgres stays only as long as the PGlite spike needs a comparison. |
| D3 | Local embeddings in the installer | **Fetched on demand.** The installer ships without torch; the app downloads the embeddings runtime when first needed. |
| D4 | Release channel | **A `helix-releases` repo with autoupdate** (check `gh release list` before choosing the first version) |

**Later:** whether the desktop app replaces the hook-launched stack as Claude Code's web layer (the `helix` MCP entry on 7400).
