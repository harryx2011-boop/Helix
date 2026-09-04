# Landing revamp 2 — Helix 1.6.0

Decided 2026-09-03 via 12 questions plus four mid-turn asks. Supersedes the Helix section of `E:\landing-revamp-plan.md` where they conflict. Reference: firecrawl.dev (nav, playground prompt box, playground result view).

Baseline: 1.5.0 (`8498e23`). Seven bands, Performance bento, meters, all six capability pages on the bento.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Which 2x2s break | Performance, Self-host claims, Setup. **Hard Parts stays side by side** (icons only). |
| 2 | Performance layout | **1 + 3 asymmetric bento.** Full-width hero cell (Cheapest tier wins, big tier meter), then three narrow cells in one row. |
| 3 | Self-host claims | **Ledger table.** Four hairline rows: icon tile + lead, one-line rest, evidence chip right-aligned. Same row vocabulary the rest of the page uses. |
| 4 | Hard Parts | Keep the two demo cards. |
| 5 | Icon style | **Lucide, literal glyphs, in a 28px tile** (`rounded-card bg-violet-4`, 16px icon, stroke 1.75, violet). One shared `IconTile`. |
| 6 | Cpu icon | **On the `[ 03 / 07 ] PERFORMANCE` band.** Every band gets an icon (table below). |
| 7 | Other swaps | My call (table below). |
| 8 | Nav | Firecrawl structure: **Capabilities ▾ · Status · Docs ▾ · Utilities ▾** (Utilities holds Persona). GitHub with star count, then Sign in / Open app. |
| 9 | Status page | **`/status`, live `/health` per service, 90-day bars**, uptime samples stored on the API. |
| 10 | Animations | All four: CodeRain behind every heading · hero request types itself · scroll-scrubbed code strips · live meters. |
| 11 | Hero pills | **Firecrawl segmented track** with group labels (DISCOVER / EXTRACT / CRAWL) above. |
| 12 | Prompt box | Firecrawl playground box: input row, sub-option pills, toolbar with icon buttons + Get code + primary CTA. Shared by hero and `/app`. |
| + | Result view | Playground result styled like Firecrawl's map result: back / favicon+host / share bar, title + count + Debug + JSON download, Links/JSON tabs, numbered mono list. |
| + | Version | **1.6.0** (new page, new API route, new nav). One commit, pre-commit review chain. |

## Icons

Tile component: `components/marketing/icon-tile.tsx`. `<IconTile icon={Cpu} />` → 28px square, `rounded-card`, `bg-violet-4`, icon 16px `text-violet` stroke 1.75. Used by BentoCard, ledger rows, Hard Parts cards, Use Cases list, Setup cards, nav menu items. The 14px inline eyebrow icon goes away everywhere.

Band icons (FrameBand gets an `icon` prop, drawn 14px before the `[ 01 / 07 ]` text):

| Band | Icon |
|---|---|
| 01 Capabilities | `Braces` |
| 02 Hard Parts | `FileStack` |
| 03 Performance | **`Cpu`** |
| 04 Setup | `Plug` |
| 05 Self-host | `Server` |
| 06 Use cases | `Bot` |
| 07 Get started | `Terminal` |

Cell / row icons:

| Where | Was | Now |
|---|---|---|
| Performance · Cheapest tier wins | Layers | `Layers` (tiers are layers; keep) |
| Performance · Token-efficient | Coins | **`Coins`** (keep, now in a tile) |
| Performance · Honest about blocks | ShieldAlert | `OctagonX` |
| Performance · Adaptive politeness | Gauge | `Activity` |
| Self-host · Every tier included | ShieldCheck | `PackageCheck` |
| Self-host · Your keys | KeyRound | keep |
| Self-host · Apache-2.0 | Scale | keep |
| Self-host · Cost before commit | Calculator | `Receipt` |
| Hard Parts · Docs to data | FileText | `FileStack` |
| Hard Parts · Structured out | Braces | keep |
| Use cases · Fresh context | SquareStack | `RefreshCw` |
| Use cases · Tools for agents | Bot | `Wrench` |
| Use cases · Deep research / Onboarding | Search / UserPlus | keep |
| Capability pages | catalog icons | unchanged; rendered through IconTile |

## Sections

**Hero.** Group labels row (`DISCOVER · EXTRACT · CRAWL`, mono 11px, `text-m-ink/48`, aligned over their pills) sits above one segmented track: `bg-m-surface rounded-pill p-1`, active pill `bg-white shadow-card-sm text-m-ink`, inactive `text-m-ink/56`, hairline dividers between inactive neighbours, 12px icons, no wrap at lg. Pills: Search | Scrape · Parse | Map · Crawl (Interact, Monitor, Metadata stay in the Capabilities menu). Under it the shared PromptBox (below). The request panel types itself (`AnimatedCode mode="type"`) then the response scrambles in; both restart on tab change.

**01 Capabilities.** Unchanged layout. Tab strip adopts the segmented track styling so the page has one pill design.

**02 Hard Parts.** Unchanged pair. Eyebrow icons become tiles. CodeRain added behind the heading.

**03 Performance.** `sm:grid-cols-3`. Hero cell `col-span-3`: tile + eyebrow + lead on the left, `MeterPanel` tier rows on the right at full width. Row two: Token-efficient, Honest about blocks, Adaptive politeness, each `col-span-1`. BentoCard `span` becomes `'hero' | 'third'`; capability pages keep their own wide/narrow mapping or move to the same two values (decide in-build, keep them compiling). Meters get `live` (drift while in view; reduced motion pins).

**04 Setup.** Tab strip gains a fifth tab `Agent` carrying the Skill/MCP toggle; the "One command" card dissolves into it. Request/response pair stays (it is the page's pattern). Below, one full-width band "Agent onboarding": prompt panel, cURL line, link. No second 2-col row. CodeRain to the right of the left-aligned heading.

**05 Self-host.** Terminal replay stays. Claims become a `Ledger` (`components/marketing/ledger.tsx`): hairline rows, `grid-cols-[28px_1fr_auto]` at sm, stacked at xs. Evidence chip mono 12px in `bg-m-bg rounded-card`.

**06 Use cases.** Unchanged split. List icons become tiles. CodeRain behind heading.

**07 Get started.** Unchanged.

**Between sections.** `ScrollStrip`: one thin token stream per band, translateX bound to scroll progress via the existing reveal observer plus a `scroll` listener throttled to rAF. Static under reduced motion. Three of them (after 02, 04, 06), not seven.

## Nav

`components/marketing/nav.tsx` rewrite. Height and hairline stay. Mega-menus open on hover and click, close on Escape and outside click, `aria-expanded`, arrow keys within the menu.

- **Capabilities ▾**: full-width panel under the bar, left 2/3 = two columns of the six products grouped by catalog `group` (EXTRACT, DISCOVER, CRAWL, ACT, WATCH), each row tile + name + tagline; right 1/3 = Open Source panel (logo tile, "Helix is Apache-2.0. Star it to say thanks.", `See GitHub` row).
- **Status**: plain link → `/status`.
- **Docs ▾**: API reference `/docs`, Self-host guide `/self-host`, CLI `/docs/cli`, MCP `/docs/mcp`, Agent onboarding `/agent-onboarding/SKILL.md`, `llms.txt`.
- **Utilities ▾**: Persona (`NEXT_PUBLIC_PERSONA_URL`, port 4200 in dev), Playground `/app`, Metadata scanner `/metadata`.
- Right: GitHub mark + star count (fetched server-side at build with `next: { revalidate: 3600 }`, falls back to the word "GitHub" when the repo is private or the fetch fails), then Sign in (hosted) / Open app.
- Mobile: same four groups as accordions.

## Status page

Route `app/(marketing)/status/page.tsx`, client component polling.

API side (`apps/api`):
- `/health` grows per-service `latencyMs` and a `lightpanda` entry when enabled. Version string reads from the manifest instead of the literal `'1.5.0'`.
- Migration `009_uptime_samples.sql`: `uptime_samples(service text, sampled_at timestamptz, ok boolean, latency_ms int)`, index on `(service, sampled_at)`.
- A sampler in the API process runs the health checks every 60s and inserts one row per service. Retention 90 days, pruned on each run.
- `GET /status/history?days=90` (open prefix, no key): per service, per day `{ day, ok_pct, p50_ms }`. Cached 60s.

Page:
- Header: overall state pill (operational / degraded / down) from the latest `/health`.
- One row per service: dot, name, current latency, 90 daily bars (`bg-success`, `bg-warning` under 99%, `bg-destructive` under 95%, `bg-m-ink/12` no data), uptime % right.
- Incidents block: "No incidents in the last 90 days" derived from samples (any day under 95% lists as an incident with its date). No incident table yet.
- Hosted mode without an API: card explaining the hosted app has no instance behind it yet, plus an instance URL field (localStorage) that points the page at a self-host `/health`.
- Polls `/health` every 30s while the tab is visible; history once on load.

## Prompt box and result view

`components/playground/prompt-box.tsx` becomes the one box, used by the hero and `/app`:
1. Input row: endpoint-specific placeholder, mono, `Globe` at left.
2. Sub-option pills (per endpoint, from a `SUB_OPTIONS` map: Scrape → markdown / json / screenshot; Search → web / news / images; Parse → auto-OCR / force; Crawl → estimate first; Map → include subdomains).
3. Toolbar: left `SlidersHorizontal` (options) and `FileUp` (parse/metadata only) in 36px outlined squares; right `Get code` secondary + primary `Start scraping` (label from `RUN_LABEL`).
Hero passes a no-op `onSubmit` that routes to `/app` with the prefilled value.

`components/playground/results.tsx` result chrome:
- Top bar: `Go back` pill left, favicon + host centered, `Share` pill right.
- Title block: host as h3, count line ("4671 URLs"), right `Debug issue` (`Sparkles`) and `JSON` download pill.
- Tabs: Links / JSON (or Markdown / JSON for scrape), pill tabs with icon.
- Body: numbered mono list, line numbers `text-m-ink/40`, 1px hairlines between the bar, tabs and body.

## Phases

1. **Foundations** — `icon-tile.tsx`, `ledger.tsx`, FrameBand `icon`, segmented track styles, IconTile in BentoCard. Nothing visible breaks.
2. **Sections** — Performance 1+3, Self-host ledger, Setup Agent tab + onboarding band, Hard Parts / Use cases tiles, CodeRain behind headings.
3. **Hero + playground** — shared PromptBox, group-labelled pills, typing request, result chrome.
4. **Nav** — four groups, star count, mobile accordions.
5. **Status** — API migration, sampler, history route, `/status` page.
6. **Motion** — ScrollStrip, live meters, `review-animations` pass.
7. **Ship** — `interface-review` → `review-animations` → tastemaker anti-slop → ui-anti-vibe checklist; screenshots 1440 / 390; version 1.6.0 in the root manifest, `/health` version, `context.md` header; one commit to main.

Phases 2, 3, 4 and 5 touch disjoint files and run in parallel after phase 1.

## Files

- `components/marketing/`: `icon-tile.tsx` (new), `ledger.tsx` (new), `scroll-strip.tsx` (new), `section-frame.tsx`, `bento.tsx`, `meter.tsx`, `performance.tsx`, `self-host-promise.tsx`, `setup-guides.tsx`, `hard-parts.tsx`, `use-cases.tsx`, `hero.tsx`, `hero-panel.tsx`, `nav.tsx`, `capabilities.tsx`
- `components/playground/`: `prompt-box.tsx`, `results.tsx`
- `app/(marketing)/status/page.tsx` (new), `app/(marketing)/layout.tsx` (nav)
- `lib/catalog.ts` (groups already exist), `lib/github-stars.ts` (new)
- `apps/api/src/routes/health.ts`, `apps/api/src/routes/status.ts` (new), `apps/api/src/status/sampler.ts` (new), `apps/api/migrations/009_uptime_samples.sql` (new), `apps/api/src/auth` open prefixes
- `package.json` version, `context.md`

## Not doing (landing)

Pricing, Blog, testimonials, FAQ (dead list holds). Incident authoring UI. Real benchmark numbers behind the meters (separate follow-up against usage tables).

---

# Part 2 — every other page

Added 2026-09-03 from seven reference shots (playground box, format picker, recent runs, dashboard overview, crawl result, Products mega-menu, footer) and a browser drive over firecrawl's subdomains.

## The scan

**What ran.** `research/firecrawl-capture/drive-subdomains.mjs`: reads `www.firecrawl.dev/sitemap.xml` (610 URLs), groups by first path segment, then one headless Chromium scrolls every target page end to end and dumps headings, nav, footer, grid shapes and a full-page screenshot. Output: `research/firecrawl-capture/out/subdomains/` (23 pages, `index.json`, `sitemap-segments.json`).

**Why not a Helix instance.** The API refuses to boot without `DATABASE_URL`, and this machine has neither Docker nor a local Postgres. The Playwright drive is the substitute. Once an instance exists, the sitemap fetch in the script becomes `POST /v1/map { "url": "https://firecrawl.dev", "includeSubdomains": true }` and the drive reads the map result instead; nothing else changes.

**Subdomains found.**

| Host | What it is | Helix equivalent |
|---|---|---|
| www.firecrawl.dev | Next marketing site. Sitemap: blog 314, glossary 232, one each for products, pricing, playground, changelog, use-cases, tools, alternatives, brand, about | the dashboard app's `(marketing)` group |
| docs.firecrawl.dev | Mintlify. Sidebar groups: Get Started, Core Endpoints, More, Quickstarts, Developer Guides, Webhooks, Use Cases. "On this page" rail. | `/docs` |
| status.firecrawl.dev | Better Stack. Big check, "All services are online", last-updated line, per-service 90-day bars, Previous incidents with dated Resolved cards | `/status` |
| community.firecrawl.dev | Discourse | GitHub Discussions link, no page |
| api.firecrawl.dev | bare API root | `/health` |
| mcp.firecrawl.dev | redirect to docs | `/docs/mcp` |
| /templates | redirect to the GitHub org repo list | `/docs/examples` linking the repo |
| /cli, /sdks | 404 | keep ours at `/docs/cli`, `/docs/sdks` |

**Home nav, verbatim from the drive:** Products · Resources · Pricing · Docs · Blog · Playground · star count · Sign up. Footer columns: Products / Use Cases / Documentation / Company, then a bottom row ending in an "All systems normal" status dot.

## Nav, refined (reference image 6)

The Capabilities panel is two hairline columns, not a list:

- **Endpoints** column: Scrape (chips: `URLs ↗` `Documents ↗` `Metadata ↗`), Search, Crawl (chips: `Crawl ↗` `Map ↗`), Interact, Monitor (`New` pill), Agent (`Research preview` pill, → `/app/agent`). Each row: catalog icon tile, name, one-line tagline, optional chip row. Chips are `rounded-card bg-m-ink/[0.039] font-mono text-[11px]` with a 10px `ArrowUpRight`.
- **Surfaces** column: MCP, CLI, API, SDKs, Skills. Real marks where a third party is named (none here; these are Helix surfaces, Lucide is fine).
- Column headers ("Endpoints", "Surfaces") are 13px `text-m-ink/56` in a hairline header row, not eyebrows over headings.

Status, Docs ▾ and Utilities ▾ as decided in part 1. Utilities gains **Converter** (`apps/converter`, the website-to-markdown tool) alongside Persona, Playground and the Metadata scanner. Firecrawl's "Free Tools" page is the analogue.

## Footer (reference image 7)

Hairline table, every cell bordered, no gaps: **Capabilities** (six endpoints, Playground, Changelog, Converter) · **Use cases** (Deep research, Fresh context for chats, Tools for agents, Onboarding from a URL, Metadata scrub) · **Documentation** (Getting started, API reference, Integrations, Examples, SDKs) · **Project** (GitHub, Licence, Architecture, Security, Status). Bottom row: copyright, Terms, Privacy, and a live status dot reading from `/health` ("All systems normal" → `/status`). The ambient helix and grid stay.

## App: Playground (reference images 1, 2)

`components/playground/prompt-box.tsx` rebuilt as the shared box (part 1 §Prompt box), with these specifics from the shots:

- Input row: a `https://` prefix chip (`bg-m-ink/[0.039] rounded-card font-mono`) that hides for Search; the value is the bare host/path. Placeholder cycles as today.
- Toolbar left: `SlidersHorizontal` (opens the existing Options panel), `Sparkles` (toggles the JSON-extraction prompt field; the Firecrawl button is their agent prompt), then a **Format** dropdown button (`FileText` + "Format: Markdown" + chevron).
- Toolbar right: `Get code` secondary, primary run button labelled from `RUN_LABEL`.
- **Format picker** (image 2): popover under the toolbar, title "Format" with a close button, 4-column grid of cards. Each card is a 120px illustration tile (`bg-m-ink/[0.06]`, radius `rounded-card`) with a schematic drawn in CSS (a page, a bullet list, `<html>` mono lines, a viewport frame, braces), the name below, and a sub-variant line for HTML (`Cleaned · Raw`) and Screenshot (`Viewport · Full page`). Selected card shows a violet check badge top-right. Multi-select. Helix set: Markdown, Links, HTML, Screenshot, JSON, Metadata, Summary if the API grows it (it does not today; leave it out rather than stub it).
- Group labels (DISCOVER / EXTRACT / CRAWL / ACT / WATCH) sit above the segmented endpoint track, from `TAB_GROUPS`.

## App: Results (reference image 5 and the map shot)

`components/playground/results.tsx` gets one chrome for every kind, then per-kind bodies:

1. **Identity bar**: `SiteIcon` + host centred, `Share` pill right (copies a `/app/playground?tab=&url=` link; hosted mode later a stored-run URL). For map/crawl a `Go back` pill on the left returns to the prompt.
2. **Fact cells**: hairline `FrameCells` with Endpoint (icon + name) and Status (`CircleCheck` in `text-success` + "Success", or the `FailurePanel` reason), plus Started and Tier for scrape.
3. **Results header**: "Results" with a muted count in parentheses ("Results (10)", "4671 URLs"), one-line hint, right-aligned `Debug issue` (`Sparkles`; opens the failure panel's signals and copies the request id) and download pills per format present (`Markdown`, `JSON`, `Links`).
4. **Numbered list** for search and map: `#1` in violet mono, title, URL in `text-m-ink/56`, hairlines between.
5. **Tabs**: Markdown / JSON (or Links / JSON for map) as pill tabs with icons; the Markdown tab carries a `~93% tokens` chip computed from raw HTML bytes vs markdown bytes when the API returns both. Body: mono, line numbers `text-m-ink/40`, hairline above.

## App: Recent runs (reference image 3)

New block under the playground and on Overview. Cards in a hairline grid (`FrameCells`, 3 per row at lg): header row favicon + host + `ArrowUpRight`, then label/value rows Endpoint (icon + name), Status (check + Success), Started (date, time muted below), Formats (chips or "No formats selected"). A rail above the grid: two thin pill lines with a dot between, the decorative divider in the shot, drawn once as `RunsRail`. Source: `lib/run-history.ts`, last 20 runs in localStorage for self-host; hosted mode reads the Supabase `runs` table when it exists. Click reopens the run in the playground.

## App: Overview (reference image 4)

`overview-client.tsx` rebuilt to the reference:

- **Explore our endpoints**: one hairline row of four cells (Search, Scrape, Interact, Crawl) with icon tile, name, `New` pill where relevant, two-line description; the other endpoints reach via the sidebar. Heading and subline in a bordered header row above.
- **Requests, last 7 days**: `CharChart` finally mounted, glyph area chart with the total top-right, x-axis dates. Data from a new `GET /v1/usage?days=7` (see API). Hosted mode without an API shows the chart empty with the zero.
- **Concurrent browsers `[ LIVE ]`**: ring counter "0 of 4 active browsers", polling `/health`'s browser stats every 10s.
- Right column: **API Key** card (masked value in violet mono, eye and copy buttons; unchanged data path) and **Agent integrations** card with a `Set up an agent` primary button, SKILL.md row (`View` link + `Copy`), CLI snippet row with copy, MCP block with the URL and the one-line explanation.
- Sidebar (`sidebar-nav.tsx`), verbatim target: Overview · PLAYGROUND: Search the web, Scrape a web page, Interact with a page, Parse a file, Crawl entire website (expands: Map all website links, Crawl entire website), Monitor the web `New`, Scan a file's metadata · RESEARCH PREVIEW: Agent · INSTANCE: Health, Settings · ACCOUNT: Activity logs, Usage, API keys. Footer: an instance meter (requests today vs the per-key rate limit, violet bar) replacing Firecrawl's credits, user chip, Collapse. Firecrawl's "Upgrade" slot becomes `GitHub`.
- Top bar: instance pill left (already `WorkspacePill`), right: bell (still disabled), theme toggle, Help, Docs, GitHub.

## App: Activity logs and Usage (new routes)

- `/app/activity`: table of runs across every key on the instance: time, endpoint, URL, status, tier, duration, bytes. Filters by endpoint and status, 50 per page. Source `GET /v1/activity` (new, admin-token or key-scoped).
- `/app/usage`: `CharChart` at 7 / 30 days, then a per-endpoint hairline table (requests, failures, p50). Source `GET /v1/usage`.
- `/app/self-host/health` stops being a placeholder: it renders the same rows as `/status` for this instance, plus provider configuration from `/health`.

API side: `apps/api/src/routes/usage.ts` (new) over a `request_log` table (migration `010_request_log.sql`: key id, endpoint, host, status, tier, duration_ms, bytes_in/out, created_at; 30-day retention; written by an `onResponse` hook, never the body). `/status` history (part 1) and usage share the sampler process.

## Capability pages (`/scrape` … `/monitor`)

Firecrawl's structure per product page: hero with H1 and subline, two-line "results your AI needs" H2, six h3 feature cells, "Built into the AI tools you already use", pricing, FAQ. Helix keeps `CapabilityPage` and changes:

- Feature bento moves to the same 1+3 or ledger vocabulary as the landing; icons through `IconTile`.
- Add a **"Built into the tools you already use"** band reusing the Setup section's Agent tab (Skill / MCP snippet) so every capability page ends with a working wire-up, not a CTA pair.
- Add `/metadata` as a seventh capability page (the catalog has it, the marketing group does not).
- No pricing, no FAQ.

## Docs

Mirror the Mintlify shape on our static pages: a left sidebar with groups Get started · Endpoints (seven) · Surfaces (MCP, CLI, Skills, SDKs) · Self-host · Reference; an "On this page" rail from the rendered h2s; a "Ready to build?" card at the foot of every page linking the playground. Layout `docs/layout.tsx` (new), content unchanged.

## New marketing pages

- `/use-cases`: Firecrawl's is twelve alternating rows (mono eyebrow, h2, two lines, `Learn more`, a product mock on the other side). Helix ships five rows from real endpoints: Deep research, Fresh context for chats, Tools for agents, Onboarding from a URL, Metadata scrub. Mocks reuse `AnimatedCode`, `MeterPanel` and the Hard Parts demos.
- `/changelog`: one page, newest first, `v1.x.y` + date + Highlights list + a `New` / `Fixed` split. Source: a root `CHANGELOG.md` read at build like `architecture/page.tsx` reads `ARCHITECTURE.md`; the file is created from `git log` once and then maintained per version bump (same rule as Cortex's blog).
- `/status`: as part 1, styled to the Better Stack capture: large check, "All services are online", "Last updated" line, "Current status by service" card with an Operational pill, per-service bars with a "90 days ago / Today" axis, Previous incidents list with a Resolved chip and dated update cards. Sub-nav pills Status · Incidents.

## Not building

Blog, glossary, alternatives, pricing, brand page, about, careers, ambassadors, affiliates, student program, testimonials, FAQ, Discourse. Templates as a page (a link to the repo's examples folder instead). The `Summary`, `Branding` and `Images` formats until the API has them.

## Phases and versions

Part 1 ships as **1.6.0**. Part 2 splits:

- **1.7.0 — the app.** Prompt box + format picker, results chrome, recent runs, overview, sidebar, activity and usage routes, `request_log` migration and usage route, health page. Files: `components/playground/*`, `components/app/*`, `app/(app)/app/{page,activity,usage,self-host/health}`, `apps/api/src/routes/{usage,status}.ts`, migrations 009–010.
- **1.8.0 — the site.** Nav Endpoints/Surfaces panel, footer table with status dot, docs layout with sidebar and rail, `/use-cases`, `/changelog`, `/metadata` capability page, capability-page bento and tools band. Files: `components/marketing/{nav,footer,pages/capability-page}.tsx`, `app/(marketing)/{use-cases,changelog,metadata,docs/layout}.tsx`, `CHANGELOG.md`.

Each version: `interface-review` → `review-animations` → tastemaker anti-slop → ui-anti-vibe checklist, screenshots at 1440 and 390 for every touched route, one commit to main, `context.md` and the `/health` version string in the same commit.
