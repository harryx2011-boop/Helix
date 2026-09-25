# Helix — Website & App Plan

**Status:** decided, build starting · **Date:** 24 August 2026 · **Owner:** Harry

This is the plan for `helix.dev`: the marketing site, sign-in, onboarding, the `/app` dashboard, the agent surfaces (MCP, CLI, SKILL.md), and the six-API catalog. It restates decisions; the evidence lives in `research/`. Companion documents: [DESIGN.md](DESIGN.md) (tokens, character motif), [ARCHITECTURE.md](ARCHITECTURE.md), [openapi.yaml](openapi.yaml), [MILESTONES.md](MILESTONES.md).

Evidence base (do not duplicate here, read on demand):

| File | What it holds |
|---|---|
| `research/10-site-ia.md` | Firecrawl route families, nav, footer, docs structure |
| `research/11-firecrawl-visual-system.md` | Measured tokens: colour, type scale, radii, shadows, motion, texture |
| `research/12-firecrawl-copy-conversion.md` | Section ledger with verbatim copy, voice analysis, CTA ladder |
| `research/13-helix-marketing-assets.md` | What Helix can truthfully claim; frame sequences; claims we cannot make |
| `research/14-firecrawl-interaction-motion.md` | Hover deltas, scroll behaviour (none), hero keyframes, breakpoints |
| `research/15-api-surface-landscape.md` | Competitor endpoint catalogs, unclaimed space |
| `research/16-endpoint-feasibility.md` | Infrastructure inventory, new-endpoint effort estimates |
| `research/api-specs/*.md` | The six API specs (scraping, parsing, search, crawling, browser interaction, monitoring) |
| `research/firecrawl-capture/out/` | Screenshots + token/structure JSON for 15 firecrawl.dev routes (git-ignored) |

84 decisions were taken across two question sessions (44 on the landing page, 40 on the app and catalog). Where a later decision revised an earlier one, the later one stands and the revision is noted.

---

## 1. Product model

**Hosted app plus self-host, one codebase.** `helix.dev` works the way `firecrawl.dev` does: sign up, receive a key, run requests from the dashboard against a hosted Helix instance. Self-hosting remains available and fully featured; nothing is withheld from the self-host build. This revises FRONTEND.md's "no accounts" stance: that stance now describes the self-host build mode of the same app.

| Surface | Where | Port |
|---|---|---|
| Marketing site + auth + `/app` dashboard | `apps/dashboard` (one Next.js app) | 3400 |
| Hosted Helix API | `apps/api` deployed | 7400 locally |
| Self-host build | same `apps/dashboard`, `HELIX_HOSTED` unset | 3400 |

The earlier plan for a separate `apps/web` on port 3500 is withdrawn; the 3500 block is released.

**Two build modes of one app.**

| | Hosted (`HELIX_HOSTED=1`) | Self-host (default) |
|---|---|---|
| Auth | Clerk (GitHub, Google) | Local API key gate (existing `api-key-gate.tsx`) |
| Users/keys store | Supabase | The instance's own Postgres via `/v1/keys` |
| Marketing routes | Served | Served (static; the operator can disable with `HELIX_MARKETING=0`) |
| Next output | Server (Clerk middleware needs it) | `output: 'export'`, served by Fastify at `/` |
| Playground backend | Hosted `apps/api` via route handlers | `NEXT_PUBLIC_HELIX_API_URL` direct |

The mode switch lives in `next.config.ts` and one `lib/mode.ts`; components never branch on it directly, they consume a `useSession()` abstraction that returns the same shape from Clerk or from the local key provider.

**Playground backend is real.** Requests from `/app` hit a deployed `apps/api`. Endpoints that are not yet implemented (`/parse`, `/interact`, `/monitor`) show a "coming" state in the playground until their workflow lands; they never return fabricated results.

---

## 2. Site map

### Marketing (light theme)

| Route | Purpose | Notes |
|---|---|---|
| `/` | Landing page | §4 |
| `/scrape` `/parse` `/search` `/crawl` `/interact` `/monitor` | One page per API | Shared template, §5 |
| `/docs` `/docs/[...slug]` | Documentation, built into this app | MDX; API reference generated from `openapi.yaml` |
| `/architecture` | ARCHITECTURE.md rendered | Engineer-facing, linked from nav |
| `/self-host` | The self-host guide | The biggest open positioning gap in the category; gets its own page and a SELF-HOST group in the app |
| `/agent-onboarding/SKILL.md` | Public, ungated agent onboarding | Plain markdown response |
| `/llms.txt` | Index of every `.md` twin | Category convention |
| `/*.md` | Markdown twin of every marketing and docs page | Same content, no chrome |

No pricing page (billing lives in the app's Usage tab), no public playground (dashboard only), no blog or changelog yet, no comparison pages. Nav: **Capabilities ▾ · Docs · Architecture · GitHub · Sign in**.

### Auth

| Route | Purpose |
|---|---|
| `/sign-in` `/sign-up` | Clerk components, GitHub + Google OAuth, email fallback |
| `/onboarding` | Five-step wizard, one time, gated to first sign-in |

### App (dark theme, Clerk-gated)

| Route | Sidebar entry |
|---|---|
| `/app` | Overview |
| `/app/playground?tab=search` … | PLAYGROUND: Search, Scrape, Parse, Crawl, Interact, Monitor |
| `/app/self-host` `/app/self-host/instances` | SELF-HOST: Guide, Instances |
| `/app/activity` | ACCOUNT: Activity Logs |
| `/app/usage` | ACCOUNT: Usage |
| `/app/keys` | ACCOUNT: API Keys |
| `/app/settings` | ACCOUNT: Settings |

### Agent surfaces

| Surface | Form |
|---|---|
| MCP | `https://mcp.helix.dev/v1`, HTTP transport, OAuth via Clerk (bearer key accepted as fallback) |
| CLI | `npx -y @helix/cli@latest init --all -k helix-…` |
| SKILL.md | Generated per user from the endpoints chosen in onboarding; also the public `/agent-onboarding/SKILL.md` |

---

## 3. Design system

Two themes, one component set. Marketing is a close visual homage to firecrawl.dev in Helix's palette; the app is Helix's own dark instrument (DESIGN.md), which is also how Firecrawl's own app relates to its site.

### 3.1 Shared

| Decision | Value | Source |
|---|---|---|
| Sans | **Geist** (weights 400 / 450 via variable axis / 500). No 600/700 anywhere; headings get weight from size. | 11 §2, decision |
| Mono | **Geist Mono**. Load-bearing: box-drawing glyphs must be full-width or every diagram misaligns. | DESIGN.md §5 |
| Icons | **lucide-react**, sized to the adjacent text's line-height (16px icon beside 14px text, 20px beside 16px). | decision |
| Radii | Sharper than the reference: **pill 999px** (buttons, badges, tabs), **card 6px**, **panel 8px**. Nothing else. | decision |
| Tracking | Inverse to size: hero −0.52px, H2 −0.4px, H3 −0.24px, body +0.14px, uppercase micro-labels +0.8px. | 11 §2 |
| Leading | Headings 1.05–1.1, body 1.5. | 11 §2 |
| Container | **1112px**, 16px minimum gutter (`min(100% - 32px, 1112px)`). | 11 §3 |
| Easing | `cubic-bezier(0, 0, 0.2, 1)` everywhere. Durations 150 / 200 / 300 / 400ms. | 11 §5 |
| Hover, buttons | No transform. Primary: the 2px/4px shadow layer doubles to 4px/8px. Secondary: background alpha 3.9% → 5.9%. | 14 §1 |
| Hover, cards | Background tint 3.1% ink; a hidden "Learn more" link fades in over 150ms. | 14 §1 |
| Scroll reveal | Subtle fade-up on section entry: 300ms, 8px rise, 60ms sibling stagger. (The reference has none; this is a deliberate divergence.) | decision |
| Breakpoints | Nav → hamburger and 3-up grids → horizontal flex-scroll row at `lg` (1024px). Character-art panels always sit in their own `overflow-x: auto` container. | 14 §6, decision |
| Reduced motion | Every animation renders its settled frame; the idle glyph becomes static text. Character-grid animations pause when off-screen (IntersectionObserver). | DESIGN.md §6 |
| Uppercase labels | Mono, +0.8px tracking, bracketed: `[ 01 / 05 ]`, `[ LIVE ]`, `STEP 3 OF 5`. | reference |

### 3.2 Marketing theme (light)

Firecrawl's structure with the orange swapped for violet, `#262626` swapped for Helix's near-black, and the "heat" alpha ramp reproduced as a violet ramp.

```css
:root[data-surface="marketing"] {
  --m-bg:            #F9F9F9;   /* page */
  --m-bg-lighter:    #FBFBFB;
  --m-surface:       #FFFFFF;   /* cards, nav, panels */
  --m-ink:           #0B1220;   /* text; secondary via alpha 88/72/64/56/48/40/32 */
  --m-border-faint:  #EDEDED;
  --m-border-muted:  #E8E8E8;
  --m-border-loud:   #E6E6E6;
  --m-illus-faint:   #EDEDED;   /* hairline grid, character texture */
  --m-illus-muted:   #E6E6E6;
  --m-illus-default: #DBDBDB;

  --violet-100: #7C3AED;         /* accent, AA on white (DESIGN.md light) */
  --violet-90:  #7C3AEDE6;
  --violet-48:  #7C3AED7A;
  --violet-40:  #7C3AED66;
  --violet-24:  #7C3AED3D;
  --violet-20:  #7C3AED33;
  --violet-16:  #7C3AED29;
  --violet-12:  #7C3AED1F;
  --violet-8:   #7C3AED14;
  --violet-4:   #7C3AED0A;
  --violet-hover: #6D28D9;
  --violet-deep:  #5B21B6;

  --tier-plain: #9061F9; --tier-tls: #8B5CF6; --tier-lightpanda: #7C3AED; --tier-chromium: #5B21B6;

  --shadow-card:    0 40px 48px -20px rgba(0,0,0,.02), 0 32px 32px -20px rgba(0,0,0,.03), 0 16px 24px -12px rgba(0,0,0,.03), 0 0 0 1px rgba(0,0,0,.03);
  --shadow-card-sm: 0 8px 16px -8px rgba(0,0,0,.06), 0 2px 4px -2px rgba(0,0,0,.03);
  --shadow-btn:     inset 0 -6px 12px rgba(91,33,182,.20), 0 2px 4px rgba(124,58,237,.12), 0 1px 1px rgba(124,58,237,.12), 0 .5px .5px rgba(124,58,237,.16), 0 .25px .25px rgba(124,58,237,.20);
  --shadow-btn-hover: inset 0 -6px 12px rgba(91,33,182,.20), 0 4px 8px rgba(124,58,237,.12), 0 1px 1px rgba(124,58,237,.12), 0 .5px .5px rgba(124,58,237,.16), 0 .25px .25px rgba(124,58,237,.20);
  --ring-cutout:    0 0 0 8px #F9F9F9;   /* halo around floating panels */
}
```

Every elevated surface's shadow ends in a `0 0 0 1px` hairline that doubles as its border. Gradients are fade masks at section edges only (`linear-gradient(#fff, transparent)`), never colour washes. No glow, no noise, no mesh.

Tailwind extension (marketing):

```ts
theme.extend = {
  colors: {
    m: { bg: 'var(--m-bg)', surface: 'var(--m-surface)', ink: 'var(--m-ink)',
         border: { faint: 'var(--m-border-faint)', muted: 'var(--m-border-muted)', loud: 'var(--m-border-loud)' } },
    violet: { DEFAULT: 'var(--violet-100)', 90: 'var(--violet-90)', 48: 'var(--violet-48)', 24: 'var(--violet-24)',
              12: 'var(--violet-12)', 8: 'var(--violet-8)', 4: 'var(--violet-4)', hover: 'var(--violet-hover)', deep: 'var(--violet-deep)' },
    tier: { plain: 'var(--tier-plain)', tls: 'var(--tier-tls)', lightpanda: 'var(--tier-lightpanda)', chromium: 'var(--tier-chromium)' },
  },
  fontFamily: { sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui'], mono: ['var(--font-geist-mono)', 'ui-monospace'] },
  fontWeight: { normal: '400', medium: '450', semibold: '500' },
  letterSpacing: { tightest: '-0.52px', tighter: '-0.4px', tight: '-0.24px', normal: '0.14px', wide: '0.8px' },
  borderRadius: { pill: '999px', card: '6px', panel: '8px' },
  maxWidth: { container: '1112px' },
  boxShadow: { card: 'var(--shadow-card)', 'card-sm': 'var(--shadow-card-sm)', btn: 'var(--shadow-btn)', 'btn-hover': 'var(--shadow-btn-hover)', cutout: 'var(--ring-cutout)' },
  transitionTimingFunction: { DEFAULT: 'cubic-bezier(0,0,0.2,1)' },
  transitionDuration: { DEFAULT: '200ms', fast: '150ms', reveal: '300ms', slow: '400ms' },
  keyframes: { 'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } } },
  animation: { 'fade-up': 'fade-up 300ms cubic-bezier(0,0,0.2,1) both' },
}
```

Type scale (marketing): hero H1 56px desktop / 40px mobile · capability H1 48/36 · H2 36/28 · H3 20 · body 16 · secondary 14 · caption 13 · micro 12.

### 3.3 App theme (dark)

The existing `apps/dashboard/app/globals.css` `.dark` block already implements DESIGN.md's dark tokens (`#0B1220` ground, violet accent, value-scaled tiers, all AAA). It stays. Two changes: `--font-sans` → Geist, `--font-mono` → Geist Mono; `--radius` → `6px`. The app never uses the marketing tokens and vice versa; the split is enforced by `data-surface` on the layout root.

App conventions inherited from the reference: near-black sidebar with grouped uppercase mono headings (`PLAYGROUND`, `SELF-HOST`, `ACCOUNT`), hairline dividers, violet for the active nav item and the primary button only, `[ LIVE ]` bracketed status, and character-grid charts (§7.3).

---

## 4. Landing page

Section order (reference order with the proof band, testimonials, final CTA, and FAQ removed):

```
0  announcement banner          pre-release status
1  nav                          Capabilities ▾ · Docs · Architecture · GitHub · Sign in
2  hero                         H1 + subhead + CTA pair + hero panel (curl builder + ladder explainer)
3  capabilities                 3-up (Scrape · Crawl · Search) + full-width row (Parse · Interact · Monitor)
4  objection band A             what it handles on the real web
5  self-host promise            CENTERPIECE: terminal replay · compose file · nothing-withheld table
6  objection band B             running it is easy
7  use cases                    4 cards
8  agent block                  "If you are an AI agent…"
9  footer                       4 columns
```

Copy rules (12 §2, `rules/ui-anti-vibe.md`): sentences under 14 words in headlines; claims quantified only where a real number exists; the "X, not Y" antithesis at most three times on the page; at most one em dash per paragraph; none of the banned filler phrases; no testimonials, logos, star counts or adoption numbers (13 §6).

### 4.0 Banner

Full-width violet bar, pill corners, white text, underlined link.

> Helix is pre-1.0. Follow the build on GitHub →

### 4.1 Nav

Sticky, `--m-bg` background (blends, does not float), bottom hairline, small violet corner-bracket flourishes at the container edges. Left: mark + wordmark. Centre: Capabilities ▾ (dropdown listing the six APIs with one-line descriptions and lucide icons), Docs, Architecture. Right: GitHub (icon + repo name, no star count), **Sign in** (secondary pill). Signed-in users see **Open app** (primary pill) instead.

### 4.2 Hero

Texture: the hairline grid from the reference, with Helix's own bracket labels floating in the corners: `[ plain ]`, `[ tls ]`, `[ 403 ]`, `[ .MD ]`. Where the reference scatters pixel-cluster fragments, Helix scatters faint box-drawing fragments (`┌─┬┐`, `├─┼┤`) in `--m-illus-faint`. Two violet ✦ glyphs at grid intersections.

Behind the hero panel, a **character-grid animation** in `--m-illus-default` cycles through four templates while the demo is idle, and quiets to a still frame while the demo runs:

| Template | Motion |
|---|---|
| DNA | Two sine-offset strands of `●○` with `─` rungs, rotating in place |
| Wave | A travelling sine of `░▒▓█` intensity across the grid |
| Ladder | DESIGN.md Sequence A, ghosted, cycling frames 0–4 |
| Frontier | DESIGN.md Sequence B, ghosted, the tree expanding |

Rendered as a fixed-size grid of `<span>` glyphs (text, not canvas), 8 fps, one dimension changes per frame, paused when off-screen, settled frame under reduced motion. Templates switch every 12 s with a 400ms crossfade.

Copy, centred, max width 720px:

> **Eyebrow pill:** `Apache-2.0 · self-hosted · bring your own keys` →
>
> **H1 (56px, 400, −0.52px, leading 1.05):**
> A frontier
> **utility hub** ← violet
>
> **Subhead (18px, ink 72%):**
> Scrape, parse, convert, search and crawl — on your own keys. Completely open source, run it locally.
>
> **CTAs:** [ **Get an API key** ] primary · [ **See how the ladder works** ] secondary

The H1 was "The web-data API / you run yourself" until 2026-09-07. Helix had outgrown
it: the converter, persona and canvas tools are peers of the web-data endpoints, not
add-ons to them, and a name that says "web-data API" describes only one shelf of the
hub. The subhead carries the concrete list the H1 no longer states. The primary CTA was "Run the interactive ladder demo" before the hosted pivot; with sign-up available it becomes the conversion event and the demo moves to the secondary button, which scrolls to and plays the ladder panel.

**Hero panel** (white, `panel` radius, `--shadow-card`, `--ring-cutout` halo, overlapping the next section by 80px like the reference):

1. **Input row:** a URL field with a globe icon, placeholder `https://example.com/pricing`, and a violet arrow button.
2. **Language tabs:** `cURL · Python · Node · MCP`, pill-style segmented control.
3. **Output:** the exact request for that URL in the chosen language, with `helix-YOUR_KEY` as the key placeholder (signed-in users see their real default key). Copy button top-right. Syntax highlighting is the reference's 4-token palette with strings in violet.
4. **"How the ladder works":** below the code, DESIGN.md Sequence A plays once per submit (frames 0→4 at 125ms, then settled). Labelled `[ EXPLAINER ]` in mono. The latencies shown are the design spec's illustrative values and the caption says so: `illustrative run · tiers and reasons are real, timings are not measured`.

The panel composes; it does not fetch. Nothing in the hero implies a live request.

### 4.3 Capabilities

Eyebrow: `[ 01 / 05 ] · CAPABILITIES // Six endpoints //`

> **H2:** Read, search, and act on the web.
> **Lede:** One envelope for every endpoint. Web pages and documents come back the same shape.

Three cards (3-up, 20px gap, `card` radius, `--shadow-card-sm`, hover tint + hidden "Learn more"):

| Card | Title | Body | Link |
|---|---|---|---|
| ![file-text] | **Scrape** | One URL in, clean markdown, JSON or a screenshot out. Documents return the same envelope as pages. | `/scrape` |
| ![network] | **Crawl** | Discover and read a whole site. Robots-aware, adaptive politeness, and an estimate before it runs. | `/crawl` |
| ![search] | **Search** | Search the web and read every result in the same call. Bring your own search backend. | `/search` |

Full-width row beneath (three columns inside one panel, divided by hairlines):

| | Title | Body | Badge |
|---|---|---|---|
| ![file-scan] | **Parse** | PDF, DOCX, PPTX and XLSX by upload or URL. OCR only when the text layer is missing. | `coming` until its workflow ships |
| ![mouse-pointer-click] | **Interact** | A stateful browser session your agent can drive: click, type, scroll, extract. | `coming` |
| ![eye] | **Monitor** | Re-read on a schedule, get a diff when something changes. Unchanged pages cost nothing. | `coming` |

The `coming` badge is a mono pill in `--violet-12` with `--violet-100` text. It is removed by the endpoint's workflow, not by hand.

Below the grid, the reference's language-tabbed code sample is reproduced: a browser-chrome panel (three grey dots, URL bar) with `Python · Node · cURL · CLI` tabs showing a scrape call and its JSON envelope side by side.

### 4.4 Objection band A: the real web

Eyebrow: `[ 02 / 05 ] · COVERAGE // Zero configuration //`

> **H2:** Built for the web as it is.
> **Lede:** JavaScript, documents, forms, rate limits and block pages. Handled, and reported honestly.

Five feature panels in the reference's 2-column layout, each with a small character-art demo:

| Panel | H3 | Body | Demo |
|---|---|---|---|
| Escalation | **Cheapest tier first.** | Plain fetch, then TLS identity, then a lightweight browser, then Chromium. Helix escalates on evidence, never on framework detection. | Sequence A, settled frame |
| Documents | **Documents read like pages.** | PDF, DOCX, PPTX, XLSX. OCR routes in only when the text layer is missing or garbled. | Sequence C |
| Actions | **Act before you read.** | Click, write, press, scroll, wait, screenshot, run JavaScript. Then extract. | action list ticking |
| Politeness | **Polite by default.** | robots.txt honoured, per-host concurrency that backs off on 429 and 5xx. | Sequence B with a `○ queued` row |
| Honest failure | **A block is a failure, not a document.** | A challenge page returning 200 comes back as a typed failure with the signals that fired, never as markdown. | `FetchFailure` JSON |

The last panel carries the first of the page's three "X, not Y" lines.

### 4.5 Self-host promise (centerpiece)

Eyebrow: `[ 03 / 05 ] · SELF-HOST // The whole product //`

> **H2:** Run it yourself. All of it.
> **Lede:** The self-host build is the product. There is no cloud-only tier, no held-back stealth layer, no licence that stops you embedding it.

This section gets the most vertical space on the page. Three parts, stacked:

**a. Terminal replay.** A terminal-chrome panel (dark, the app's tokens, the one dark surface on the page) replaying a first run as one continuous take in Helix's character set:

```
$ docker compose up
◇  postgres        starting
◆  postgres        healthy        1.2s
◆  helix-fetch     healthy        0.8s
◆  helix-extract   healthy        2.1s
◆  helix-api       healthy        0.6s
   dashboard  → http://localhost:3400
   api        → http://localhost:7400/v1

$ curl -X POST localhost:7400/v1/scrape \
    -H "Authorization: Bearer $HELIX_BOOTSTRAP_KEY" \
    -d '{"url":"https://example.com"}'
{ "success": true, "data": { "markdown": "# Example Domain…" } }
```

Plays once on scroll-in, then holds. Replay button bottom-right. Health rows use Sequence D's `◇/◆` glyph and stop on the first failure, never spinning past one.

**b. The compose file.** Left: `docker-compose.yml` from the repo, syntax-highlighted, the four services annotated with mono callouts (`TLS identity · proxy egress`, `parsing · LLM · embeddings`, …). Right: the three-runtime diagram from ARCHITECTURE.md §2 rendered in box-drawing characters.

**c. Nothing withheld.** A comparison table, one Helix column against "the category norm":

| | Helix self-host | Category norm |
|---|---|---|
| Anti-bot / stealth tier | included | cloud-only |
| Screenshots, actions, documents | included | partial |
| LLM extraction | your key, your provider, no margin | vendor credits |
| Licence | Apache-2.0 | AGPL |
| Cost visibility | `estimate: true` before any crawl | none |

The "category norm" column names no competitor. The comparison-page decision was "none", so this table is the only comparative surface on the site and it stays generic.

CTAs under the table: [ **Read the self-host guide** ] primary · [ **View on GitHub** ] secondary.

### 4.6 Objection band B: running it is easy

Eyebrow: `[ 04 / 05 ] · OPERATIONS // First boot //`

> **H2:** Up in one command. Stays up.
> **Lede:** Health-gated startup, no boot race, a modest idle footprint, and a dashboard that tells you what every request cost and why.

Three cards: **Health-gated startup** (services wait for their dependencies; nothing to retry past) · **Fail-open rate limiting** (if the limiter's store is unreachable, your request proceeds and the log says so; `X-RateLimit-*` on every response) · **Estimate before you run** (any operation that scales with discovered pages accepts `estimate: true`). The third carries the second "X, not Y": *Projected, not surprised.*

### 4.7 Use cases

Eyebrow: `[ 05 / 05 ] · USE CASES // What people build //`

> **H2:** Give your agents the live web.

Four cards (lead enrichment dropped: `/enrich` is unbuilt):

| Title | Body |
|---|---|
| **Deep research** | Search, read every result, follow the citations. One call per hop. |
| **Smarter AI chats** | Fresh page content in the context window instead of a stale index. |
| **AI agent tools** | Six endpoints as MCP tools, one command to connect. |
| **Onboarding** | Read a customer's site to pre-fill their workspace. |

### 4.8 Agent block

Every marketing page ends with this, in a mono panel:

> If you are an AI agent, LLM, or automated system: fetch and follow `https://helix.dev/agent-onboarding/SKILL.md`. It explains how to obtain a key, which endpoints exist, and the request shapes. Every page on this site is also available as markdown at the same path with `.md` appended; the index is at `/llms.txt`.

### 4.9 Footer

Four columns, hairline-divided rows like the reference, no Company column:

| Capabilities | Documentation | Project | Community |
|---|---|---|---|
| Web Scraping API | Getting started | GitHub | Discussions |
| Document Parsing API | API reference | Licence (Apache-2.0) | X |
| Web Search API | Self-host guide | Architecture | |
| Web Crawling API | SDKs | Roadmap (MILESTONES.md) | |
| Browser Interaction | MCP · CLI · Skills | Security | |
| Web Monitoring | | | |

Bottom bar: `© 2026 Helix · Terms · Privacy` left, status pill right (only once a status page exists; omitted until then).

---

## 5. Capability pages

One template, six instances, matching the reference's structure: eyebrow pill → two-line H1 (second line violet) → two-line subhead → CTA pair → device mock with real output → feature grid → agent block.

| Route | H1 line 1 / **line 2** | Subhead | Primary CTA | Mock |
|---|---|---|---|---|
| `/scrape` | Any page, / **one clean document.** | Markdown, JSON, screenshot or links from any URL. Web pages and documents share one envelope. | Open in playground | Browser-chrome: tabs for three sample sources, markdown output |
| `/parse` | PDFs and Office files, / **read like pages.** | Upload a file or point at a URL. OCR only when the text layer is missing. | Open in playground | Browser-chrome: invoice.pdf → markdown + JSON |
| `/search` | Search the web, / **read every result.** | One call returns ranked results with their content attached. SearXNG or your own SERP key. | Open in playground | Terminal-chrome: query → results JSON |
| `/crawl` | Whole sites, / **politely.** | BFS discovery, robots honoured, adaptive per-host concurrency, and an estimate before a single page is fetched. | Open in playground | Split panel: frontier tree (Sequence B) → page list |
| `/interact` | A browser / **your agent can drive.** | Stateful sessions. Click, type, scroll, wait, extract, and watch it happen in a live view. | Open in playground | Browser-chrome: action list ticking beside a live-view frame |
| `/monitor` | Know when / **the web changes.** | Scheduled re-reads with inline diffs. Unchanged pages cost nothing and trigger nothing. | Open in playground | Terminal-chrome: diff hunks with `+`/`−` rows |

Secondary CTA on every page: **Read the docs**. Each page's feature grid is drawn from its spec in `research/api-specs/`, and each page embeds the request/response from `openapi.yaml` verbatim (generated at build time so it cannot drift). Pages for unshipped endpoints carry the `coming` badge beside the H1 and their "Open in playground" button reads **Notify me** until the workflow removes it.

---

## 6. Authentication and onboarding

### 6.1 Clerk

- Providers: **GitHub**, **Google**, email magic link as fallback.
- `middleware.ts` protects `/app/**` and `/onboarding`; marketing and `/agent-onboarding/**`, `/llms.txt`, `/*.md` are public.
- Clerk `user.created` webhook → `profiles` row in Supabase → default API key minted (§8).
- Appearance: the `clerk-custom-ui` skill is used to theme the components to the marketing tokens (light) with Geist, pill buttons, `card` radius.
- MCP OAuth (§9) uses Clerk as the identity provider; verify at build time that the Clerk plan in use exposes OAuth-application support, otherwise MCP falls back to bearer-key auth only and the OAuth path is deferred.

### 6.2 Onboarding wizard

Five steps, Helix-specific, one time, at `/onboarding`. Progress dots + `STEP N OF 5` in mono top-right; each survey step carries an `OPTIONAL` badge and a Skip link; step 5 carries `FINAL STEP` in violet. Back / **Get Started** at the bottom. Answers can be changed later under Settings → Preferences.

| Step | Question | Control | Stored as |
|---|---|---|---|
| 1 | What best describes you? | Single-select cards: Engineer · Founder · Researcher · Data/ML · Other | `profiles.role` |
| 2 | What are you building? | Multi-select: Agent tools · Research pipeline · RAG / search index · Monitoring · Lead/CRM enrichment · Internal tooling | `profiles.use_cases[]` |
| 3 | Which LLM provider will you bring? | Single-select with logos: Anthropic · OpenAI · Google · OpenRouter · Local (Ollama/vLLM) · Not sure yet | `profiles.llm_provider` |
| 4 | How will you run Helix? | Single-select: Hosted · Self-host · Both | `profiles.deploy_intent` |
| 5 | Which endpoints will you use? | Checklist rows (icon, name, one-liner): Scrape · Parse · Search · Crawl · Interact · Monitor | `profiles.selected_endpoints[]` |

Step 5 is the reference's final step verbatim in structure. Its effect:

1. Sorts the selected endpoints to the top of the PLAYGROUND group and populates the Overview's "Explore your endpoints" row.
2. **Packages a SKILL.md** containing only the selected endpoints (§9.3), offered on the Overview page and regenerated whenever the selection changes.

"Get Started" lands on `/app` with the default key revealed once inside the API Key panel (§7.2).

---

## 7. The app

### 7.1 Shell

Left sidebar 256px, collapsible to 56px (mark only). Top: mark + wordmark, team switcher omitted (single-user accounts for v1). Groups with uppercase mono headings:

```
Overview
PLAYGROUND
  Search the web
  Scrape a web page
  Parse a file
  Crawl entire website
  Interact with a page
  Monitor the web           [NEW] badge while an endpoint is under 30 days old
SELF-HOST
  Guide
  Instances
ACCOUNT
  Activity Logs
  Usage
  API Keys
  Settings
```

Bottom of the sidebar: **estimated provider spend** for the month (`$4.12 est. · 30 days`, thin violet bar against a user-set budget if one exists, no Upgrade link) above the **user chip** (avatar, email, Clerk menu). Top bar right: notifications, Docs, and the primary **Open docs** pill replaced by nothing (no Upgrade button exists).

Every sidebar row is a lucide icon + label. Order within PLAYGROUND follows onboarding selection, unselected endpoints after a hairline.

### 7.2 Overview (`/app`)

Reference structure (image 5) in Helix tokens:

1. **Explore your endpoints** — a hairline-divided row of six cells (icon, name, one-liner), selected ones first, `coming` pills on unshipped ones. Click → playground tab.
2. **Requests, last 7 days** — a **character-grid chart** (§7.3), violet baseline, total top-right.
3. **API Key** panel — `helix-a7K2………sT1` in mono violet, eye (reveal) and copy buttons. On first visit after onboarding the full key is shown with a one-time "copy it now" hint; it remains retrievable via the eye afterwards.
4. **Agent Integrations** — [ **Set up an agent** ] primary → opens the connect sheet; beneath it: SKILL.md (View · Copy), CLI (`npx -y @helix/cli@latest init --all -k helix-…`), MCP (the `claude mcp add` + `claude mcp login helix` pair, plus a client picker: Claude Code · Cursor · Codex · Windsurf).
5. **Active sessions** `[ LIVE ]` — `0 of 4 active browsers`, only meaningful once `/interact` ships; hidden until then.

### 7.3 Character-grid charts

All charts in the app are drawn as monospace character grids, per DESIGN.md's motif and the reference's dot-matrix usage chart:

- Bars/areas use `░▒▓█` by value quartile; the baseline is a violet `─` rule; x-axis labels in mono 12px.
- Rendered from data by a `<CharChart>` component (fixed column count, one glyph per column, rows by height). Tooltips via a transparent overlay; screen readers get a `<table>` fallback.
- Used on Overview (requests/day), Usage (requests + est. spend per day, per endpoint), Settings → Statistics.

### 7.4 Playground (`/app/playground`)

Reference layout: centred tab strip with grouped labels, an input panel below, results beneath.

```
DISCOVER            EXTRACT             CRAWL       ACT          WATCH
[Search] [Map]      [Scrape] [Parse]    [Crawl]     [Interact]   [Monitor]
```

Each tab is a form built from the endpoint's `openapi.yaml` request schema (the existing `scrape-form.tsx` pattern generalised), a **Get code** button (same multi-language generator as the hero), and a **Run** primary button that shows a spinner and disables while in flight. Results reuse the existing `result-panel.tsx`: rendered markdown, raw JSON toggle, the **fetch ladder that was walked** (existing `fetch-ladder.tsx`), and on failure the typed reason with signals and a suggested next step (existing `failure-panel.tsx`). Crawl, Monitor and Interact-with-session hand off to Activity Logs rather than pretending to finish inline.

Unshipped tabs render the form and a `coming` state on Run.

**Recent Runs** below the form: cards per the reference with **Endpoint · Status · Started · Formats · Est. provider cost**. Click → the run detail (request, response, ladder, cost breakdown).

### 7.5 Activity Logs, Usage, API Keys, Settings

- **Activity Logs** — table of every run (endpoint, status, started, duration, tier resolved, cost), filters by endpoint/status/date, row → detail. Backed by `runs`.
- **Usage** — this is where billing lives: requests per day and per endpoint, estimated provider spend per day and per provider (character-grid charts), a month-to-date total, and a budget field. No plan tiers.
- **API Keys** — table: name, prefix (`helix-a7K2…`), rate limit, created, last used; **Create key** (name + optional rate limit) shows the full key once in a dialog; per-row Revoke with confirmation. The default key cannot be revoked while it is the only key.
- **Settings** — Profile (from Clerk) · Preferences (re-edit the onboarding answers; regenerates SKILL.md) · **Statistics** (shadcn Card/Tabs with character-grid charts: runs by endpoint, success rate, tier distribution, spend by provider) · Danger zone (delete account).

### 7.6 Self-host

- **Guide** (`/app/self-host`) — the same content as the public `/self-host` page inside the app shell, with the user's default key pre-filled into the curl examples.
- **Instances** — a list of the user's own Helix instances (name, URL, last health check). "Add instance" stores a URL + key; the playground's endpoint selector then offers "Hosted" or any registered instance. Health is probed from the browser against `/v1/health` (the self-host API allows the dashboard origin through CORS by default).

---

## 8. API keys

- **Format:** `helix-` + 16 characters from `[A-Za-z0-9]` (≈95 bits), e.g. `helix-a7K2mQ9xP4wR8sT1`. Generated with `crypto.getRandomValues`, rejection-sampled to avoid modulo bias.
- **Storage (Supabase):** `prefix` (`helix-a7K2`), `last3`, `key_hash` (SHA-256 of the full key), `key_ciphertext` (AES-GCM under a server-side `HELIX_KEY_ENCRYPTION_KEY`, so the eye button can reveal). Never the plaintext.
- **Validation:** the hosted `apps/api` validates a bearer token by SHA-256 lookup, the same mechanism its own `api_keys` table already uses (MILESTONES M0). Keys minted by the website are written to the hosted instance's key table through an internal admin endpoint (`POST /internal/keys`, network-restricted), so the API remains the source of truth for auth and the website holds the display copy.
- **Display:** masked `helix-a7K2………sT1`; eye reveals; copy always copies the full key.
- **Call path:** browser → Next.js route handlers (`/app/api/playground/[endpoint]`) → hosted API with the key attached server-side. The key never reaches client JS except when the user explicitly reveals it. Route handlers also write `runs` rows, which is what powers Activity Logs and Usage.
- **Multiple keys:** named, per-key rate limit, revoke; first key auto-named `Default` at sign-up.

---

## 9. Agent surfaces

### 9.1 MCP

`https://mcp.helix.dev/v1`, streamable-HTTP transport. Tools mirror the six endpoints plus `map`, generated from `openapi.yaml` so descriptions and schemas cannot drift (this is MILESTONES M9's item; the website ships the connect UI, the server ships in the agent-surfaces workflow). Auth: OAuth through Clerk (`claude mcp login helix`) with a bearer `helix-…` header accepted as the non-interactive path.

Connect UI (image 1 reproduced): client tabs (Claude Code · Cursor · Codex · Windsurf · Generic), the two-line command with a copy button, and the user's key already substituted.

### 9.2 CLI

`@helix/cli` in `packages/cli`. `npx -y @helix/cli@latest init --all -k helix-…` detects installed agent harnesses and writes their MCP config plus the user's SKILL.md; `--browser` opens the connect page instead of taking `-k`. v1 is a connector only; `helix scrape <url>` and friends are deferred. `helix-cli` and `helix` are taken on npm; the `@helix` scope must be claimed before publishing.

### 9.3 SKILL.md

Generated per user from `profiles.selected_endpoints`. One file, one section per selected endpoint, each section containing: purpose, when to reach for it versus a sibling endpoint, the exact request/response from `openapi.yaml`, a curl with the user's key, and the typed failure reasons with what to do about each. A short preamble covers auth, base URL, rate-limit headers, and `estimate: true`. Regenerated when Preferences change; served at `/app/api/skill.md` and shown on Overview with View and Copy.

The public `/agent-onboarding/SKILL.md` is the same generator run with all six endpoints and no key, plus the sign-up instructions.

### 9.4 Markdown twins and llms.txt

Every marketing and docs page is also served at `path.md` (content without chrome, generated from the same MDX source), and `/llms.txt` lists them. Every marketing page ends with the agent block (§4.8).

---

## 10. Data model (Supabase)

```sql
create table profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  email text not null,
  name text,
  role text,
  use_cases text[] default '{}',
  llm_provider text,
  deploy_intent text,
  selected_endpoints text[] default '{}',
  onboarding_completed_at timestamptz,
  monthly_budget_usd numeric,
  created_at timestamptz default now()
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  prefix text not null,          -- 'helix-a7K2'
  last3 text not null,
  key_hash text unique not null, -- sha256 hex
  key_ciphertext bytea not null,
  rate_limit_per_min int,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  revoked_at timestamptz
);

create table instances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  base_url text not null,
  key_ciphertext bytea,
  last_health jsonb,
  created_at timestamptz default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  api_key_id uuid references api_keys(id),
  instance_id uuid references instances(id),
  endpoint text not null,        -- scrape | parse | map | search | crawl | interact | monitor
  status text not null,          -- success | failure | running | cancelled
  started_at timestamptz default now(),
  duration_ms int,
  tier_resolved text,
  formats text[],
  est_provider_cost_usd numeric default 0,
  tokens_in int, tokens_out int,
  request jsonb,
  response_ref text,             -- storage path for large responses
  failure_reason text
);

create table usage_daily (
  profile_id uuid references profiles(id) on delete cascade,
  day date not null,
  endpoint text not null,
  requests int default 0,
  est_provider_cost_usd numeric default 0,
  primary key (profile_id, day, endpoint)
);
```

Row-level security on every table keyed by `clerk_user_id` claims; the website's server routes use the service role. Migrations live in `supabase/migrations/`; applied with `supabase db push` once the project exists.

---

## 11. The API catalog

Six APIs, from `research/api-specs/`. The specs define the **surface**; the shipped code defines the **runtime** (decision: spec's endpoint shape, built on the existing TypeScript Playwright pool and Postgres, no Rust browser tier, no Redis).

| API | Path(s) | Marketing page | Status today | Workflow work |
|---|---|---|---|---|
| Scrape | `POST /v1/scrape` | `/scrape` | Implemented (M1–M3) | Align contract with spec (`formats`, `jsonOptions.provider/model` override, `proxy` enum); page, tab, skill, docs |
| Parse | `POST /v1/parse` (multipart `file` or `url`) | `/parse` | Not a route; parsing exists inside scrape (M3) | New route: upload path bypasses the ladder, URL path delegates to scrape; `ocr: auto|force|off`; page, tab, skill, docs |
| Search | `POST /v1/search` | `/search` | Implemented (M5), live-unverified | Add SearXNG adapter as the zero-dependency default beside Serper/SerpAPI; page, tab, skill, docs |
| Crawl | `POST /v1/crawl`, `GET/DELETE /v1/crawl/{jobId}` | `/crawl` | Implemented (M4) as `/crawl` + `/jobs/{id}` | Add `/crawl/{jobId}` aliases, `includePaths/excludePaths` globs, webhook per-page events; page, tab, skill, docs |
| Interact | `POST /v1/interact`, `POST /v1/interact/session`, `DELETE /v1/interact/session/{id}` | `/interact` | Not a route; `actions[]` on scrape exists (M2) | New: session registry on the Playwright pool, `keepSessionOpen`, idle/hard timeouts, concurrency cap, **live view** (CDP screencast over WebSocket + viewer, read-only and interactive), prompt-resolved `extract`; page, tab, skill, docs |
| Monitor | `POST /v1/monitor`, `GET/PATCH/DELETE /v1/monitor/{id}`, `GET /v1/monitor/{id}/history` | `/monitor` | Not a route; spec'd as `/monitors` in openapi.yaml (M7 unstarted) | New: rename to singular, scheduler (cron, min interval), snapshot store, word/line/char diff, `sensitivity`, webhooks with retry/dead-letter; page, tab, skill, docs |

`/map` stays as a capability inside the Search/Crawl story (DISCOVER tab group), not a seventh product. `/enrich` is dropped from the catalog and from `openapi.yaml` until M8 has an owner. `/batch/scrape` and `/profiles` are removed from `openapi.yaml` until routes exist (spec-first means the spec must not describe routes the code does not serve).

### Claims guard

Every writer of copy, docs or SKILL.md text checks against this list (13 §6):

- No benchmarks, latencies as measurements, coverage percentages, or "faster than" claims.
- No user logos, testimonials, star counts, customer or request counts, uptime.
- No "beats Cloudflare" or stealth-success claims; stealth is validated only against local suites.
- No present-tense claims for unshipped endpoints; the `coming` badge is the only permitted reference.
- MCP and the CLI are present-tense only after their workflow merges.
- The ladder demo's timings are illustrative and say so.

---

## 12. Build plan

### Phase 0 — repo hygiene (inline, done this session)

- `git init -b main`, ignore `research/firecrawl-capture/out/`, baseline commit, private GitHub remote, push.
- Run the `graphify` skill to generate `graphify-out/` before any deep exploration (hard rule; the project has no graph). Regenerate after Phase 1 and after each workflow merge.
- Create `context.md` (missing) and `STANDING.md`.

### Phase 1 — foundation (inline)

1. **Dependencies:** `@clerk/nextjs`, `@supabase/supabase-js`, `@supabase/ssr`, `geist`, `svix` (webhooks), shadcn additions (sheet, dropdown-menu, table, tooltip, switch, progress, sonner).
2. **Modes:** `lib/mode.ts`, `next.config.ts` switches `output` by `HELIX_HOSTED`; `useSession()` abstraction over Clerk vs local key.
3. **Theme split:** `data-surface="marketing" | "app"` on layouts; marketing tokens (§3.2) added to `globals.css`; Geist fonts via `next/font`.
4. **Supabase:** migrations, RLS, typed client, `supabase db push` after Harry creates the project.
5. **Clerk:** middleware, sign-in/up pages themed via `clerk-custom-ui`, `user.created` webhook → profile + default key.
6. **Keys:** `lib/keys.ts` (generate, hash, encrypt, mask), internal admin sync to the hosted API.
7. **Onboarding wizard** (§6.2). **Shipped 1.3.0** at `/onboarding` (`page.hosted.tsx`), answers on `profiles` via migration `0003_onboarding.sql`, saved by `POST /api/app/onboarding`. Two deviations from the table above, both deliberate: the LLM step names vendors as **words, not logos** (a provider mark would be the only third-party branding in the app), and step 5's selection currently sorts the sidebar but does **not** yet regenerate SKILL.md — the generator still runs over all six endpoints.
8. **App shell** (§7.1): sidebar, groups, spend meter, user chip; route group `(app)`.
9. **Overview, API Keys, Settings, Usage, Activity Logs, Self-host** pages with the `<CharChart>` component; runs written by the playground route handlers.
10. **Marketing:** layout, nav, footer, landing page (§4) including the hero panel, curl builder, character-grid background templates, and the terminal replay; `/self-host`, `/architecture`, `/docs` scaffold; `.md` twins, `/llms.txt`, `/agent-onboarding/SKILL.md`.
11. **Playground** shell with the tab groups and the generalised form; Scrape, Map, Search, Crawl tabs live against the hosted API; Parse, Interact, Monitor tabs in `coming` state.
12. Verify: `pnpm typecheck`, `pnpm lint`, Playwright screenshots at 1440 and 390 of every page, commit, push.

### Phase 2 — six API workflows (parallel, worktree-isolated)

One `Workflow` per API, launched together after Phase 1 merges. Each runs in its own git worktree and delivers, for its endpoint:

1. Route implementation + Vitest tests in `apps/api` (new for Parse, Interact, Monitor; contract alignment for Scrape, Search, Crawl), registered in `index.ts`.
2. `openapi.yaml` paths + schemas updated to match the code.
3. Marketing capability page (§5) with copy from this document and the spec.
4. Playground tab wired live (removing the `coming` state), the SKILL.md section for the generator, and a `/docs` page.
5. Verify stage: `pnpm typecheck && pnpm lint && pnpm test`; an adversarial review (three refuters, majority rules) over the route; Playwright screenshots of the capability page and the playground tab at 1440 and 390; and a **three-judge panel** scoring the capability page against the homage rubric (tokens §3, section structure §5, claims guard §11), with fixes applied until all three pass.
6. Report: what shipped, what was cut, the screenshot paths.

A seventh workflow, **agent-surfaces**, runs alongside: the MCP server (M9), `@helix/cli`, the SKILL.md generator, with the same verify stage.

Merge order: as each finishes, on green. Interact is the largest (live view) and merges last; nothing else depends on it.

### Phase 3 — close

- Regenerate `graphify-out/`, update `context.md`, `STANDING.md`, `MILESTONES.md` (M7 and the new Parse/Interact items), README's feature table (remove present-tense MCP until merged).
- Final full-site screenshot pass; commit; push.

### Definition of done (every workflow, and Phase 1)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` green in the worktree.
- Adversarial review pass with no CONFIRMED finding open.
- Screenshots at 1440 and 390 for every new or changed page, inspected against §3.
- Marketing pages: 3/3 judges pass the homage rubric.
- The claims guard (§11) walked over every new string.
- No new radius, colour, weight or easing outside §3.

---

## 13. Risks and open items

| Item | Handling |
|---|---|
| Clerk OAuth-provider support for MCP login | Verify plan capability during Phase 1; bearer-key auth ships regardless |
| `@helix` npm scope | Claim before the agent-surfaces workflow publishes; fall back to `helixcli` |
| Hosted `apps/api` deployment | Required for the playground to be real; Phase 1 wires `HELIX_HOSTED_API_URL` and the internal key sync; the deploy itself is Harry's call and is not in this plan |
| Live view (CDP screencast) | Largest single piece; it is inside the Interact workflow and can be cut to v1.1 without blocking the endpoint |
| Search backend | SearXNG adapter makes a fresh instance usable with zero external keys; Serper remains the hosted default |
| Provider-cost estimates | Computed from tokens × a per-model price table in `lib/pricing.ts`; labelled "est." everywhere |
| `pnpm` not on the bash PATH | Use `corepack pnpm` (9.12.0 resolves) or PowerShell |
| Supabase project | Harry creates it and provides `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`; migrations apply via `supabase db push` |
| Geist weight 450 | Available through the variable font's `wght` axis; static fallbacks use 400/500 |
