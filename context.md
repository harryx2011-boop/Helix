# Helix — context

> **1.1.0** (2026-09-02, later the same day): **Persona ships** at persona-helix.vercel.app — `apps/persona` (port 4200): landing with the animated role pill, the looping search demo, a real `/roles` iframe mockup and the auto-advancing wizard card; the app shell with a resizable/collapsible sidebar (URL-state search + Department/Platform/Tone chips, Settings with theme, wizard API key and saved forks); `/roles` grid and static `/roles/[slug]` pages with a persona dropdown, platform tabs driving the config-keys panel, version history and a burger menu; the step-by-step wizard on the striped bar; a Tiptap editor route with autosave, a placeholder rail and `.md/.txt/.json/.pdf` export; 12 personas and 16 guides rewritten into one structure under `content/`. **Supabase is live**: project `Helix` (`gytknetqttkdmkhmysbm`), schema applied, CLI linked, env in Vercel, and a Clerk sign-in → key → row round trip proven. Dashboard: key revoke moved from `/api/app/keys/[id]` to `?id=` because Vercel's builder fails on a client-reference manifest for a dynamic route handler under `pageExtensions`.

> **1.0.0** (2026-09-02): **semantic-versioning rebaseline** — every project restarts at 1.0.0 under MAJOR.MINOR.PATCH (rule in `~/.claude/CLAUDE.md` → Versioning); the 1.0.1 line below folds into it. Same day: **Supabase returns as the one database** (`supabase/`: hosted identity, Persona, `schema.sql` generator), the dashboard mints real API keys into the API's own `api_keys` table under a Clerk-owned `profiles` row, the pgvector `chunks` migration that would have failed the first Supabase boot is fixed, and `PERSONA.md` is the plan of record for the Persona sub-site.

> **v1.0.1** (2026-08-29): WebSocket live view, the one item v1.0.0 shipped without. **v1.0.0** the same day: every other milestone closed. Vector `destination` wired into the crawl worker (the sinks existed and nothing called them); M8 Enrich built; monitors gained business-hours windows and field-level JSON diffs; `@helix/sdk` fills the empty packages/sdk-ts; local runtimes list their installed models instead of asking for a name typed from memory. 806 API tests, 165 extract tests, 29 SDK tests, 15 CLI tests.
>
> The three claims this file had carried as unverified since it was written are now proven against real services: a real LLM generation reaches a model and returns (Ollama `gemma4:latest`), embeddings produce real 384-dimension vectors, and a real crawl stores them in a live Qdrant. Not proven: behaviour against a frontier model (every live result here came from a 4-8B local one), pgvector against a real server (no PG18 Windows build), and stealth against a commercial WAF.
>
> **v0.1.0-pre** (2026-08-24): WEBSITE.md plan settled; Phase 1 shipped (marketing site, capability pages, docs, agent routes, Clerk auth GitHub+Google, /app shell, playground, keys/settings; every route 200 at 1440/390, tsc+lint clean). Phase 2 merged: all six APIs live plus MCP server at /mcp and @helix/cli.

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
- `graphify-out/` — knowledge graph; regenerate after structural changes.

## v1.0.0 — the last gaps closed (2026-08-29)

**Vector destinations are live.** `POST /v1/crawl` takes `destination` ({type: qdrant|pgvector, collection, namespace, upsertMode}) the way openapi.yaml already claimed. Each stored page is chunked and embedded through helix-extract `POST /chunk` (embed:true) and upserted; `ensureCollection` fires once per job; a failure is recorded as a `vector_store` row in fetch_failures and counted in the job's `usage.vectorFailures` rather than losing the page. `upsertMode: append` mangles the anchor with a UUID so each call makes a fresh point. GOTCHA fixed in the same pass: the embed call's timeout was 30s, but the FIRST embed loads the model from disk and takes longer, so the first crawl anyone ran with a destination always timed out while every later one worked — it is 180s when embedding, 30s otherwise.

**M8 Enrich** (`apps/api/src/enrich/`, `routes/enrich.ts`, `apps/extract/helix_extract/enrich.py`). `POST /v1/enrich` takes a subject plus a field list and answers only from pages it read. Phased: metadata/JSON-LD first, model last. Every model-proposed value is checked against fetched content — citation must be a real passage in a page actually read, and the value must appear inside it — and anything failing becomes `null` with a reason. Confidence is an ordinal band (`high` = read out of markup by this code; `medium` = model-proposed and verified; `low` = booleans), explicitly not a probability and not calibrated. Untrusted page text is fenced with an ASCII marker whose terminator is stripped from the payload, and the wrapped type is branded so slicing it will not compile; a clipped payload tells the model how much was cut. 11 of 12 controls fail a test when deleted; the twelfth was deleted for surviving.

**Enrich yield depends on the model, and it fails closed.** Three identical runs against `gemma4:latest` returned one grounded answer and two `value_not_in_citation` refusals. That is the control working, not a bug: a small local model paraphrases rather than quoting, and a citation it cannot reproduce verbatim is discarded rather than trusted. The consequence is a real yield cost on weak models — expect nulls where a frontier model would ground — and the tradeoff is deliberate, since the alternative is confident invention. Any change here must not soften the check to raise yield.

**WebSocket live view** (2026-08-29, the one item 1.0.0 shipped without): `/v1/interact/live/{id}/ws` beside the SSE stream, not replacing it. Costs one dependency, `@fastify/websocket` (Fastify 5). Same view-token auth, same 4-viewer cap, same drop-oldest backpressure — a socket has no `write()` return value, so queue depth (`bufferedAmount` over 256KB) stands in. Messages are JSON `{type: session|frame|ping|closed, data}`; a rejected token closes 4401, a full session 4429. Inbound messages are ignored: the link carries no authority to act. Verified live — a real session streamed 17KB JPEG frames over the socket, and SSE was re-checked in the same run to confirm it still works.

**Monitors**: business-hours windows (`schedule.window`), which RESTRICT the cron and never widen it — a combination that can never fire is rejected at write time — and field-level JSON diffs (`jsonOptions`, migration 008) that run only once a change is already firing, so a quiet check pays for no model call.

**`@helix/sdk`** (packages/sdk-ts, was an empty directory): typed client over every path in openapi.yaml, no runtime dependencies. Where the spec and the dashboard's hand-written client disagreed the spec won — scrape actions and interact actions are separate unions, stored providers (4 cloud) are separate from the 7-value per-request extract override.

**Local models are browsable**: `GET /v1/providers/{provider}/models` reads Ollama's native `/api/tags` (deriving the native root from the stored `/v1` base URL) or an OpenAI-style `/v1/models`, and Settings → Model providers offers them beside the free-text field.

Two bugs that would have shipped, both found only by running against a real model rather than a mock. `/v1/agent/schema` accepted no `provider`, and helix-extract's auto-pick walks cloud vendors only by design, so an instance whose sole provider was a local runtime could not use it at all. With that fixed it answered, and always returned `properties: {}` — `_strictify` in `schema_compiler.py` stamped `additionalProperties: false` onto objects declaring no properties, which forbids every key, so the meta-schema's own `properties` field was structurally unfillable and schema design could never emit a field.

## Persona, the sub-site (2026-09-02)

`apps/persona` is its own Next.js app in the workspace (Inter + JetBrains Mono, black primary, blue only for actions, eleven role tints; tokens in `app/globals.css` as `--p-*` plus shadcn hsl aliases so the copied `components/ui/*` work). The catalog is files: `content/roles.json`, `content/personas/<role>/<slug>.md` (frontmatter + body with `{{TOKENS}}`), `content/guides/*.md` (config-keys block + steps), loaded by the server-only `lib/catalog.ts` and gated by `pnpm check:content` (`node --conditions=react-server` because `server-only` throws outside Next). `lib/placeholders.ts` is the deterministic engine (scan, alias the wizard-era `Q1.1_*` names onto the guides' keys, fill, segment); `lib/store.ts` is local-first state (forks, favourites, template values, settings) in localStorage with a cross-component change event; Phase 4 merges it into the `persona_*` tables. GOTCHA: gray-matter parses `date: 2026-09-02` as a Date, which React refuses to render; the loader normalises history dates to ISO days. Vercel project `persona-ai` on **persona-helix.vercel.app** — `persona-ai.vercel.app` belongs to another account's "AI Interviewer" site and returns 409 on attach — (root `apps/persona`, deployed from the repo root with `VERCEL_PROJECT_ID` set, since `.vercel/` at the root belongs to helixapi-dev).

## Setup prompt and the Exa read (2026-09-02)

`research/18-exa.md` is the Exa teardown: what an agent-first search company states as principles (content not links, freshness as a parameter, speed tiers, a setup prompt written for the agent rather than the person) and what Helix adopts. Adopted the same day, all docs/copy: the generated SKILL.md preamble (`lib/skill.ts`) now says where the file lives per harness and carries a secret-handling rule; `lib/setup-prompt.ts` is a prompt written for the agent (install the skill first, presence-check the key without printing it, smoke-test with a status code, then optionally wire MCP); the Setup section's "Agent onboarding" panel shows it with a copy button above the cURL. Deliberately NOT adopted: Exa's benchmark and speed claims, which the claims guard forbids. Two API ideas are parked, not built: a cache-age ceiling on scrape/crawl (`maxAgeHours`-shaped) and search-by-URL on `/v1/search`.

`components/marketing/setup-prompt.tsx` is the hero's split pill under the CTA pair: "Copy setup prompt" on the left, the three harness marks plus a chevron on the right opening OPEN IN → Claude Code · Codex · Cursor, then View SKILL.md. Cursor uses its documented MCP install deep link (`cursor://anysphere.cursor-deeplink/mcp/install`, config base64); Claude Code and Codex have no install scheme, so those items copy the prompt and go to `/docs/agents`. Marks in `public/agents/*.png` (Google favicon service, verified by eye: Claude starburst, OpenAI blossom for Codex, Cursor cube). GOTCHA: Radix portals the menu to `<body>`, outside `[data-surface='marketing']`, so the `m-*` tokens were undefined and the menu rendered see-through — the content carries `data-surface="marketing"` and an inline surface background. Exa's own docs page, fetched raw, has no such dropdown (one code block titled "Copy this setup prompt into your agent"); the split pill is Helix's shape.

## One database: Supabase back, with the API's own tables (2026-09-02)

The 2026-08-29 removal below was right about duplication and wrong about the remedy. Hosted mode now has **one Postgres**: the hosted API's `DATABASE_URL` is the Supabase project's direct connection, `apps/api/migrations` run there at boot, and the dashboard's server routes insert into the API's `api_keys` table (`profile_id` added by `supabase/migrations/0001_hosted_identity.sql`) — a key created at `/app/keys` authenticates on the next request with no mirror. `lib/supabase/server.ts` (service role, `server-only`), `lib/profiles.ts` (ensureProfile, createApiKey/list/revoke by profile), `app/api/webhooks/clerk/route.hosted.ts` (svix; `user.deleted` revokes keys before the cascade), `app/api/app/keys/*.hosted.ts` (401 signed-out, **503 `not_configured`** when Supabase is absent, which the keys page treats as "fall back to the instance/ephemeral flow"). Self-host is untouched; both `tsc` modes and lint pass. `@supabase/supabase-js` pinned exactly.

RLS is on for all 24 public tables (the API connects as owner, unaffected). Policies exist only where a signed-in browser should read directly: own profile, own keys (table grant revoked and re-granted column by column so `key_hash` is never readable — a column-level REVOKE alone is a no-op under Supabase's default table grants), own jobs and monitors, Persona's own rows. `current_clerk_user_id()` reads `sub` from `request.jwt.claims` (Clerk as Supabase third-party auth). Verified on a scratch Postgres 18: `schema.sql` applies clean; user A sees only A's keys/forks and cannot select `key_hash`; unauthenticated sees nothing; `migrate()` against the seeded DB reports 8 skipped; on an empty DB reports 8 applied then the hosted files push on top; the pre-fix 001 checksum is tolerated once and rewritten.

**`supabase/schema.sql` is generated** (`node supabase/build-schema.mjs`): API migrations + hosted migrations + a `schema_migrations` seed carrying each API file's sha256, so a project set up from it boots the API with nothing to apply. Fresh projects only (the API migrations lack IF NOT EXISTS). Regenerate whenever a migration lands on either side.

**pgvector bug, fixed.** `001_init.sql`'s chunks block put `$sql$` inside a `--` comment within a dollar-quoted string, terminating it early; the block was syntactically broken but unreachable everywhere so far (no pgvector). Supabase ships pgvector, so the first hosted boot would have died in migration 001. Fixed in place; `migrate.ts` carries `PRIOR_CHECKSUMS` so databases that recorded the old hash are not refused (`migrate.test.ts`, 4 tests; 810 API tests pass). Still not executed against a real pgvector server — parsed only.

DEPLOY.md is rewritten for this model (direct-connection `DATABASE_URL`, `schema.sql` in the SQL editor, Clerk third-party auth + webhook, `migration repair` for later pushes). PERSONA.md carries the Persona plan; `research/persona/` holds the PRD's content files, the role-pill component and the avatar.

## Supabase removed; the app is local (2026-08-29)

The hosted half kept a second copy of what the instance already owns — profiles, api_keys, instances, runs, usage_daily, github_connections — behind 24 `app/api/app/*` route handlers. All removed, with `supabase/`, `lib/supabase/`, `lib/profiles.ts`, `lib/usage.ts`, `lib/github.ts` and both npm packages. Clerk stays and does one job: gate `/app`. Past that gate both modes are the same code — the browser holds a key in `localStorage` (`helix.apiKey`) and calls the instance directly, so the playground posts to `/v1/*` with no proxy and no run recorded anywhere but the instance. Screens whose only source was Supabase are gone rather than showing zeroes: activity, usage, instances, GitHub integrations, onboarding, the requests chart, the spend meter. `/app` is now Overview · Playground · Agent · Health · Keys · Settings. The keys page keeps a browser-side 32-char generator (`lib/ephemeral-keys.ts`, rejection-sampled — `byte % 62` over-represents A–H by 21.5%) for a deployment with no instance in reach.

Self-host export now builds (it never had): hosted-only files carry a `.hosted.ts(x)` extension included via `pageExtensions` only when `HELIX_HOSTED=1`, and self-host aliases `@clerk/nextjs` + `/server` to `lib/clerk-stub/` — a runtime branch is not enough, the static import alone pulls in Server Actions that `output: export` refuses. GOTCHA: exFAT `readlink` returns EISDIR on a regular file where NTFS returns EINVAL, so any `next build` on E: dies with `EISDIR ... readlink <file>.ts`. Copy to C: to build.

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

## Local runtimes, favicons, footer (2026-08-28)

Provider keys now cover local runtimes. `apps/api/migrations/007_local_providers.sql` widens the `provider_keys` CHECK to seven providers (adds `ollama`, `vllm`, `openai-compatible`), adds a nullable `base_url`, and makes the key columns nullable behind a `key_ciphertext IS NOT NULL OR base_url IS NOT NULL` check — a local runtime is identified by a URL, not a credential. `PUT /v1/providers/:provider` takes `{ apiKey?, model?, baseUrl? }` and requires `baseUrl` for a local provider, `apiKey` for a cloud one. `toClientKeys` emits a third map, `providerBaseUrls`, threaded through `ExtractClient` as `provider_base_urls` into `llm.py`/`schema_gen.py`, where a caller-supplied base URL beats the instance-wide `OPENAI_COMPATIBLE_BASE_URL`. Each caller can now point at their own Ollama, and Ollama plus vLLM can be configured at once. `_CALLER_KEY_PRIORITY` deliberately still excludes local runtimes: auto-pick is for key-bearing cloud providers, so a local runtime is used only when named. Settings → Providers renders all seven rows, local ones taking a base-URL field; `public/providers/` gained real `ollama.png` and `vllm.png` marks (verified by eye and by distinct hashes), while `openai-compatible` uses a lucide `Server` glyph since it is not a company.

Favicons: `apps/api/src/core/favicon.ts` resolves a page's icon from its declared `<link rel=icon|shortcut icon|apple-touch-icon>` (largest declared `sizes` wins), falling back to `/favicon.ico` at the origin. It is pure string parsing and never fetches, so the cost stays zero per page. Computed in `runPipeline` next to `title`/`contentHash`, so it is present regardless of requested `formats`, and surfaced as `metadata.favicon` on scrape, search and crawl plus the `Metadata` schema in `openapi.yaml`. The dashboard's `components/result/site-icon.tsx` prefers that field, falls back to the Google favicon service, then to a muted `Globe`; failure state is keyed by src so a recycled list row retries for its new site.

Removed the built-in API key. The dashboard used to fabricate a "Default" key (`helix-LOCA…001`, created at epoch 0, hence "20694d ago") whenever Supabase was unconfigured — in `app/api/app/keys/route.ts`, `lib/profiles.ts` and the reveal route — and `ensureProfile` auto-created a real "Default" row for every new profile. All four are gone: unconfigured storage now returns no keys and a 400 on write, and a new profile starts empty. `formatRelativeTime` guards non-finite and non-positive timestamps.

Naming and footer: the sidebar's "Research preview" group and the agent screen's `[ research preview ]` label are now "Utilities"; playground `sidebarLabel`s are one-word actions (Scrape, Parse, Search, Map, Crawl, Interact, Monitor). The footer dropped its Community column (three columns, `lg:contents` un-nests them into one grid so no cell is empty and no trailing border hangs). Every footer link resolves: new `/terms`, `/privacy`, `/docs/api-reference`, `/docs/sdks` and `/docs/agents` pages, plus the `#roadmap` and `#security` anchors the fragment links pointed at. The agent Output control is a real two-segment JSON/CSV radiogroup, and the selection now drives the results panel's primary download rather than being cosmetic.

## Provider keys, black surface, Turbopack attempt (2026-08-25)

Provider keys (BYOK per Helix key): `apps/api/migrations/005_provider_keys.sql` stores AES-256-GCM ciphertext per `(api_key_id, provider)` for anthropic / openai / gemini / openrouter (`src/providers/{crypto,repository,resolve}.ts`; key from `HELIX_ENCRYPTION_KEY`, else derived from `HELIX_BOOTSTRAP_KEY`). Routes `GET /v1/providers`, `PUT /v1/providers/:provider` (`{ apiKey, model? }`), `DELETE /v1/providers/:provider`. Scrape/parse `jsonOptions` and `/v1/agent/schema` resolve the caller's keys and send `provider_keys` / `provider_models` to helix-extract, whose `llm.py` prefers them over the instance env and auto-picks anthropic → openai → gemini → openrouter when no provider is named and the instance default has no key. Dashboard: Settings → Providers tab (`components/app/providers/*`, `lib/providers.ts`, proxies at `app/api/app/providers[...]`), icons in `public/providers/*.png` (Google favicon service, 64px).

`/app` surface is neutral black (`--background 0 0% 3%`, `--card 0 0% 5%`, `--border 0 0% 14%`), replacing the blue-cast `#0B1220`; the marketing terminal panels follow it. `components/app/app-grid.tsx` draws the landing grid pattern (hairlines, crosshairs, markers, assembling pixel clusters) behind `PageFrame` gutters and the Agent empty state; `FrameRow` is solid by default (`transparent` opts out). The Agent composer and refine bar are `rounded-pill` bars with lucide icons (`Sparkles`/`Wand2`, `Link2` URLs, `Braces`/`Table2` output, `ArrowUp` submit). The sidebar logo links to `/`.

Landing additions: `hard-parts.tsx` (band 02: `DocParse` document-parsing animation cycling pdf/docx/pptx/xlsx/html with a character particle stream and a Parsing…/Parsed chip; `JsonExtract` page → JSON scramble), `PixelSquares mode="assemble"` (squares fill in one by one, hold, clear), assembling clusters in the hero, bands and CTA, `CodeRain` patches pinned to the hero's outer edges (`xl+`). Bands renumbered 01–06. Ambient pieces are masked or positioned away from copy; nothing decorative renders below `lg`.

Dev speed: Turbopack (`next dev --turbopack`) panics with "Next.js package not found" in this hoisted-`node_modules` exFAT monorepo (tried `experimental.turbo.root`, `turbopack.root`, cwd-derived root, cleared `.next`); `turbopackPersistentCaching` is canary-only on 15.5. Dev stays on webpack. Cold compiles are I/O-bound on the exFAT drive (`/` 13–35s cold, ~1s warm); moving the checkout to NTFS is the remaining lever.

## Vercel deployment (2026-08-25)

`https://helixapi-dev.vercel.app` (project `helixapi-dev`, team harryx2011-boop, Root Directory `apps/dashboard`, linked from the repo root via `.vercel/`). Production env: Clerk dev keys, `HELIX_HOSTED=1`, `NEXT_PUBLIC_HELIX_HOSTED=1`, `NEXT_PUBLIC_SITE_URL`, the Clerk sign-in/sign-up URL vars, `HELIX_BOOTSTRAP_KEY`, `HELIX_KEY_ENCRYPTION_KEY`, `HELIX_INTERNAL_ADMIN_TOKEN`. No Supabase and no hosted API behind it yet, so `/app` runs on the local stubs and playground calls fail gracefully. **`/app` answers 404 to a signed-out visitor** — Clerk rewrites it (`X-Clerk-Auth-Reason: protect-rewrite, dev-browser-missing`) because a dev instance has no dev-browser token on a hosted domain. The route builds fine (`ƒ /app` and every sub-page appear in the build output); it needs production Clerk keys, not a code change. Public routes (`/`, `/docs`, the capability pages, `/sign-in`) all serve 200. Deploy with `vercel --prod --yes` from the repo root; `.vercelignore` keeps `.pgdata`, `research/`, `graphify-out/`, build outputs and virtualenvs out of the upload. `outputFileTracingRoot` must be the monorepo root or hoisted `next` internals are missing from the function (`Cannot find module 'next/dist/compiled/source-map'`). Project settings are patched with `vercel api -X PATCH /v9/projects/<id> -f rootDirectory=apps/dashboard` (the `-f` flag; `-d` is silently ignored).

## GitHub connections (2026-08-26)

Settings → Integrations connects a user's GitHub account so Helix can read what
they already have access to. Deliberately SEPARATE from the GitHub sign-in
Clerk offers: Clerk's external-account token carries the scopes sign-in asked
for, and users who signed in with Google or email have no GitHub token at all,
so a distinct OAuth App means everyone can connect and the scopes are ours.

`supabase/migrations/0002_github_connections.sql` holds one row per
(profile, github_login) — AES-256-GCM `token_ciphertext`/`token_iv` under the
existing `HELIX_KEY_ENCRYPTION_KEY`, plus `token_last4` for display, RLS'd with
the same `current_clerk_user_id()` policy shape as every other table. Its own
table rather than a widened `provider_keys`: that one lives in the API's
Postgres, is keyed on `api_key_id`, and CHECK-constrains `provider` to the four
LLM vendors, while a GitHub grant belongs to a person and carries expiry and
scopes.

`lib/github.ts` owns the flow and is the only module that decrypts a token —
routes get `GithubConnectionMeta` (no ciphertext), and `authorizationFor`
returns HEADERS, refusing on unknown connection, agent-use-not-granted, an
origin other than `api.github.com`, or expiry. Routes under
`app/api/app/github/`: `connect` (mints `state`, httpOnly cookie scoped to
`/api/app/github`, `sameSite: lax` because the callback is a top-level
navigation), `callback` (clears the cookie on every path, `timingSafeEqual` on
state, never echoes provider error text into the redirect URL), `[id]` PATCH /
DELETE (both scoped by `profile_id` as well as id).

`agent_may_use` starts FALSE and is not touched by the upsert, so reconnecting
an account never silently re-grants agent use the user turned off.

New env: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (the secret is required
at token exchange even with PKCE — GitHub does not distinguish public from
confidential clients, which is why the exchange must stay server-side). Absent,
the Integrations tab renders and the Connect button is inert rather than
missing.

## Instance settings and the live BYOK path (2026-08-26)

`/settings` on the API (migration 006) is the self-host operator's own surface: `HELIX_INTERNAL_ADMIN_TOKEN`, not an API key, which is why it sits in `registerAuth`'s `open` prefixes and enforces its own gate. `apps/api/src/settings/registry.ts` is the whole catalogue — a setting absent from it cannot be written, so `databaseUrl`, `port` and the admin token itself are unreachable by construction. Each entry declares its effect: **live** (5, applied through new `BrowserPool.setLimits` / `SessionRegistry.setLimits`), **restart** (21), **guarded** (2 — `allowPrivateUrls` and `lightpandaEnabled`, each refused without a `confirm` naming that exact key, so a blanket confirmation cannot slip one through). Stored overrides merge into `config` immediately after the pool is created and before any consumer is constructed, so "restart required" is truthful — verified live: an override of `crawlMaxDepth: 7` survived a restart and made the API reject `maxDepth: 20`, which the env default of 50 allows.

Rotating the encryption key used to orphan every stored provider key (`decryptSecret` takes one key; rows carried no version). `provider_keys.key_version` plus `rotate.ts` now re-encrypt inside one transaction, decrypting everything before writing anything, so a wrong key aborts with nothing changed. Verified against real Postgres, not only mocks.

The self-host dashboard is a **static export served by Fastify** — there is no dashboard server, so a Next route handler with `force-dynamic` throws there. The settings screen therefore calls the API directly from the browser with the admin token in `localStorage` (`helix.adminToken`), mirroring how `helix.apiKey` already works. Screenshot harness: `research/firecrawl-capture/shoot-self-host-settings.mjs`.

BYOK is proven live end to end: probing extract `/schema` with a caller-supplied invalid OpenAI key returned a genuine OpenAI 401, so provider selection, model defaulting and credential forwarding all work against the network. Still unverified — a *successful* generation, which needs a real key. Note `apps/api/src/routes/agent.ts:35` forwards helix-extract's `detail` verbatim, so a provider's masked-key echo reaches the caller.

`HELIX_RESPECT_ROBOTS` and `HELIX_MAX_HOST_CONCURRENCY` were parsed but never read; both are now wired (the latter replaced a hardcoded `?? 8` in the crawl worker).

## Batch scrape and the stealth chain (2026-08-26)

`POST /v1/batch/scrape` takes a list of URLs and returns one job. It runs on the crawl worker rather than beside it, and batch semantics come from options the frontier already understood: `maxDepth: 0` rejects every discovered link as too deep, `sitemap: 'skip'` removes the other source of unasked-for URLs, and `allowExternal` lets the list span hosts. The `jobs` enum already carried `batch_scrape`, so no migration. Async only. Verified live across two hosts - `example.com` links to `iana.org`, and the job finished with exactly the two supplied tasks.

**The stealth chain was not what the docs said.** Three links, and only one was real:

- **Transport - real.** `apps/fetch`'s `resolve()` maps a profile name onto a `wreq-util` `Emulation` preset (13 identities), maintained upstream against actual browser captures. The JSON definitions do not drive this; `load_all()` in `profile.rs` is a stub with a TODO and never reads them.
- **JS layer - was dead, now applied.** The definitions carried WebGL strings, core count, memory, timezone and screen that *nothing read*. A scrape naming a profile got the right transport identity and the host machine's real fingerprint - the exact contradiction profiles exist to prevent. `apps/api/src/browser/profiles.ts` now injects it via `addInitScript`, and `profileUsed` is reported the way the fetch tiers already did. Canvas is perturbed deterministically from the profile id, because a value that varies between two reads is itself the tell.
- **Capture - built, and the chain now closes.** `tools/capture` records a real browser's JS surface (`@helix/capture`). It refuses a `HeadlessChrome` user-agent, a SwiftShader renderer and an unstable canvas, because a bad recording marked `verified: true` is worse than none.

**The version ceiling is gone (2026-08-26).** `wreq-util 0.1` stopped at Chrome 137 while browsers run 148+, so every capture paired a user-agent the transport layer could not present. The pin comment named the cause: `wreq 0.16` needs rustc 1.98, and the toolchain was 1.95. After `rustup update`, apps/fetch moved to `wreq 0.16` + `wreq-util 0.2` and `available()`/`resolve()` grew from 13 identities to **44** (Chrome 131-149, Edge 127-148, Safari 17.5-26.4 including iOS); the default is now `chrome-149`. The release binary reports `profiles_loaded: 44`, and a live fetch returns `profile_used: chrome-148`.

`chrome-148-windows.json` is the first `verified: true` definition — recorded with `--executable` against Playwright's chromium-1223 build, which is Chrome 148. Playwright keeps more than one Chromium, and the older one is often the version `wreq-util` carries.

The 0.16 API changes were mechanical but worth knowing: `Emulation` became `Profile` (aliased as `Identity`, since profile.rs has its own `Profile`), `wreq::Url` gave way to `http::Uri`, and `Attempt::url()`/`previous()` are now public fields.

`load_all()` in apps/fetch was a stub that never opened the JSON, which is why `ProfileError` and `validate()` were dead code. It now reads `packages/profiles/definitions`, refuses to boot on an incoherent profile, and warns per definition that was never captured or that names an identity the transport layer falls back from. `health()` separates the two counts it used to conflate: `profiles_loaded` is the identities this build presents (44), `definitions_loaded` is the JSON actually read (2).

`chrome-149-macos` is gone — a fabricated sample whose id `resolve()` fell back from. `chrome-137-macos` stays because `chrome-137` resolves and has no other definition, but it is `verified: false`, describes a macOS machine that cannot be captured from this Windows box, and both tiers log a warning on every use.

A naming trap worth keeping in mind: `resolve()` echoes back whatever name it is given, so comparing its returned id to a definition's proves nothing — check membership in `available()`. A test of mine passed while broken for exactly that reason.

## Sign-in fix, the auth surface, and the /app backdrop grid (2026-08-27)

**Signed-out `/app` went to Clerk's hosted portal** (`fluent-eft-4786.accounts.dev`) instead of `/sign-in`. `auth.protect()` runs in middleware and reads its sign-in path from the `clerkMiddleware` options or `NEXT_PUBLIC_CLERK_SIGN_IN_URL`; the `signInUrl` prop on `ClerkProvider` only covers client components. Both paths are now passed in code, plus `signInFallbackRedirectUrl="/app"` / `signUpFallbackRedirectUrl="/onboarding"`, so env is no longer load-bearing. Diagnose Clerk in a browser (`research/firecrawl-capture/probe-clerk-signin.mjs`) — `curl` without `Accept: text/html` gets Clerk's non-page 404 rewrite, which is not what a person sees.

**Auth surface.** `AuthFrame` now carries the hero's `GridCells` (crosshairs, markers, ✦ nodes, clusters), masked clear behind the Clerk card, plus two new ambient pieces in `components/marketing/ocean.tsx`: `AsciiOcean` (a three-sine height field rendered as glyphs, violet crests on an ink swell, along the bottom) and `AsciiWave` (one travelling sine beside the title). Same contract as `AsciiHelix` — one 12fps ticker, paused off-screen, settled frame under reduced motion, hidden below `lg`. `useInView` is exported from `ambient.tsx` for them.

**/app grid is one shell-level backdrop**, not per page. `app-shell.tsx` mounts `AppGrid` (now with `sparkles`, pinned ✦ nodes from row 3 down) as `sticky top-0 z-[-1] h-0` inside `main.isolate.[container-type:size]`, sized `h-[100cqh]`. Three details are load-bearing: sticky with zero height takes no space; `cqh` sizes it to the scroll area rather than the viewport; `z-[-1]` inside `isolate` paints it below in-flow content. The first attempt — a `min-h-full` wrapper around children — put the absolutely positioned grid *above* any page whose root was not positioned (absolute siblings paint over in-flow blocks regardless of DOM order) and broke `PageFrame`'s own `min-h-full`, so the overview's column borders stopped at content bottom. `PageFrame` and the agent page no longer mount their own grid; pages that bypass `PageFrame` paint `bg-background` on their content panel, the contract `FrameRow` already follows.

## Conventions

- Tokens: WEBSITE.md §3. Marketing = Firecrawl-structured light theme in violet; app = DESIGN.md dark.
- Claims guard (WEBSITE.md §11) applies to every user-facing string.
- Stage by name, commit to main, no AI co-author trailer.
