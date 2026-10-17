# Helix desktop plan

**Date:** 2026-09-25 · **Status:** Phases 0–7 all done; 2.0.0 released 2026-09-26 (Phases 3–7 in one overnight session); latest installer 2.1.0 (2026-09-26, see `context.md` status line). Decisions D1–D16 made.

Helix becomes a Windows desktop app. It keeps the core `/app` UI plus the API, extract and fetch services. The public website keeps its landing page, docs and marketing, and gates the app behind the desktop download. The desktop app needs no external database and opens no console windows.

| Phase | Work | State |
|---|---|---|
| 0 | No visible console windows | Done 2026-09-25 |
| 1 | Vulcan moves out to `D:\vulcan-scratchpad` | Done 2026-09-25 |
| 2 | Website keeps marketing; the app ships only in the desktop download | Done 2026-09-25: restore, `/download`, redirect gate |
| 2b | Hosted mode removed (Clerk, Supabase, onboarding) | Done 2026-09-25 |
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

## Phase 2: the website keeps its marketing, the app leaves the web

**Corrected 2026-09-25.** Harry's intent: the landing page, docs and marketing stay exactly as they are, and the app (`/app`) exists only in the Electron download.

The first attempt (commits `8bf2d8a`, `493e927`) misread that and deleted the marketing site instead. It was undone on 2026-09-25. The marketing routes, docs, markdown twins, `llms.txt`, the search index, the palette's doc search and the top bar's Docs links are all back. The restore left out the Converter, which moved to Sparky in `6f1f7a7` (`/convert`, `POST /v1/convert` and `helix_convert` are gone), so the restored pages lost their `convert` entries and the Document page its convert operation. `components/shared/` and `components/checks/` keep their new names; the restored marketing files import from them.

**Target shape.** One Next.js app, two build targets:

| | Website (Vercel) | Desktop (Electron renderer) |
|---|---|---|
| Marketing, docs, capability pages, SKILL.md, llms.txt, md twins | Served | Not built |
| `/app` and its routes | Not built | Served, the whole product |
| Sign-in, onboarding, `app/api/**` | Removed | Not needed: first run generates the key |
| "Sign in" / "Dashboard" / "Get started" CTAs | Become "Download for Windows", pointing at the latest `helix-releases` installer | n/a |

A separate `apps/web` was declined on 2026-08-24, so this stays one app with a build-target switch, not a split.

**Checks is desktop-only** (Harry, 2026-09-25). It calls the API, and the website has no API to call. It stays in `app/(tools)` and in the app sidebar, and its website nav and footer links are removed.

**Done 2026-09-25: the website gate.**

- **The `/download` page.** It shows `lib/latest-release.ts`, which reads the latest `helix-releases` installer every ten minutes and reports "coming soon" until one exists. It also plays the animated install sequence, `InstallSequence` over `lib/install-frames.ts`: 125 ms frames, one change per frame, a terminal frame, and reduced motion shows the final frame.
- **One label, "Get the app", everywhere.** On a local or self-host build the nav shows "Open app" → `/app` instead (`NEXT_PUBLIC_HELIX_WEBSITE`). The pre-commit review (interface-review, review-animations, tastemaker, ui-anti-vibe) failed the first draft on ten findings; all ten were fixed before commit.
- **Every site link into the app now points to `/download`:** nav, hero, closing CTA, capability and docs "try it" buttons, the hero request box, footer, and Getting Started.
- **The redirect.** `next.config.ts` redirects `/app`, sign-in, sign-up, onboarding and `/checks` to `/download` (307) on the website build only. That is `VERCEL=1` or `HELIX_TARGET=web`, and hosted mode only, so local dev keeps `/app`.
- **Still to do:** the app code is still compiled into the website. Leaving it out of that build waits for Phase 2b and a working self-host build (Phase 4).

## Phase 2b: hosted mode out (D2)

With no app on the web, hosted mode (Clerk, Supabase, onboarding, `app/api/**`, `HELIX_MULTI_TENANT`) has nothing left to serve. The website becomes marketing only, and the desktop app is single-user. This phase deletes:

- the `(auth)` and onboarding routes
- `app/api/**`
- the session, profile, onboarding and hosted-key libs
- `lib/supabase/`, the Clerk stub and `middleware.ts`
- every `HOSTED` branch
- the `@clerk/nextjs` and `svix` dependencies

`supabase/` and `HELIX_MULTI_TENANT` on the API go with Phase 3.

**Done 2026-09-25.** Every item above is deleted, plus the account, usage and danger-zone settings panels, `components/shared/auth-frame.tsx` and `@supabase/supabase-js`. The `HOSTED` branches that proxied the app through `/api/app/*` are removed, so the app always calls the instance directly. `HOSTED` itself stays as the website-build flag, since `next.config.ts` redirects and the status page read it. The Clerk app, the Supabase project and their Vercel env vars are untouched; retiring them is the owner's call.

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

### Status 2026-09-25: implemented and proven live; not yet committed

**Baseline before any change:** API suite 93 files / 1360 tests passing; `tsc --noEmit` exit 0.

**After:** 97 files / 1361 tests passing; `tsc --noEmit` exit 0; eslint clean on every touched file. The count nets out as follows: 29 multi-tenant tests removed, 19 tests added (6 config, 6 driver, 5 engine, 2 sweeper), and the rest from the concurrent static-serving work.

**Spike results.** Script: `spike.mjs` in the first session's scratchpad. Rerun it by opening PGlite on a `mkdtemp` dir with `extensions: { uuid_ossp, vector }`, then applying each migration with `db.exec('BEGIN;' + sql + ';COMMIT;')`.

| Check | Result |
|---|---|
| (a) all 12 migrations, unchanged | **Pass.** 001–012 all applied with no SQL edits. |
| (b) queue claim (`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`) | **Pass.** 1000 of 1000 tasks claimed in batches of 10. |
| (c) pgvector, so `chunks` is created | **Pass.** `to_regclass('chunks')` = `chunks`. The `pg_available_extensions` guard in 001 sees `vector` once the extension is passed in. |
| (d) `transaction()` beside concurrent `query()` behind a mutex | **Pass.** Three transactions (A, B, C) and three bare queries (q1, q2, q3) were fired together. Each transaction inserts a marker, sleeps, then reads the table, and B throws. The observed order was `A:A, q1:A, B:A,B, q2:A, C:A,C, q3:A,C`: no bare query saw an uncommitted row, B's rollback left nothing behind, and nothing deadlocked (335 ms total). A bare query issued mid-transaction waited for the commit and then saw the committed row. The spike became `src/db/pglite.test.ts`. A mutation check that let `query()` skip the mutex failed both tests: the stray query read the uncommitted row before the commit. |
| (e) speed | Opening a fresh data dir (initdb) took 5.8 s. 1000 single-row parameterised inserts took 1.24 s (~1.2 ms each). The full claim loop over 1000 tasks took 0.36 s. `percentile_cont` works. |

**Driver findings, all handled in `db/drivers/pglite.ts`:**

- **pgvector is a separate package in 0.5.x:** `@electric-sql/pglite-pgvector` (0.0.9, peer `pglite` 0.5.8). `uuid_ossp` is at `@electric-sql/pglite/contrib/uuid_ossp`. Both are imported dynamically inside the driver, so the pg path never loads WASM and a bundle can externalise them.
- **Multi-statement SQL.** A parameterless call goes to `exec()` and returns its last result, so `migrate.ts` is unchanged.
- **Type parity with `pg`.** Parsers keep INT8 and NUMERIC as strings and turn BYTEA into a `Buffer`; `exec()` applies them too. `rowCount` comes from the command tag, with `affectedRows` as the fallback. This repo never calls `types.setTypeParser`, so `pg` defaults are the target.

**What landed:**

- `db/pool.ts` is a registry over `db/drivers/pg.ts` and `db/drivers/pglite.ts`. Every export keeps its name. `Pool` and `PoolClient` are now the structural interface in `db/drivers/types.ts`, which `pg.Pool` satisfies as-is. `createPool({ driver, connectionString, dataDir }, logger)` returns at once; PGlite opens on the first query.
- `config.ts`: `db` comes from `HELIX_DB`. When that is unset, the driver is `pg` if `DATABASE_URL` is set and `pglite` if not. `pg` without `DATABASE_URL` is a config error. `DATABASE_URL` is optional, and `dataDir` comes from `HELIX_DATA_DIR`, defaulting to `./data`.
- `HELIX_MULTI_TENANT` is removed, along with every `multiTenant` branch, the `JobOwner` owner clause and their tests. The SQL the single-operator path sends is byte-identical to before.
- `db/sweeper.ts` deletes expired `documents`, then expired `jobs`, every hour, and logs what it deleted. Deleting a job cascades to its tasks, failures and deliveries. A running job on a live lease is spared. It is registered in `index.ts` beside `pruneUsage`.
- `status/sampler.ts` now imports `Pool` from `db/pool.js` instead of `pg`. That one-line change was required for the typecheck.

**Live proof, 2026-09-25.** The API ran from `apps/api` with `HELIX_DB=pglite`, a fresh `HELIX_DATA_DIR`, and port 7419, via `node --import tsx src/index.ts`:

- Boot: `pglite ready`, then `migration applied` for 001 through 012, all within 466 ms of the engine opening, then `bootstrap API key registered` and listening.
- `GET /v1/health`: 200.
- `POST /v1/scrape` for `https://example.com`: 200, `success: true`, markdown `# Example Domain\n\nThis domain is for use in documentation examples…`.
- `POST /v1/crawl` (limit 1), then `GET /v1/jobs/{id}`: 200, `status: completed`. So the worker's SKIP LOCKED job claim, task leases and job lifecycle all ran on PGlite. There is no `GET /v1/jobs` list route; the plan's step named one that does not exist.
- After the process was stopped, reopening the data folder showed all 12 migrations, the job row and the API key still present.

**Found along the way, not caused by this phase:** a crawl or batch scrape of `https://example.com` finishes `completed` with 0 pages and an empty `data`. The frontier logs `rejections: { limit-reached }` after resuming its own freshly seeded tasks. The live pg-backed stack on 7400 gives the identical result for the same requests, so this is a worker bug on both engines.

**Next steps, in order:**

1. ~~Bump versions to 1.25.0 and update the docs.~~ Superseded by D9: the desktop release is 2.0.0. `DEPLOY.md`'s header now says the flag is gone (the doc is history); `TODO.md`'s hosting item is dropped.
2. Take the Postgres start out of `helix-ensure.js`, once the desktop build defaults to PGlite.
3. Fix the zero-page crawl/batch bug above.
4. Time a 500-page crawl on PGlite (spike item 3, not yet measured).

## Phase 4: the API serves the UI and builds to JS

**Resolved 2026-09-25: the self-host build compiles.** The cause was `pageExtensions: ['tsx']` on the self-host build. The same tree fails with it and exits 0 with `['tsx', 'ts']`, and the static export writes every `/app` page. Both builds now use the pair. Original finding:

**Blocker found 2026-09-25: the self-host build does not compile, and did not before Phase 2 either.** Symptoms with `HELIX_HOSTED=0`:

- `next build` fails with `Can't resolve private-next-app-dir/(app)/app/<page>/page` on five `(app)/app` pages.
- `next dev` fails the same way on every page.

It is reproduced on a clean worktree of `799f954`, and in a fresh `NEXT_DIST_DIR`, so it is neither Phase 2 nor a stale cache. Hosted mode builds and serves normally. The suspects are the self-host-only settings in `next.config.ts`: `pageExtensions: ['tsx']` and the `webpack()` override that aliases Clerk and disables the dev cache. Phase 2b removes the Clerk alias outright, so re-test there first.

**Cleared 2026-09-25 by Phase 2b.** With the Clerk alias, the stub and the `.hosted.tsx` pages gone, `next build` with `HELIX_HOSTED` unset exits 0 and exports 85/85 pages.

- `@fastify/static` serves the dashboard's `out/`, with an SPA fallback that excludes `/v1`, `/settings`, `/internal` and `/mcp`. The UI and API then share an origin: `resolveBaseUrl` already uses `origin + /v1` off port 3400, and CORS stops mattering.
- `next.config.ts:8` already claims Fastify serves the export. It does not, yet.
- esbuild bundles `apps/api` to one JS file, so Electron's own Node runs it without tsx.

**Done 2026-09-25.**

- `src/static/serve.ts`, on when `HELIX_STATIC_DIR` is set: exact file, then `<path>.html`, then `<path>/index.html`, then the export's `404.html`; `/` redirects 302 to `/app`; `/v1`, `/settings`, `/internal` and `/mcp` never fall through. Static routes carry a route-level `config.public` flag that `core/auth.ts` honours only on a matched route, so an unmatched `/v1/...` path is still judged as before (11 inject tests).
- `scripts/bundle.mjs` → `dist/helix-api.js` (3.4 MB, ESM, node22) plus `dist/externals.json` (playwright, playwright-core, @electric-sql/pglite, @electric-sql/pglite-pgvector, pino: WASM, browser drivers and worker files that cannot be inlined) and `dist/runtime-files.json` (migrations, `openapi.yaml`, `packages/profiles/definitions`, `package.json`). Two paths that broke under `dist/` were fixed: `status/checks.ts` takes a build-time `HELIX_API_VERSION` define, and `browser/profiles.ts` walks upward for its definitions dir the way `mcp/spec.ts` finds `openapi.yaml`.
- Proved on a staged copy (externals installed alone, PGlite and Postgres both): `/` 302, `/app` 200, `/app/keys` 200, `/nope` 404, `/v1/health` 200, `/v1/keys` 401 then 200 with the key, MCP `tools/list` 53 tools.
- Dashboard: `lib/desktop.ts` reads `window.helixDesktop`; `getApiKey()` and `getAdminToken()` return the desktop credentials first, so `ApiKeyGate` never shows in the app; `instance-keys`, `instance-settings` and `status` fetch through `resolveBaseUrl()` instead of the baked `localhost:7400`.
- **The desktop export must be built with `HELIX_HOSTED=0 NEXT_PUBLIC_HELIX_API_URL=` set explicitly.** `apps/dashboard/.env.local` sets both; with `HELIX_HOSTED` merely unset the build comes out hosted (no `out/`), and a non-empty API URL is baked into the chunks so `resolveBaseUrl` ignores the page origin. The stage script passes both.

## Phase 5: extract as one windowless exe

- PyInstaller, `--noconsole`, one-folder build of `helix_extract`.
- `sentence-transformers` (with torch, over 1 GB) is a hard dependency today. Making local embeddings a lazy, optional import keeps the installer small (D3).

**Done 2026-09-25 (D6 as preferred: torch downloads on first use; the bundling fallback was not needed).** `helix_extract/__main__.py` takes `--port`/`--host`; `helix-extract.spec` + `build-exe.ps1` freeze a one-folder `--noconsole` app of 123 MB with no torch, numpy, scipy or sklearn. `runtime.py`: on the first local-embedding request with the package missing, it downloads the runtime pack (`build-runtime-pack.ps1`: CPU torch 2.14 for Python 3.14 and sentence-transformers at the venv's pinned versions, plus the all-MiniLM-L6-v2 weights as a plain folder; 279 MB zipped, 1.08 GB unpacked, sha256 sidecar checked) into `HELIX_RUNTIME_DIR` (default `%LOCALAPPDATA%\Helix\runtime`), unpacks with long-path names, puts it first on `sys.path` only when the package is otherwise missing, and loads the model from the pack's own copy so nothing else is fetched. `/health` gains `local_embeddings` (`missing`, `downloading` with percent, `ready`, `failed`); `/chunk` with `embed` answers 503 + `Retry-After: 30` while downloading; a failed download retries no sooner than 5 minutes later. Proved on the frozen exe: `/health`, `/extract`, `/document` for PDF/DOCX/PPTX/XLSX all 200 with `MainWindowHandle` 0; `/chunk` 503 at 0.3 s, 200 with 384-dim vectors at 40 s; ready at startup after a restart with the pack URL unreachable. pytest 278 passed (from 265), 8 skipped. Known gap: torch needs the Microsoft Visual C++ runtime (`msvcp140.dll`); the pack does not carry it and the installer does not check for it yet.

## Phase 6: `apps/desktop`

**Supervision.** Electron's main process supervises three children, each spawned directly with `windowsHide`:

- the API (`process.execPath` with `ELECTRON_RUN_AS_NODE=1`)
- the extract exe
- `helix-fetch.exe`

It health-polls before opening the window, shows a splash with a status line, restarts a crashed child, and takes every child down on quit.

**Keys.** First run generates the bootstrap key and admin token, stores them with `safeStorage`, and hands them to the renderer through preload, so `ApiKeyGate` never asks.

**Window.** It loads `http://127.0.0.1:<port>/app`, never `file://`.

**Ports.** The app uses its own block (8400–8402, registered in `reference/ports.md` when built), so it never collides with the dev stack on 7400–7402.

**Bundled assets.** Playwright's Chromium headless shell ships in `extraResources`.

**Built 2026-09-25.** `apps/desktop`: one `ChildSpec` module per child (`children/{api,extract,fetch}.ts`) over a registry, `supervisor.ts` (exists-check, port-free check, health poll 60 × 500 ms, restart backoff 1/3/9 s in a 5-minute window, pid files that record image name and start time so a recycled pid is never killed, IPC shutdown then `taskkill /T`), `keys.ts` (`helix-` + 32 hex key, 64 hex admin token, `safeStorage` in `credentials.json`), `splash.ts` + `splash.html` (DESIGN.md dark tokens, 600 ms minimum, status glyph at 2 Hz and a 220 ms ease-out fade, both skipped under reduced motion, per-child Show log, Retry, Quit), `window.ts` (loads `http://127.0.0.1:7410/app`, sandboxed, keys handed only to same-origin pages, outside links to the OS browser), `updater.ts` (electron-updater against `helix-releases`, install on quit, never throws), `preload.ts` (`window.helixDesktop`), `scripts/stage.mjs` (registry of five stage steps, each asserting its output), `build/icon.ico` (7 layers from `apps/dashboard/app/icon.svg`, the tile mark; `logo.svg` carries the wordmark and is unreadable at 16 px). 46 tests, `tsc` clean.

**Dev smoke, real Electron (2026-09-26 03:34 UTC):** `node scripts/dev.mjs` spawned the API (`node --import tsx`, PGlite), extract (`pythonw -m helix_extract`) and fetch; fetch healthy after 2 probes, extract after 6, the API after 15 (8 s total); `/v1/health`, `/app`, fetch and extract `/health` all 200; the only process with a window was Electron's main window titled with the app; after `taskkill /T` on the Electron pid every port was free. Stale-child kill was also exercised live by the shell agent: an orphaned `helix-fetch.exe` with a pid file was killed at the next start.

**Installed smoke, `Helix-Setup-2.0.0.exe` (2026-09-26 04:09 UTC, silent install to `%LOCALAPPDATA%\Programs\Helix`, 795 MB on disk):** all three children healthy in 5 s, each bound to `127.0.0.1` (7410/7411/7412); `/v1/health` reported version 2.0.0 with postgres (PGlite), fetch, extract and browser all `ok`; fetch 1.6.0; extract `local_embeddings: missing` as expected before the pack download; the main window opened with the app title and was the only visible window; `/app` served 13.7 KB of HTML; closing the window sent the IPC shutdown (`api.log`: `reason: ipc`, exit code 0) and within 12 s no child process or listener remained. The updater checked `helix-releases`, found no release yet, logged it and did not interrupt the app. The first build of the installer had shipped without the API's externals (see Phase 7); this is the second build.

## Phase 7: installer

- NSIS, with `artifactName: Helix-Setup-${version}.${ext}`.
- The version follows the product line.
- Where releases publish is D4.

**Built 2026-09-26.** `apps/desktop/electron-builder.yml`: `appId dev.helix.desktop`, NSIS x64, assisted installer (`oneClick: false`, per-user, directory choice, desktop and Start Menu shortcuts, `LICENSE` shown), `publish` → `harryx2011-boop/helix-releases`. `extraResources` maps `resources/{api,ui,extract,fetch,browsers}`; the API's externals travel as `resources/api_modules` → `api/node_modules`, because electron-builder drops every `node_modules` directory under `extraResources` (the first build installed without them and the API died with `ERR_MODULE_NOT_FOUND` for `playwright`; the fix is in `scripts/stage.mjs` and the yml). `corepack pnpm --filter @helix/desktop exec electron-builder --win --x64` writes `release/Helix-Setup-<version>.exe`, its `.blockmap` and `latest.yml`; the version is `apps/desktop/package.json`'s, mirrored with the product line. Unsigned: SmartScreen warns on first launch.

## Decisions

Decided by Harry 2026-09-25.

| # | Question | Decision |
|---|---|---|
| D1 | Database approach | **PGlite**, spike first |
| D2 | Hosted mode (Clerk, Supabase, multi-tenant, Vercel deploy) | **Delete.** The desktop app is single-user. Postgres stays only as long as the PGlite spike needs a comparison. |
| D3 | Local embeddings in the installer | **Fetched on demand.** The installer ships without torch; the app downloads the embeddings runtime when first needed. |
| D4 | Release channel | **A `helix-releases` repo with autoupdate** (created 2026-09-25: github.com/harryx2011-boop/helix-releases) (check `gh release list` before choosing the first version) |

Decided by Harry 2026-09-25, evening session (Phases 3–7 built in one session):

| # | Question | Decision |
|---|---|---|
| D5 | Scope of the session | **All of Phases 3–7**, each phase its own commit. |
| D6 | Extract (torch) in the installer | **Fetched on first use if feasible; bundled if not.** Amends D3 from "ship without torch" to "prefer download, fall back to bundling". |
| D7 | Playwright Chromium | **Bundled in `extraResources`.** Scrape works the moment the app opens. |
| D8 | Desktop ports | **7410 API (serves the UI), 7411 fetch, 7412 extract.** The plan's 8400 block collides with Composer's sidecar (`reference/ports.md`). The scheme keeps a project inside its own index, and Cortex's packaged UI sits at an offset in its block (3801), so the desktop app takes the +10 offset of Helix's 7400 block, clear of the dev stack on 7400–7402. Same numbers Phase 0's evidence run used. |
| D9 | Version | **2.0.0.** Hosted mode and the external database are gone and the product becomes an installed app: a breaking change to how Helix runs. |
| D10 | Publish | **Yes:** the first installer goes to `helix-releases` as a GitHub release once it passes its checks. |
| D11 | Autoupdate | **electron-updater wired in 2.0.0**, background check on launch, install on quit. |
| D12 | Decisions while Harry is asleep | **Take the recommended option and log it here** as a further decision row. Safety-gate items still stop. |

Taken under D12 during the session:

| # | Question | Decision |
|---|---|---|
| D13 | Phases 3 and 4 as separate commits (D5) | **One commit (`50fb19c`).** Both phases edit the same lines of `index.ts` and `config.ts`; either order alone is a commit that does not build. |
| D14 | Which Playwright browsers ship (D7) | **`chromium_headless_shell` only.** `apps/api/src/browser` never sets `headless: false`, so Playwright uses the headless shell; the full Chromium (about 450 MB of the 701 MB `browsers/` dir) is never launched. Firefox and WebKit are not bundled either: choosing one in settings fails with Playwright's own "browser not installed" message. **Overridden by D17 (2026-10-10): the full Chromium ships.** |
| D17 | Ship full Chromium (`channel: 'chromium'`), overriding D14 | **Decided by Harry, 2026-10-10.** The anti-bot pass 2 measured `channel: 'chromium'` (the full build, about 450 MB over the headless shell) as the next stealth step beyond the shell. Ship it: `extraResources` bundles the full Chromium alongside or in place of the headless shell, and the browser tier launches it. Reverses D14's headless-shell-only bundle. **Built 2026-10-16.** `apps/desktop/scripts/stage.mjs` installs `chromium` instead of `chromium-headless-shell` and asserts a `chromium-<rev>` directory; `HELIX_BROWSER_CHANNEL` (config `browserChannel`, default `chromium`) passes `channel` to the chromium launch only, since firefox and webkit reject one. The Docker image already installed the full build (`ARG HELIX_BROWSER_ENGINES=chromium`), so the two now agree. All 98 `apps/api/src/browser` tests pass on the full build, the identity and canvas assertions included. The installer grows about 450 MB; `stage.mjs` has no test for the step because it would download that much. |
| D15 | Loopback binding | **The API and fetch take `HELIX_HOST` / `HELIX_FETCH_HOST`**, default `0.0.0.0` for compose, `127.0.0.1` from the desktop supervisor. Found by the shell agent: the API was answering on the LAN address, and Windows Firewall would prompt on first launch. |
| D16 | Graceful stop on Windows | **IPC.** Windows has no SIGTERM, so the supervisor spawns the API with an IPC channel and sends `{ type: 'shutdown' }`; the API runs the same close sequence as SIGTERM, and the supervisor force-kills the tree after 10 s (raised from 3 s after the review below). |

**Review of `50fb19c` (code-reviewer, 2026-09-25).** Nothing Critical or High. The PGlite mutex releases on every throw path, no transaction's own queries re-enter it, type parity held on a direct probe (int8/int8[], numeric, bytea, jsonb, text[], timestamptz), the static route blocks every traversal form and `config.public` can only reach the two static routes, and the bridge hands credentials only to same-origin pages. Fixed before release: the bootstrap key could be revoked from the Keys page and stayed revoked across restarts, locking the desktop app out (now `ON CONFLICT DO UPDATE SET revoked_at = NULL`, and the UI refuses to revoke the desktop key); `closePool()` came after `app.close()` and `browserPool.close()`, so PGlite was force-killed mid-write on most quits (reordered, capped, grace 10 s); the sweeper's first run was an hour after boot, ignored `resultTtlHours`, could delete documents under a running job, and PGlite has no autovacuum (first run at 60 s, TTL from config, held-job exemption, `VACUUM` after a sweep on pglite); PGlite errors carried bound parameters into the logs; `/app/` 404'd while `app.html` exists and `:` paths reached NTFS streams; `mode.ts` used `??` for the MCP URL; the preload gate now also requires the main frame; `openapi.yaml` still described the multi-tenant model. Deferred (no current call site): the re-entrant `pool.query` deadlock guard and reopening a dead engine, recorded in memory `project_open_threads.md`.

**Later:** whether the desktop app replaces the hook-launched stack as Claude Code's web layer (the `helix` MCP entry on 7400).
