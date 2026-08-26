# Helix — context

> **v0.1.0-pre** (2026-08-24): WEBSITE.md plan settled; Phase 1 shipped (marketing site, capability pages, docs, agent routes, Clerk auth GitHub+Google, onboarding, /app shell, playground, keys/usage/activity/settings/self-host; every route 200 at 1440/390, tsc+lint clean). Phase 2 merged: all six APIs live (scrape, parse, search, crawl, interact incl. live view, monitor) plus MCP server at /mcp and @helix/cli; 12 routes, 20 OpenAPI paths, 545 API tests; every marketing and /app route 200 at 1440/390.

## What this is

Self-hostable, BYOK web-data API (scrape · parse · search · crawl · interact · monitor) with a hosted app at helix.dev. Three runtimes behind one HTTP surface: `apps/api` (TypeScript, Fastify, Playwright pool, jobs), `apps/fetch` (Rust, TLS identity), `apps/extract` (Python, parsing/LLM/embeddings), Postgres + pgvector.

Interact (`apps/api/src/routes/interact.ts`, `browser/sessions.ts`, `browser/interact-actions.ts`, `browser/screencast.ts`): sessions lease a page from the Playwright pool (`BrowserPool.lease`), bounded by `HELIX_INTERACT_MAX_SESSIONS` / `_IDLE_TIMEOUT_SECONDS` / `_HARD_TIMEOUT_SECONDS`; the live view at `/v1/interact/live/{id}?token=` is token-authenticated (the auth hook skips that prefix) and streams CDP screencast frames over SSE. `HELIX_PUBLIC_URL` builds the live-view link.

## Documents

| Doc | Role |
|---|---|
| WEBSITE.md | Plan of record for the site, app, auth, onboarding, agent surfaces, API catalog, build phases |
| ARCHITECTURE.md | System design and principles |
| DESIGN.md | Tokens and the character-animation motif |
| FRONTEND.md | The self-host dashboard plan (now the self-host build mode of `apps/dashboard`) |
| MILESTONES.md | Build state: M0–M5 done, M6 in progress, M7–M9 not started |
| openapi.yaml | Wire contract; being reconciled with code (see WEBSITE.md §11) |
| research/ | Evidence: Firecrawl teardown, visual system, copy, interaction, API landscape, feasibility, api-specs/ |

## Layout

- `apps/dashboard` — one Next.js app: marketing (light), Clerk auth, onboarding, `/app` dashboard (dark). Port 3400. `HELIX_HOSTED=1` selects hosted mode.
- `apps/api` — routes: scrape, parse, map, crawl, search, monitor, interact (+ live view), jobs, keys, health, internal (key sync), mcp. Port 7400. Search backends: SearXNG (`SEARXNG_URL`, no key), Serper, SerpAPI; `HELIX_SEARCH_PROVIDER=auto` picks the first configured.
- `packages/` — profiles, schema, sdk-ts (empty), cli (`@helix/cli`: `init --all -k <key>` writes MCP config + SKILL.md for Claude Code, Cursor, Codex, Windsurf; unpublished).
- `supabase/` — migrations for the hosted app (profiles, api_keys, instances, runs, usage_daily).
- `graphify-out/` — knowledge graph; regenerate after structural changes.

## Motion and prompt box (2026-08-25)

- `components/marketing/animated-code.tsx`: `scramble` (JSON values cycle glyphs and resolve independently; keys static), `type` (14ms/char, blinking cursor), `reveal` (per-line fade-in-up), `static`; `playOnView`, reduced-motion renders the settled frame. Used by the hero panel (request types → response scrambles, loops), the capabilities code sample, and every capability-page mock. Evidence: research/17.
- Prompt box: hero input and `/app` playground (`components/playground/prompt-box.tsx`) — icon, input with rotating placeholder (text-swap 150ms/4px/2px blur), endpoint pills inside the box, toolbar (Options · Source · Get code · Run).

## Landing page rebuild (2026-08-25)

Full rebuild of `/` per `landing-revamp-plan.md`'s Helix section, then two further passes the same day modelled on Firecrawl's home. Structure: `(marketing)/layout.tsx` wraps every page in `FrameColumn` (`components/marketing/section-frame.tsx`): a `max-w-container` column whose vertical hairlines run the full page height; sections are separated by `FrameBand` rows (`[ 01 / 05 ] · LABEL // sub //` with a violet tick, code-rain and a pixel-square cluster in the right cell). Band order: 01 Capabilities · 02 Setup · 03 Self-host · 04 Use cases · 05 Get started, then an unnumbered Agents band before the agent block, then the footer. Sections: Hero (no badge; `GridCells` hairline cells with crosshairs, changing markers, ✦ nodes, corner bracket labels and pixel-square clusters; two horizontal `AsciiHelix` double helixes flank the subhead; the prompt box in `hero-panel.tsx` is a floating white card: URL row, then a pill tab group Scrape · Search · Map · Crawl · Parse with a violet arrow submit, overlapping the request/response + ladder panel below) → Capabilities (centred H2 over `CodeRain`, six tabs) → Setup guides (`setup-guides.tsx`: Python / Node.js / cURL / CLI tabs, "One command" with a Skill|MCP toggle, "Agent onboarding") → Self-host (centred header ringed by `AmbientCode` + `CodeRain`, `TerminalReplay`, four claim panels with evidence strips) → Use cases (selectable list driving a wire-format transcript) → Closing CTA (flat grid, clusters, two vertical `AsciiHelix` pillars) → agent block → footer (`footer.tsx`, own design: `FOOTER` band, logo + tagline + horizontal helix, link groups as hairline rows, version + repo line). No social proof, stats, pricing, or testimonials.

`components/marketing/ambient.tsx` holds the background primitives: `GridCells` (cells, markers, `sparkles`, `labels`, `clusters`, `crosshairs`, `fade`), `PixelSquares` (n×n square cluster, one square flips every 700ms; `scale="md"` = 6px squares), `CodeRain` (coarse grid of code tokens fading/scrambling, two `<pre>` tones), `AsciiHelix` (rotating double helix: depth picks glyph set and layer, dotted rungs, gap-filled strands; `orientation`, `pitch`), `AmbientCode` (drifting wire-format strings). Contract for all: text not canvas, one throttled interval, paused off-screen, static under reduced motion, seeded first paint (never `Math.random`/`Date` in render). Markers, ✦ nodes, clusters, code-rain and crosshairs render only at `lg+`. Token gotcha: the illustration grey is `bg-m-illus` / `text-m-illus` (Tailwind `DEFAULT`), not `-default`. `char-grid.tsx` and `integrations.tsx` were removed.

Capability pages (`pages/capability-page.tsx`): the feature grid is one bordered 2×2 panel of `{ icon, eyebrow, lead, body, evidence? }` cells, four per page.

Added `gsap` + `lenis` (`components/marketing/scroll-motion.tsx`, mounted in the marketing layout): Lenis smooth scroll on the GSAP ticker plus the `[data-reveal]` / `[data-reveal-group] > [data-reveal-item]` convention (`power3.out`, 500ms, 60ms stagger, `once: true`); `html.has-motion` gates the CSS visibility hook; reduced motion skips Lenis. Screenshots: `research/firecrawl-capture/shoot-landing.mjs` (marketing routes) and `shoot-app.mjs` (Clerk e2e user; run with `MSYS_NO_PATHCONV=1` from Git Bash or `/app` becomes a Windows path). Ad-hoc scripts outside that folder import Playwright from `file:///E:/Helix/research/firecrawl-capture/node_modules/playwright/index.mjs`.

## /app restyle and Agent research preview (2026-08-25)

`/app` follows Firecrawl's dashboard structure in Helix's dark tokens. `components/app/page-frame.tsx` (`PageFrame`, `FrameRow`, `FrameHeading`, `FrameCells`, `FrameTag`) is the page skeleton: a centred `max-w-[1180px]` column with full-height vertical hairlines and horizontal hairlines that bleed past the column. Shell: sidebar on `bg-background` with mono group headings (Playground · Research preview · Self-host · Account), spend meter as a credits-style bar, user chip, full-width `Collapse` pill (64px icon rail when collapsed, state in `localStorage helix.app.sidebarCollapsed`); top bar carries a static workspace pill (`Personal` in hosted mode, `Self-host` + API URL otherwise), bell (disabled), `Help`, `Docs`, and the primary `Set up an agent` (→ `/app?connect=1`); pages render their own titles. Overview: explore cells (two rows of three), requests chart + active browsers, API key, agent integrations with SKILL.md / CLI / MCP rows. Settings: title row, URL-synced sub-nav (`?tab=profile|preferences|statistics|advanced`, tablist with arrow keys), hairline rows; Advanced shows the API base URL and the delete-account row.

Agent (`/app/agent`, research preview): prompt → `POST /v1/agent/schema` (JSON Schema generated by the configured BYOK model via helix-extract `POST /schema`, `apps/extract/helix_extract/schema_gen.py`; API route `apps/api/src/routes/agent.ts`, `ExtractClient.schema`) → schema panel (collapse, edit, copy) → optional refine (`hint` = current schema, `instruction` = text) → run: with URLs, `scrape` each with `jsonOptions.schema`; without, `search` with `scrapeOptions.formats: ['json']` (`lib/agent.ts`, max 3 concurrent, per-page retry) → results panel with JSON/CSV download. Hosted mode proxies through `app/api/app/agent/schema/route.ts`; self-host calls the API directly with the browser-held key (`useOptionalApiKey` returns null when no provider is mounted). No example-prompt cards by design (global rule against suggestion-pill triads). Live LLM path is untested locally (no provider key in env).

## Provider keys, black surface, Turbopack attempt (2026-08-25)

Provider keys (BYOK per Helix key): `apps/api/migrations/005_provider_keys.sql` stores AES-256-GCM ciphertext per `(api_key_id, provider)` for anthropic / openai / gemini / openrouter (`src/providers/{crypto,repository,resolve}.ts`; key from `HELIX_ENCRYPTION_KEY`, else derived from `HELIX_BOOTSTRAP_KEY`). Routes `GET /v1/providers`, `PUT /v1/providers/:provider` (`{ apiKey, model? }`), `DELETE /v1/providers/:provider`. Scrape/parse `jsonOptions` and `/v1/agent/schema` resolve the caller's keys and send `provider_keys` / `provider_models` to helix-extract, whose `llm.py` prefers them over the instance env and auto-picks anthropic → openai → gemini → openrouter when no provider is named and the instance default has no key. Dashboard: Settings → Providers tab (`components/app/providers/*`, `lib/providers.ts`, proxies at `app/api/app/providers[...]`), icons in `public/providers/*.png` (Google favicon service, 64px).

`/app` surface is neutral black (`--background 0 0% 3%`, `--card 0 0% 5%`, `--border 0 0% 14%`), replacing the blue-cast `#0B1220`; the marketing terminal panels follow it. `components/app/app-grid.tsx` draws the landing grid pattern (hairlines, crosshairs, markers, assembling pixel clusters) behind `PageFrame` gutters and the Agent empty state; `FrameRow` is solid by default (`transparent` opts out). The Agent composer and refine bar are `rounded-pill` bars with lucide icons (`Sparkles`/`Wand2`, `Link2` URLs, `Braces`/`Table2` output, `ArrowUp` submit). The sidebar logo links to `/`.

Landing additions: `hard-parts.tsx` (band 02: `DocParse` document-parsing animation cycling pdf/docx/pptx/xlsx/html with a character particle stream and a Parsing…/Parsed chip; `JsonExtract` page → JSON scramble), `PixelSquares mode="assemble"` (squares fill in one by one, hold, clear), assembling clusters in the hero, bands and CTA, `CodeRain` patches pinned to the hero's outer edges (`xl+`). Bands renumbered 01–06. Ambient pieces are masked or positioned away from copy; nothing decorative renders below `lg`.

Dev speed: Turbopack (`next dev --turbopack`) panics with "Next.js package not found" in this hoisted-`node_modules` exFAT monorepo (tried `experimental.turbo.root`, `turbopack.root`, cwd-derived root, cleared `.next`); `turbopackPersistentCaching` is canary-only on 15.5. Dev stays on webpack. Cold compiles are I/O-bound on the exFAT drive (`/` 13–35s cold, ~1s warm); moving the checkout to NTFS is the remaining lever.

## Conventions

- Tokens: WEBSITE.md §3. Marketing = Firecrawl-structured light theme in violet; app = DESIGN.md dark.
- Claims guard (WEBSITE.md §11) applies to every user-facing string.
- Stage by name, commit to main, no AI co-author trailer.
