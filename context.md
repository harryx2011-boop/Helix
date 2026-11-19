# Helix — context

## Current state (2026-11-18)

- **Active again.** Stealth ladder work from Harry's 16-question interview: plan `docs/plans/2026-11-18-stealth-ladder.md` (answers, ladder table, batches A-G, Progress), decision record `docs/adr/0006-stealth-ladder-rust-tls.md`. Obscura is out; the `tls` tier is Rust again; the browser rung is headed real Chrome; stealth rungs follow robots.txt.
- **Live stack (dev):** API 7400, Rust `helix-fetch` 7401 (`plain`/`tls`), helix-scrape 7403 (`/render`, started by `~/.claude/hooks/helix-ensure.js` since 2026-11-18), extract 7402, Postgres 7432, SearXNG 7440. The API reaches fetch and render at two addresses (`HELIX_FETCH_URL`, `HELIX_RENDER_URL`).
- **VM:** Agent37 instance `helix` (`8miggdoak6`), template `agent37-ubuntu`, type `vm`, 4 vCPU / 8 GB / 12 GB disk, auto-sleep 15 min. Runs as root (HOME `/root`); repo at `/home/node/helix/helix`, filled by a GitHub clone plus a git bundle of unpushed commits (Mutagen sync needs the `node@` SSH user, which this template does not have). No Chrome, Rust or display installed yet. The boat VM `bx_77vgn9n6` in `CLAUDE.md` is retired.
- **Location (2026-11-18):** the repo is `C:\devprojects\Helix`; `~/.claude/hooks/helix-ensure.js` starts every service from there (venvs rebuilt on C:, `apps/fetch/target` is a junction to `C:\Builds\helix\fetch-target`, SearXNG venv rebuilt from D:'s exact package list). `D:\Helix` is a stale copy.
- **Live since 2026-11-18:** headed Chrome rung, robots gate, challenge retry; npmjs.com/package/express 200, google.com/search `robots_denied`.
- **Not done yet:** see the plan's Progress table. Version stays 2.3.2 until the ladder lands as 3.0.0. Tilion (hosted agent browsers) studied, not installed: `docs/research/2026-11-18-tilion.md`.

> **Stealth ladder, batches A and B in progress (2026-11-18).** Harry's request: "find my helix repo and analyze - pull open items, doc items, and backlog items and dedicate this session to doing all - spin up a agent 37 vm", 16 questions weighted to stealth, prompted by Firecrawl Local (firecrawl/firecrawl `apps/local`, v0.1.1, AGPL-3.0, Rust; its plain fetch uses rustls and blocked pages go to Firecrawl Cloud). Commits on `main`: `cd3f98c` render address split (every browser scrape had failed with a 404 because `/render` went to the Rust exe); `35e07af` Rust `apps/fetch` restored from `9a2542b^` (builds in 6m16s to `C:/Builds/helix/fetch-target`); `dab3ac6` a browser that never closes frees its slot after the grace; `42a7964` scrapling 0.5.1 (venv Python 3.13.13; ADR 0001 amended); `d7f9f05` headed real Chrome rung (Chrome 157 found at `C:\Program Files\Google\Chrome\Application\chrome.exe`, window at -32000,-32000, profile per host under `%LOCALAPPDATA%\Helix\chrome-profiles`, nothing injected, headless staged Chromium fallback with `HELIX_SCRAPE_HEADED=0`, no Chrome or no display; Cloudflare solver budget 20 s, `challenge: not solved within Nms`, `challenge_ms`); `c19f2f4` robots gate for stealth rungs on every route (`core/stealth-policy.ts`, `robots_denied`) and one `solveCloudflare` retry when a browser render returns a challenge page. Measured, home IP, direct `/render`: npmjs.com/package/express headless 403 (45 KB) against headed 200 (146 KB); bot-detector.rebrowser.net red rows 3 against 1 (`ipcFloodingProtection`); quotes.toscrape.com/js 10 quotes, 14.5 s cold (headless, before the headed change). Tests: scrape pytest 183 passed twice, mypy clean, ruff clean; api scoped vitest 75 passed, `tsc` clean.

> **Superseded for Helix on 2026-11-18 by ADR 0006 (Obscura removed).** **Decision: Helix moves to SearXNG plus CX-Obscura only (2026-11-12, docs only, no code changed).** In the Cortex interview on Obscura (`h4ckf0r0day/obscura`, a headless browser engine in Rust) Harry decided: Cortex and Helix share a hard fork named CX-Obscura (private repo `D:\CX-Obscura`, not created yet), stealth is on, and Helix is rebuilt at the same time ("both at once, remove helix fallbacks like chromium, tls, etc. we use searxng and cx-obscura"). This replaces the Scrapling and browser-rung parts of `docs/plans/2026-11-11-helix-v3-revamp.md`; that plan has not been edited yet. Measured on stock Obscura 0.2.6 the same day (boat VM `bx_d224pckt`, method and tables in `D:\Cortex - Web Browser\docs\plans\2026-11-12-cx-obscura-and-rust.md`, section R0): real content came back on 14 of 24 pages (Chrome 15; 6 pages blocked both engines from the VM's datacenter address, 4 rendered only in Chrome, 3 only in Obscura); median peak memory 147 MB per page against 263 MB; nytimes.com took 3,970 MB and the fetch timed out; a `serve` process still held 3,931 MB after that page was closed. A Helix server that holds many pages needs the memory cap and one-process-per-task work (phase R2 of that plan) before it can drop its other fetch paths. Helix's own plan for this is not written yet; it belongs in `docs/plans/`.

> **Scrapling audit and v3 revamp plan (2026-11-11, docs only, no code changed).** Harry asked for a full Scrapling audit, optimizations ("scrapes should be in ms"), new features and a UI revamp from Firecrawl's patterns. Plan with his decisions: `docs/plans/2026-11-11-helix-v3-revamp.md` (Phases 0-6). Evidence in `docs/audits/2026-11-11-*.md` (Scrapling wiring and gaps, live timing, Firecrawl site UI, Firecrawl docs and features); screenshots in `D:\scratch\helix-revamp\`.
> - **The live stack does not run Scrapling.** `C:\Users\harry\.claude\hooks\helix-ensure.js:145-149` starts the old Rust `helix-fetch.exe` (1.7.0) on 7401 and nothing starts helix-scrape on 7403, so the API's browser rung gets a 404 from `/render` and reports `service_unavailable: helix-scrape returned HTTP 404`. Phase 0 fixes it. Not fixed yet.
> - Measured (12 URLs, 4 runs, serial): `/fetch` tls warm p50 144 ms on helix-scrape against 55 ms on Rust (helix-scrape opens a new connection per call: 75 ms against 19 ms over 20 calls to one host); `/render` warm p50 3,191 ms (a new browser per render, about 1.5 s idle); stealth 4,938 ms. g2.com and the Cloudflare demo blocked every path. The scrape venv is Python 3.13, not the ADR's 3.12. Upstream Scrapling is 0.5.1; the pin is 0.5.
> - Scrapling is used only for `/render` (`AsyncStealthySession`); browser cookies (`cf_clearance`) are returned and dropped; no `host_sessions` code exists.
> - UI: the marketing site already has the mega-menu, frame bands and meters; the net-new piece is a docs sidebar layout. The data-source layer is named **Amber**. Cornea was down (no Cortex token), so the study used Playwright.
> - Order (Harry): the Aether lean-tools work (`D:\Aether\docs\plans\2026-11-11-lean-tools.md`) is built first; this plan follows. Stale below: the banner now reads "Helix now runs in your browser"; the footer links to the removed `/canvas`; `DESIGN.md` and `FRONTEND.md` contradict the shipped code.

> Setup revamp (branch `setup-revamp`, 2026-11-01): CLAUDE.md and the design-skill rule fixed; three plan docs moved to `docs/plans/` with a four-file plan set.
> Queued: skills (HLX-1), agents (HLX-2), settings (HLX-5/6), memory (HLX-7), plan-doc moves for WEBSITE/DESKTOP/MILESTONES/HANDOFF/TODO/RESEARCH, context.md history archive and Status call (HLX-9).

Status: Active (2026-11-18): stealth ladder, `docs/plans/2026-11-18-stealth-ladder.md`. Was marked Complete on 2026-10-12. Open items: that plan's Progress table, `TODO.md`, and the Helix entry in ~/.claude/BACKLOG.md.
Current version: 2.3.2 (tag `v2.3.2`; root and app manifests). Latest published installer: 2.1.0 on `harryx2011-boop/helix-releases` (2026-09-26); no installer for 2.2.0 or 2.3.x. `main` has 70 commits past `v2.3.2`, unreleased. Repo public since 2026-10-12.

Older entries (2026-08 to 2026-11-06, 182 KB): docs/history/context-2026-11-rotation.md (moved verbatim 2026-11-18).

## What this is

A frontier utility hub: self-hostable and BYOK (scrape · parse · search · crawl · interact · monitor) with a hosted app at helix.dev. Three runtimes behind one HTTP surface: `apps/api` (TypeScript, Fastify, Playwright pool, jobs), `apps/fetch` (Rust, TLS identity), `apps/extract` (Python, parsing/LLM/embeddings), Postgres + pgvector.

Interact (`apps/api/src/routes/interact.ts`, `browser/sessions.ts`, `browser/interact-actions.ts`, `browser/screencast.ts`): sessions lease a page from the Playwright pool (`BrowserPool.lease`), bounded by `HELIX_INTERACT_MAX_SESSIONS` / `_IDLE_TIMEOUT_SECONDS` / `_HARD_TIMEOUT_SECONDS`; the live view at `/v1/interact/live/{id}?token=` is token-authenticated (the auth hook skips that prefix) and streams CDP screencast frames over SSE. `HELIX_PUBLIC_URL` builds the live-view link.

## Documents

| Doc | Role |
|---|---|
| WEBSITE.md | Plan of record for the site, app, auth, onboarding, agent surfaces, API catalog, build phases |
| ARCHITECTURE.md | System design and principles |
| DESIGN.md | Tokens and the character-animation motif |
| FRONTEND.md | The self-host dashboard plan (now the self-host build mode of `apps/dashboard`) |
| MILESTONES.md | Build state: M0–M9 and M7b done (checked 2026-10-12); open sub-items are unchecked boxes in the file |
| openapi.yaml | Wire contract; being reconciled with code (see WEBSITE.md §11) |
| research/ | Evidence: Firecrawl teardown, visual system, copy, interaction, API landscape, feasibility, api-specs/ |

## Layout

- `apps/dashboard` — one Next.js app: marketing (light), `/app` dashboard (dark), no accounts or sign-in. Port 3400. `HELIX_HOSTED=1` selects the website build (`/app` redirects to `/download`). Vulcan was removed on 2026-09-25 and now runs standalone at `D:\vulcan` (port 4700; `D:\vulcan-scratchpad` is deleted). The Converter was removed the same day (file conversion is Sparky's); its port, 4400, is free.
- `apps/api` — routes: scrape, parse, metadata (+ scrub), map, crawl, search, monitor, interact (+ live view), jobs, keys, health, internal (key sync), mcp. Port 7400. Search backends: SearXNG (`SEARXNG_URL`, no key), Serper, SerpAPI; `HELIX_SEARCH_PROVIDER=auto` picks the first configured.
- `packages/` — profiles, schema, sdk-ts (empty), cli (`@helix/cli`: `init --all -k <key>` writes MCP config + SKILL.md for Claude Code, Cursor, Codex, Windsurf; unpublished).

## Conventions

- Tokens: WEBSITE.md §3. Marketing = Firecrawl-structured light theme in violet; app = DESIGN.md dark.
- Claims guard (WEBSITE.md §11) applies to every user-facing string.
- Stage by name, commit to main, no AI co-author trailer.

## Modularity (2026-09-14)

Audited against the `## Code` rule in `~/.claude/CLAUDE.md` (full playbook:
`~/.claude/reference/modular-code.md`). Every number below was verified by command.
Scope note: `apps/persona` left this repo in `1978166` and was excluded.

- **MEDIUM — two parallel webhook implementations.** `apps/api/src/monitor/webhooks.ts` (191
  lines) and `apps/api/src/webhooks/dispatcher.ts` (296) + `signature.ts` (48) are independent
  implementations of one capability: HMAC-sign, deliver, exponential backoff, dead-letter,
  private-target refusal. `monitor/webhooks.ts:33` reimplements `signPayload` **byte-for-byte**
  from `signature.ts:12` —
  `createHmac('sha256', secret).update(\`${timestamp}.${body}\`).digest('hex')` — and imports
  `createHmac` directly at line 1 rather than importing the seam. It carries its own
  `BACKOFF_SECONDS` table too. At 535 lines this is well past the "few duplicated lines is
  fine" exemption. Fix: a shared `webhooks/core.ts` both construct against, leaving the two
  callers differing only in row-source query and event-type union.
  **Resolved in two steps.** `6ec5fc1` (2026-09-23): one `signPayload`, imported from
  `webhooks/signature.ts`. 2026-09-24: one retry policy. `BACKOFF_SECONDS` is gone; both
  dispatchers use `retryDelayMs` and `WEBHOOK_MAX_ATTEMPTS` (20) from `webhooks/deliveries.ts`,
  and `HELIX_WEBHOOK_MAX_ATTEMPTS` now governs monitor deliveries too. Deliberate behaviour
  change: monitor webhooks went from 10 attempts over ~4 days to 20 over ~3 days. The two
  dispatchers still differ in row source and retryability rules (monitor retries a 4xx; crawl
  dead-letters it); merging those was not asked for.
- **MEDIUM — `packages/sdk-ts/src/client.ts`.** 482 lines, **43** hand-written methods, one per
  API operation. Commit `fee9da1` ("the SDK finally reaches every endpoint") is direct evidence
  the tax was paid in arrears. The neighbouring `apps/api/src/mcp/` derives every MCP tool from
  `openapi.yaml` with zero hand-written registration — the same spec could populate the SDK.
  Mitigating: `HelixClient` is itself a stable narrow seam; the defect is how it is populated.
  **Resolved 2026-09-24 (SDK 1.6.2).** `src/client.ts` is generated by
  `packages/sdk-ts/codegen/generate.ts`, which reads `openapi.yaml` through the MCP loader
  (`apps/api/src/mcp/spec.ts`: `loadSpec`, `deref`, `flattenAllOf`). `codegen/methods.ts` is the
  registry: one row per method, holding only what the spec cannot say (public name, `types.ts`
  types, argument shapes); request mechanics are in `src/transport.ts`. Every spec operation is a
  row or sits in `NOT_IN_SDK` with a reason, or generation fails. `src/codegen.test.ts` (and
  `npm run check:generated`, and a new `sdk` CI job) fails when the spec, the table, `client.ts`
  or the README's method table drift. Public surface compared through the TypeScript checker:
  identical. Behaviour changes: path segments are now `encodeURIComponent`-encoded; a
  `metadataScrub` aborted by the caller now rethrows the `AbortError` like every other method
  (it was wrapped as `HelixApiError` status 0); `parse` upload parts follow the spec's field
  order. Still hand-written: `types.ts` (1,168 lines, not yet generated from the spec).
  13 spec operations have no SDK method yet, listed in `NOT_IN_SDK`.
- **LOW — `apps/extract/helix_extract/schema_gen.py:22`** imports `_anthropic_supports_output_format`,
  `_openai_wire_credentials`, `_resolve` from `llm.py`'s private namespace. Co-churn is real.
  Fix: promote to a public `provider_resolution.py`.
- **Not a finding —** `apps/api/src/providers/{cloud-models,verify}.ts` `switch (provider)`
  blocks are compiler-exhaustive TypeScript union switches with genuinely distinct per-arm
  logic and 1-2 commits of churn. Abstracting now would be speculative.

**Already right — copy these.** `apps/dashboard/lib/catalog.ts:41` is the model:
`ENDPOINTS: readonly EndpointDef[]` is the single registry, and marketing pages, sidebar,
playground tabs, docs CTAs and SKILL.md generation are all `.filter()`/`.map()` derivations of
it. `apps/api/src/mcp/` generates tools from the OpenAPI spec. `routes/document.ts:23`
dispatches through an `OPERATIONS` dict plus Fastify `inject()` rather than re-implementing
each operation. `search/providers.ts:415` is a clean `SearchProvider` seam with a
three-way factory. `apps/api/src/index.ts:16` — one `registerX(app)` per route module, pure
composition with no conditional logic.
- **Sitemap and robots (2026-10-17):** `apps/dashboard/app/sitemap.ts` already listed the public marketing and docs pages; added `app/robots.ts` (allow `/`, disallow `/api/` and `/app/`, names `${SITE_URL}/sitemap.xml`). Live https://helixapi-dev.vercel.app/robots.txt returned 404 before.

## Task Manager names (2026-10-24, branch `fix/process-names`)

`Helix.exe` already reports `Helix` and the Fastify API runs inside it (ELECTRON_RUN_AS_NODE). `helix-extract.exe` now carries `apps/extract/version-info.txt` (FileDescription `Helix Extract`, `version=` in `helix-extract.spec`) and `helix-fetch.exe` embeds `Helix Fetch` through `apps/fetch/build.rs` (winresource, version from Cargo.toml). `voice-core.exe` is named in the `D:\voice-core` repo (`Voice Core`). Not covered: the Playwright `chrome-headless-shell.exe` and the dev-mode `pythonw`/`node` processes show their own names. Names only: no appId or path changed.

## VS Code extension startup (2026-11-11)

`apps/vscode` no longer uses the global `fetch`: Node loads undici on the first `fetch` call, about 60 ms on the extension-host thread inside `activate` (exthost log 2026-11-11: helix 21.007, next extension 21.052). `src/local-fetch.ts` is a small `node:http` stand-in (status, ok, headers.get, json) used for the health probe, the HEAD check and the monitors view. Harness median of 5 (stub `vscode`, built `dist/extension.js`): activate 65 ms to 13 ms, require 21 ms to 15 ms. Tests: `tests/local-fetch.test.ts` (4); `vitest run` 30 pass. Activation stays `onStartupFinished` because the status-bar item must show at startup.

History: older entries are in docs/history/ (search them with qmd or grep; never read them whole).
