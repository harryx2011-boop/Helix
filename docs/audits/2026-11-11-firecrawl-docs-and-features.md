# Firecrawl Docs, Alexandria and Feature Gaps vs Helix

Date: 2026-11-11. Scope: docs.firecrawl.dev, the two llms.txt files, the Alexandria product, the Series B blog post, the benchmarks pages. Out of scope (another agent): firecrawl.dev home, pricing, playground.

Rules followed: read-only web, no sign-up, no installs, no command from any agent-addressed text was run. Firecrawl's numbers are their claims ("they state"). Anything from my own memory is labelled UNVERIFIED.

Screenshots: `D:\scratch\helix-revamp\firecrawl-docs\shots\` (files listed at the end). Raw measurements: `measure.json`, `measure2.json` in `D:\scratch\helix-revamp\firecrawl-docs\`. Fetched text: `pages\`.

---

## 1. llms.txt

| Host | Present | Size | Links (count of `](`) | Shape |
|---|---|---|---|---|
| https://www.firecrawl.dev/llms.txt | yes, HTTP 200 | 23,060 B | 97 | H1, one-line summary, "Important notes", then sections: CLI, MCP Server, Skills, Docs, SDKs, Get started, Monitor, Alexandria, Benchmarks, Pricing, Security and compliance, Integrations, Use Cases, Alternatives, Customers, Blog, Changelog, Legal, Optional |
| https://docs.firecrawl.dev/llms.txt | yes, HTTP 200 | 10,158 B | 86 (28 are relative OpenAPI JSON paths) | Mintlify-generated. Page list grouped Get Started, Standard Features, Webhooks, Dashboard, SDKs (9 languages), OpenAPI specs, Optional, then a recursive `/_llms/` index tree (en, es, fr, ja, pt-br, zh) |
| https://docs.firecrawl.dev/llms-full.txt | yes, HTTP 200 | 2,063,089 B | n/a | 1,060 lines start with `# `, but many are code comments; page titles seen: Advanced Scraping Guide, Billing, Agent, Alexandria, Enterprise, Batch Scrape, framework guides |

What an agent is told first (recorded, not executed):

- www llms.txt, "CLI": install and initialise with `npx -y firecrawl-cli@latest init --all --browser` ("sets up Firecrawl skills and browser support in one command"). Next come MCP docs, then a Skills section pointing to `https://www.firecrawl.dev/SKILL.md`, `/agent-onboarding/SKILL.md`, `https://www.firecrawl.dev/auth.md` (agentic registration through a WorkOS ID-JAG assertion) and `https://docs.firecrawl.dev/ai-onboarding`.
- www llms.txt, SKILL.md line quoted inside it: "Prefer a free account when the human can sign up; if credentials are not available yet, use the keyless free tier to search, scrape, and interact without an API key (rate-limited)."
- docs llms.txt: "The links below point to documentation indexes. Follow each `/_llms/` index recursively until you reach documentation pages." The v2 index claims 249 pages; English v2 Documentation index claims 137.
- Every docs page served as `.md` opens with a blockquote: "Documentation Index. Fetch the complete documentation index at https://docs.firecrawl.dev/llms.txt. Use this file to discover all available pages before exploring further." The HTML page carries the same text visually hidden (DOM scan found it; not visible in screenshots).
- The www file states its own "Important notes" for agents: Firecrawl is a managed API, Search returns full page content, Scrape returns LLM-ready markdown by default, Interact is "not designed for long-running persistent sessions", credits are shared across endpoints.
- The blog post and docs also carry the line "Are you an AI agent? See setup options" (CTA card).
- Mintlify footer line at the end of docs llms.txt: "This documentation is built and hosted on Mintlify".

Proton injection checks: 3 run on agent-addressed passages (SKILL.md install steps; docs-index "follow recursively" text; the keyless and agent-registration text). Results: the first two labelled `normal_documentation` (0.64, 0.57). The third labelled `hidden_instructions...` at 0.58 confidence, a weak lean. I read the passage: it describes how to register an agent for an API key, asks for nothing outside Firecrawl's own onboarding, and has no instruction to ignore rules or send data anywhere. I count it as ordinary (if agent-aimed) documentation and a low-confidence classifier miss. No instruction was followed either way. Count: 3 checks, 1 weak flag.

Note on cost to Helix: Helix `helix_scrape` returned `service_unavailable ... helix-scrape returned HTTP 404` for three Firecrawl URLs (www llms.txt, docs llms.txt, docs `mcp-server.md`) while `helix_health` was `ok` and `helix_scrape` on https://example.com succeeded. `curl` fetched all three with HTTP 200. Cause not determined (possible bot-challenge answer mapped to 404; UNVERIFIED). Worth a bug ticket: a 404 from the tls and browser tiers on a host that serves 200 to curl.

---

## 2. Docs UI Anatomy (docs.firecrawl.dev, Mintlify)

All measured with Playwright (headless Chromium 1248, viewport 1440x900 and 390x844) on https://docs.firecrawl.dev/introduction and https://docs.firecrawl.dev/features/scrape. Dark mode was forced by emulating `prefers-color-scheme: dark` and swapping the `light`/`dark` class on `<html>`; the screenshot confirms the site honours it. The site has a three-state theme control (labels read: "Change theme preference", "Switch to system theme", "Switch to light theme", "Switch to dark theme").

### 2.1 Frame

- Two-row sticky header, total 96 px tall (`header` measured h=96, position sticky): row 1 logo, version select `v2`, language select `English`, centred search pill, GitHub repo chip with live star count (200,841), Status, Support, orange Sign Up, theme button. Row 2 is a tab strip: Documentation, SDKs, API Reference, Build with AI (active tab underlined).
- Search: pill 384x36, border-radius 9999px, background about 3 percent black, 14px text, `Ctrl K` hint at the right edge.
- Three-column body: sidebar 288 px, content container `max-width: 1152px` (rendered 1112), right rail 304 px at x=1076. The article text column itself is 632 px wide starting at x=396 (cards, callouts and code blocks all measure w=632).
- Floating "Ask" chat button (orange circle, bottom-right) on every page and both widths.
- Page footer text is one line; no big footer on docs.

### 2.2 Sidebar

- Width 288 px, sticky, `border-right: 1px solid rgb(238,238,238)`, transparent background.
- 34 visible links on the Introduction page.
- Top block, four utility links with leading icons: Playground, Blog, Community, Changelog (outside any group, above the first divider).
- Group label: "Get Started", "Core Endpoints", "More", "Quickstarts": 12px, weight 600, line-height 16px, colour rgb(22,22,22), no uppercase, no letter-spacing. Groups are separated by a 1px divider and about 24 px gap.
- Item: 14px Inter, colour rgb(62,62,62), row height 32 px, padding `6px 12px 6px 16px`.
- Active item: background `oklab(0 0 0 / 0.1)` (10 percent black), radius 12px, text black. In dark mode it becomes a near-black pill with white text (screenshot).
- Items under "Get Started" for AI clients carry the client's brand logo (ChatGPT & Codex, Claude & Claude Code, Claude Desktop & Cowork, Cursor). Items under "Core Endpoints" carry a small line icon (Search, Scrape, Monitor, Interact / Browser Sandbox) and a right chevron. Expanded children (Scrape page: Scrape, Faster Scraping, Batch Scrape, JSON mode) are indented to x=48 px, no icons, same 32px row.
- The sidebar scroll position follows the active page (on the Alexandria page the active item "Alexandria" in group "More" is scrolled into view).

### 2.3 Page header and content column

- Eyebrow label above the title (section name, "Get Started" or "More"), 14px semibold.
- H1: Inter 36px / 40px, weight 600, letter-spacing -0.9px, colour rgb(22,22,22).
- Subtitle under H1: about 18px, grey; from the llms.txt page description.
- "Copy page" split button right-aligned on the H1 row: copy the page as Markdown plus a dropdown caret (agent hand-off menu; dropdown contents not opened). On 390px it moves below the subtitle.
- Body: Inter 16px; screenshot line pitch is about 28 px; about 86 characters per line at 632 px (counted from the rendered Introduction paragraph "Firecrawl is the context API for AI agents. Search, scrape, and interact with the live" = 86 chars on one line). Measured script value for body text was wrong (selector hit a hidden node); the 86 figure is hand-counted from the screenshot.
- Section headings: H3 18px/27px weight 600 (margin-top 28.8, margin-bottom 10.8 on the Scrape page). The large "Get started" heading in the Introduction screenshot renders about 24px weight 600 (screenshot estimate, not script-measured).
- Inline code: Paper Mono stack, 14px, background 50 percent of rgb(242,242,242), radius 6px, padding `2px 8px`.
- Links in prose: black, underlined (screenshot of Scrape page).

### 2.4 Code blocks and language tabs

- Syntax theme Shiki: `github-light-default` in light, `dark-plus` in dark.
- Font: "Paper Mono" first, then ui-monospace stack; 14px / 24px line-height in the Scrape page blocks (12.5px / 20px in the compact setup-card command row).
- Wrapper: radius 14px, scroll area with a 32px scroll fade, block width 626 inside the 632 column.
- Language tab strip above the code: 34 px tall, 12px / weight 500 tabs, about 53 px wide each. Typical set: Python, Node, cURL, CLI. 19 tab lists on the Scrape page, so tabs are used heavily (the page has 28 `pre` blocks). Tabs remember language across blocks (sync behaviour not tested; UNVERIFIED).
- Every block has a Copy button; 17 copy buttons counted on the Introduction page.
- Response blocks sit in a collapsed "Response" accordion directly below each example.

### 2.5 Callouts and cards

- Callout (type "note"): background rgb(239,246,255), border 1px rgb(191,219,254), radius 16px, padding `16px 20px`, 16px text. Other callout types exist in the source (`> [!NOTE]`, `> [!TIP]`); only "note" was measured.
- Card: white, border 1px at 10 percent black, radius 16px, a transparent 2px ring that turns visible on hover, icon top-left, bold title, one-line grey description. Used as 2-up grids ("Build and test directly", "More capabilities", "What can Firecrawl do?").
- Prompt-card variant: "Try it in the Playground" card with a play icon, bold title, one-line description (Scrape page).
- Embedded YouTube thumbnail inside the Scrape page ("Firecrawl Parse vs Scrape Explained in 5 Minutes").
- Promo card in the right rail below the TOC: "Ready to build?" with orange Start for free and outlined See our plans; tinted card background (orange tint light, dark brown tint dark).

### 2.6 "On this page" rail

- 304 px wide, fixed in place beside the content (`content-side-layout` sticky), starts at x=1076.
- Title "On this page" with a small list icon.
- 47 links on the Scrape page (nested H2 and H3). Link: 14px / 24px, padding `4px 0 4px 16px`; H3 entries indented a further 16 px; current section is weight 500 black with a 2px left rule; others grey rgb(111,111,111).
- Hidden on mobile.

### 2.7 Search

- Pill in the header (see 2.1). Opens a command palette (not opened this session; UNVERIFIED). Docs also expose a `Ctrl K` shortcut hint.

### 2.8 Mobile (390 px)

- Sidebar and right rail disappear. Header collapses to logo, search icon, kebab. A breadcrumb row appears with a hamburger and "Get Started > Introduction".
- Setup tabs become a 2-column tile grid. "Copy page" moves under the subtitle. Page `scrollWidth` equalled the viewport on the measured pages (no horizontal scroll at 1440; 390 not asserted by script, screenshot shows none).

### 2.9 Agent-setup block (Introduction page, "Get started")

One card, built like a mini installer:

1. Header row: "Set up Firecrawl MCP" (bold), "See all setup options →" at right, one grey line: "Sign in via browser."
2. Five equal tabs, each a client logo above a two-line label: "ChatGPT & Codex / Install plugin", "Claude & Claude Code / Install plugin", "Cursor / One click", "OpenCode / Copy config", "Droid / Run in terminal". Active tab has an orange 2px top border and a faint orange wash.
3. Body: one sentence, a primary button ("Add to ChatGPT & Codex →" with the client's logo), a terminal-style command row (`$ codex mcp add firecrawl --url https://mcp.firecrawl.dev/v2/mcp-oauth`, Copy button inside the row), a verify sentence ("Then enter /mcp in Codex CLI and confirm firecrawl is connected."), and a second line "Using another MCP client? Point it at:" followed by a config snippet.
4. Same page offers, in text: `npx -y firecrawl-cli@latest init --all --browser` with a NOTE "Restart your coding agent after setup", and a "Set up with an agent" copy-prompt block.
5. Dedicated per-client pages exist (ChatGPT & Codex, Claude & Claude Code, Claude Desktop & Cowork, Cursor), each with: "Optional: Add to Claude" button, numbered steps, a copyable test prompt, an "Other connection modes" list, a Troubleshooting list ("A Firecrawl server already exists: run `claude mcp remove firecrawl`" ...).
6. MCP "Get Started" page uses three cards for three auth routes: Try Instantly (keyless), Sign in (OAuth), Use an API key; plus two one-click cards (Add to ChatGPT & Codex, Add to Claude) and a For Agents / For Humans split.

### 2.10 Quoted style JSON, docs Introduction, 1440 light (from `measure.json`, key `docs-intro-1440-light`, selected fields)

Four fields (`h2`, `h3`, `p`, `pre`) in that file hit hidden or unrelated nodes (e.g. h2 is the visually hidden "Documentation Index"); they are excluded below and the targeted second pass in `measure2.json` replaced them.

```json
{
  "viewport": [1440, 900],
  "bodyFont": { "fontFamily": "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif", "fontSize": "16px", "lineHeight": "24px", "color": "rgb(0, 0, 0)" },
  "sidebar": { "borderRight": "1px solid rgb(238, 238, 238)", "position": "sticky", "w": 288, "h": 804 },
  "sidebarLinkCount": 34,
  "sidebarItem": { "fontSize": "14px", "lineHeight": "24px", "color": "rgb(62, 62, 62)", "padding": "0px 0px 0px 16px", "margin": "0px 0px 12px", "w": 267, "h": 24 },
  "sidebarActive": { "fontSize": "14px", "lineHeight": "20px", "color": "rgb(0, 0, 0)", "backgroundColor": "oklab(0 0 0 / 0.1)", "borderRadius": "12px", "padding": "6px 12px 6px 16px", "w": 267, "h": 32 },
  "groupLabel": { "fontSize": "12px", "fontWeight": "600", "lineHeight": "16px", "color": "rgb(22, 22, 22)", "textTransform": "none" },
  "groupLabelText": ["Get Started", "Core Endpoints", "More"],
  "contentW": 1112,
  "contentMaxWidth": "1152px",
  "toc": { "w": 304, "h": 748, "color": "rgb(111, 111, 111)", "padding": "0px 0px 0px 40px" },
  "h1": { "fontSize": "36px", "fontWeight": "600", "lineHeight": "40px", "letterSpacing": "-0.9px", "color": "rgb(22, 22, 22)" },
  "callout": { "backgroundColor": "rgb(239, 246, 255)", "border": "1px solid rgb(191, 219, 254)", "borderRadius": "16px", "padding": "16px 20px", "w": 632, "h": 74 },
  "header": { "position": "sticky", "w": 1440, "h": 96 },
  "search": { "fontSize": "14px", "backgroundColor": "oklab(0.144787 0.00000661612 0.00000289828 / 0.03)", "borderRadius": "9999px", "padding": "0px 12px 0px 14px", "w": 384, "h": 36 },
  "copyButtons": 17,
  "fonts": ["Inter", "ui-monospace", "\"Paper Mono\""],
  "scrollW": 1440
}
```

Scrape page extras (`measure2.json`): code `fontSize 14px / lineHeight 24px`, wrapper radius 14px; tab strip h=34, tab 12px/500; inline code radius 6px padding `2px 8px`; TOC 304 wide with 47 links; card radius 16px with 1px border at 10 percent black.

### 2.11 Takeaways for Helix docs (borrow structure, own identity)

Structure worth taking: sticky 288px grouped sidebar with client-logo rows for agent setups; one install card with per-client tabs and state hints ("Install plugin", "One click", "Copy config", "Run in terminal"); `.md` twin for every page plus a Copy page button and an llms.txt pointer in the first lines; language tab strips with copy; collapsed Response accordions; a 304px "On this page" rail with active rule; a 632px reading column. Do not take: orange palette, flame logo, Inter plus Paper Mono pairing, ASCII-art banner, the copy.

---

## 3. Article UI (blog post, https://www.firecrawl.dev/blog/introducing-alexandria-series-b)

Title: "Introducing Alexandria and our $75M Series B". Author Caleb Peffer, Sep 22, 2026 (as shown on the page).

- Frame: a 1112px central "sheet" with faint vertical rules and plus-mark corner ornaments at x=164 and x=1276. Orange announcement banner above the nav ("Introducing Alexandria and our $75M Series B. Read the announcement →"), main nav (Products, Resources, Pricing, Docs, Blog, Playground, GitHub star chip, Sign up).
- Header block centred: breadcrumb "‹ Blog", H1 52px / 56px, weight 500, letter-spacing -0.52px, family Suisse (loaded face "suisse"), colour near-black; author row with avatar, name, dot, date.
- Hero image 752px wide, ASCII-art style, below the header with a divider line above.
- Body column: article width 687 px starting x=344 (centred in the 1112 sheet). Body 16px / 24px, colour rgb(55,65,81). Measured about 78 characters per line (two-line sample: 156 chars over 2 lines). Paragraph margin 24px top and bottom (1.5 line spacing between paragraphs). H2 24px / 32px, weight 500, letter-spacing -0.24px, margin-top 48, margin-bottom 24. No H3 in this post. Links: weight 500, underlined, colour near-black. Code block: GeistMono 14px / 22px, panel padding 12px 16px, tinted 1 percent black band that bleeds 32px past the text column on both sides.
- Table of contents: a floating card fixed to the left (225 x 322 px at x=10, y=289 after scrolling), title "Table of Contents", five H2 entries, active entry orange, others grey. It is not visible at the very top of the page, so it appears with scrolling (appears at scroll offset 1900 in my capture; exact trigger not measured).
- CTA card: a floating card fixed to the right: small "// Get started //" kicker, "Ready to build?", one line of copy, orange "Start for free", a "Connect Firecrawl" dropdown with ChatGPT / Claude / Cursor logos, "See our plans", and a faint "Are you an AI agent? See setup options" link. A second, inline CTA ("Use Firecrawl in your agent. Add Firecrawl to ChatGPT, Claude, Cursor and more in one click." with a Connect Firecrawl button) sits after the last paragraph, then the "Ready to build?" band repeats.
- Author block at the end: avatar, name, handle (@CalebPeffer), role ("CEO of Firecrawl"), "About the Author" bio paragraph, "More articles by Caleb Peffer" with three title links.
- Footer: tagline "The easiest way to get data from the web", Backed by Y Combinator, SOC II Type 2 badge, social links, four link columns (Products, Use Cases, Resources, Company).
- Mobile 390: banner wraps to two lines, nav collapses to hamburger, H1 centred in about 36px, hero image full width, body 16px with 24 px side gutter; no TOC or side CTA visible in the first screen (the screenshot stops before they could appear; UNVERIFIED below the fold).

Cross-check: Harry's pasted text matched the page: "brings data providers, custom connectors and Firecrawl's own indexes together with the live web, so your AI agent has one way to find a source, see what it holds and pull from it"; the 21 percent claim is stated verbatim ("AI agents using Alexandria scored 21% higher on answer quality than those using built-in web tools... same model and prompts across 845 tasks, with blind AI judging"). I did not find a dedicated benchmark page for the 845-task study on the pages I opened, so treat it as an unpublished, vendor-stated number.

---

## 4. Alexandria

Pages opened: https://alexandria.firecrawl.dev/ (home), https://alexandria.firecrawl.dev/llms.txt, https://alexandria.firecrawl.dev/benchmarks.md, https://alexandria.firecrawl.dev/firecrawl-gov-index (provider page), https://docs.firecrawl.dev/features/alexandria (docs), https://docs.firecrawl.dev/mcp-server/tools.md, plus the Research, Developer and Government Index docs.

### 4.1 How it is explained

- Pitch (blog, docs): "The knowledge library for superintelligence." One way to discover a source, understand what it provides, and retrieve from it, through the Firecrawl API, MCP server or CLI. Sources: live web, third-party data providers, Firecrawl's own indexes, custom connectors.
- Vocabulary from its llms.txt: a **provider** supplies data and has a page at `alexandria.firecrawl.dev/<provider>`; a **tool** is one thing an agent can call, addressed as `provider` + `capability`; some tools are Firecrawl's own and chain others.
- Home page: orange full-bleed hero with ASCII-art flanks; one-line promise; "Explore Alexandria" button next to a "Connect Firecrawl" dropdown (client logos); a search box "What should your agent do?"; filter chips with counts (All 53, Lead gen 4, Finance 3, Search 3, Public records 9, E-commerce 2, Maps & reviews 4, Social 3, Listings 5, Developer 5, +6 more); a 4-up grid of use-case cards (Company enrichment, Company search & lists, People search & profiles, Email & phone finding, Financial statements, Market prices & quotes, Economic indicators, SEO & search results), each with a stack of provider logos and a "+28" overflow count; pagination "1 / 7"; nav Tools, Providers, Benchmarks, Rankings, Datasets, Docs.
- Provider page pattern (Government & Legal Index): back link "All providers"; "Use it in Claude or ChatGPT" and Sign in / Sign up; mono-caps kicker with category; H1; description; a "Try in agent" example prompt; a live "Try X now" box with a client selector; "Try asking" example prompts; a typed request form with fields marked REQUIRED (query string, top k number, domain string, full content boolean) and tabs Request / Agent / Docs plus Reset. Page also carries sample responses and code (per their llms.txt).
- Category pages: 24 categories (counts they state): Public records 217 providers, Company 124, Retail 69, Finance 47, People 41, Health 39, Life sciences 37, Real estate 35, Entertainment 25, Places 24, News 23, Developer 22, Travel 21, Research 18, Jobs 18, AI models 13, Marketing 12, Sports 14, Social 10, Restaurant 10, Apps 6, Tools 3, Web analytics 1, Podcasts 1.
- Free tools and guides: 21 "free tools" (each a ready-made prompt for ChatGPT, Claude or any connected assistant); roughly 100 guide pages ("How to use Claude for legal research"), Prompts and Rankings pages; Datasets (Parquet, JSONL, CSV with rights basis and license per row).
- Docs page: opens with an animated dark terminal demo with tabs Podcasts / Finance / Retail and a Pause control, then CLI/MCP tabs, SDK examples.

### 4.2 Source discovery, description, retrieval (the API and MCP shape)

From https://docs.firecrawl.dev/features/alexandria (llms-full.txt, line 6353 onward) and the MCP tools page:

1. **Discover.** `POST /v2/search` with `sources: ["web","alexandria"]` (or `["alexandria"]` for tools only). Response has `web` pages and ranked `tools`, each with provider, capability, description. CLI: `firecrawl search "<task>" --sources web,alexandria --domain-tools`, or `firecrawl search alexandria "<task>"`. `domainTools: true` on a search or URL scrape adds tools matched to the site (`matchedBy`, `matchedUrls`); on by default in search when sources include alexandria, off by default for URL scrapes.
2. **Describe.** `findTools` / `find_tools` (MCP `firecrawl_find_tools`, CLI `firecrawl find-tools --options '{"providers":["particle"],"level":"tools","expand":["options","response"]}' --include-costs`). Browsing is hierarchical (categories, then providers, then tools); every item has a `next` request for the next level; top-level `next` paginates. A tool's contract exposes `options`, `response` and price. Free.
3. **Retrieve.** `POST /v2/scrape` with `{"alexandria": {"provider": "particle", "capability": "podcasts/episodes/search", "options": {"semantic_search": "AI agents", "limit": 2}}}` instead of a `url`. Result in `alexandria[0].data` (or an `error`). MCP accepts an array of up to 10 calls per `firecrawl_scrape`. CLI short form: `firecrawl scrape particle/podcasts/episodes/search --options '{...}'`; tool addresses never fall back to a URL scrape. Header `x-request-id` shown in the cURL example.
4. **Agent use.** `/agent` requests send `exchange: { "enabled": true }` and may pin up to five providers with `toolkits`; runs skip providers whose terms the team has not accepted and list them in `exchange.skippedProviders`; `requireApproval` lets a run stop before a paid provider call and return a `pendingApproval`.
5. **Terms gate.** Provider error `THIRD_PARTY_DATA_TERMS_REQUIRED` with `requiresAction.url`; an org admin accepts at the dashboard Data sources settings; the docs say an agent must not accept terms itself and the CLI cannot. `firecrawl alexandria terms show <provider>` prints the terms.
6. **Feedback loop.** `firecrawl alexandria feedback` or MCP `firecrawl_feedback` with `endpoint: "alexandria"`, only within 20 minutes of the team's last Alexandria call (else `FEEDBACK_WINDOW_EXPIRED`); each submission refunds 1 credit, capped at 10 credits per website and 100 per team per UTC day. A 5,000-credit bounty banner for feedback interviews appears on the Introduction page.

### 4.3 Provider payments and pricing (as stated)

- Blog: "We already pay official data providers through individual agreements, most notably Wikimedia Enterprise... Millions of requests for Wikipedia data flow through Firecrawl each month." Funding will go to "help individuals, content creators and organizations earn from what they know through a self-service system we plan to open soon"; "Become a provider" call to action. The blog says it will pay providers "when AI agents use it".
- Docs: discovery is free; execution is charged at each tool's listed price; Firecrawl's own Government and Research indexes are free but rate-limited (Government 300 calls a minute on every plan, Research 100 a minute, each with a plan-based daily limit; Scale and Enterprise have no daily limit). Developer Index search costs 2 credits per 10 results (rounded up). No numeric price list for third-party tools is on the docs page; the price is per tool.
- ZDR: Agent zero-data-retention runs use only Alexandria providers that support ZDR; ZDR searches do not return Alexandria data tools.
- Benchmarks (Alexandria side): per use-case leaderboards "measured on every Alexandria call": success rate, empty rate, latency, cost; 53 use cases, 1.5M calls in the last 24 hours; a provider needs 20 or more calls to be ranked. Example leaderboard rows: Search trends & keywords 4 providers; People search 21 providers. Separate Rankings page by call volume.

### 4.4 The three named indexes

| Index | Docs page | Scope they state | Endpoint | Cost they state |
|---|---|---|---|---|
| Research Index | https://docs.firecrawl.dev/features/research.md | about 43 million paper abstracts: PubMed, bioRxiv, medRxiv, arXiv; passage-level reads; related/cited papers | `GET /search/research/papers`, `/papers/{id}`, `/papers/{id}/similar`; MCP `firecrawl_research_*`; CLI `firecrawl research search-papers` | free; 100 calls a minute |
| Developer Index | https://docs.firecrawl.dev/features/developer.md | issues, merged PRs, READMEs, curated docs; llms.txt says 70M+ items; types `doc`, `issue`, `pull_request`, `readme`; stable ids like `issue:owner/repo#123` | `GET` or `POST /search/developer` (also `/search` with `categories:["developer"]`); MCP `firecrawl_developer_search`; CLI `firecrawl developer` | 2 credits per 10 results |
| Government Index | https://docs.firecrawl.dev/features/gov.md | US federal, state and local statutes, regulations, codes, court opinions; 30M+ pages (provider page) / 30M+ data points (llms.txt) | `GET` or `POST /search/gov`; filters `jurisdiction`, `court`, `courtType`, `cites`, `domain`; MCP `firecrawl_gov_search`; CLI `firecrawl gov` | free; 300 calls a minute |

Disagreement noted: the blog says "tens of millions" for Research, docs say about 43 million, the changelog (via llms.txt) says 41M+ life-sciences papers; these are different scopes more than a conflict. Government size is "30M+ pages" on the provider page and "30M+ data points" in llms.txt. The Developer Index changelog line in llms.txt says "70M+ docs, READMEs, GitHub issues and merged pull requests"; the blog says "tens of millions of primary sources". Also: the Research docs note that `GET /search/research/github` was removed 2026-11-03 (HTTP 410), moved to the Developer Index.

---

## 5. Feature-Gap Table (Firecrawl vs Helix)

Helix column reads from the surface Harry listed. "Not in listed surface" means I did not find it in that list; check the code before acting.

| Firecrawl name | What it does (one line) | Helix today | Suggested Helix move |
|---|---|---|---|
| Scrape (`/v2/scrape`) | URL to markdown, HTML, JSON, screenshot, links, images, summary, attributes, branding, product | HAS: `scrape` | Add `summary`, `branding`, `product` formats if absent; keep default markdown |
| Batch scrape | Many URLs in one job, per-job `maxConcurrency` | HAS: `batch scrape` | Expose `maxConcurrency`; add errors endpoint parity (`get_job_errors` exists) |
| JSON mode / Extract | Structured JSON by prompt or schema; Extract tool deprecated by them | HAS: `extract` | Keep; add schema-less prompt mode with a returned inferred schema |
| Search (`/v2/search`) | Web search returning full page content; sources web, news, images; categories incl. research, developer | HAS: `search` | Add `categories` filter and result `sources` groups (web, news, images) |
| Crawl | Recursive crawl with path filters, webhooks, cancel | HAS: `crawl` (estimate, cancel, incremental: ahead of them) | Market the estimate and incremental modes; add a webhook-on-complete option |
| Map | List all URLs on a site fast, with search filter | HAS: `map` | Add `search` filter and subdomain and sitemap controls if missing |
| Parse (local files) | PDF, DOCX, XLSX, HTML to markdown or JSON; 20 file types; OCR | HAS: `parse`, `document` | Add XLSX and HTML if missing; per-page cost estimate like their 1 credit per PDF page |
| Interact + Browser Sandbox | Prompt or code against a live scraped page; returns `cdpUrl`, `liveViewUrl` | HAS: `interact` (sessions with actions) | PARTIAL: add natural-language `prompt` mode, live view URL and a stop call |
| Monitor | Scheduled checks on pages, a crawl or a search; page states same/new/changed/removed/error; goal-based judgement; webhook, email, Slack | HAS: `monitor` (diffs, summaries) | PARTIAL: add monitoring a search or a crawl target, plain-language goal, per-page status labels, Slack and email sinks |
| Agent (`/v2/agent`, Spark 2 model) | Autonomous multi-source gathering; async; `maxCredits`; approvals; webhooks | HAS: `agent` | PARTIAL: add max-credit cap, status/cancel, approval before paid calls (matters once Amber has paid sources) |
| Change tracking (format) | Diff between scrapes inside scrape | HAS: `diff` | Fold into scrape as a `changeTracking` format |
| Faster scraping (`maxAge`) | Serve cached page when fresh enough | Not in listed surface | MISSING: add `maxAge` cache with a "served from cache" flag; cheap local win |
| Enhanced mode / proxies | Stealth proxy escalation on hard sites | HAS: job ladder inspection (escalation tiers) | Document the ladder as a feature; add proxy settings page |
| PII redaction | Strip personal data from scrape output | Not in listed surface | MISSING: add `redactPII` option (regex plus local NER) |
| Zero data retention | Do not persist content | Local product, so trivial | Say so on the docs and site: "nothing leaves this machine" |
| Webhooks (events, security, testing pages) | Signed event delivery for crawl, batch, agent | Not in listed surface | MISSING: signed webhooks with a test button in the dashboard |
| Download (CLI skill `firecrawl-download`) | Save a site as local files | Not in listed surface | MISSING: `helix download <url>` writing a folder of markdown |
| Search with `domainTools` | Match data tools to a website | Not applicable yet | Becomes an Amber feature: tools matched to a URL |
| Alexandria discovery (`find_tools`, `sources:["alexandria"]`) | Catalogue of data tools with contracts and prices | MISSING | Build **Amber** (see section 6) |
| Alexandria execution (`scrape` with `alexandria`) | Call a provider tool by provider/capability | MISSING | Amber `amber_query` call with the same address shape |
| Research Index | Paper search, passage reads, citations | MISSING (`vectors search` is a generic store) | Amber research source: arXiv plus OpenAlex local index |
| Developer Index | Issues, PRs, READMEs, docs search | MISSING | Amber developer source over the GitHub public API and the user's own repos |
| Government Index | Statutes, regulations, court opinions with filters | MISSING | Amber government source over Federal Register, eCFR, CourtListener, GovInfo |
| MCP server (hosted, keyless, OAuth, API key; local) | Tools list incl. `find_tools`, research, developer, gov, monitor | HAS: MCP server | PARTIAL: add discovery tools, a "tools matched to this URL" call, and a `doctor` tool |
| CLI (`init --all --browser`, `setup`, `doctor`, `--status`) | One command installs skills into every detected agent | HAS: CLI package | PARTIAL: add `helix init` that writes skills for Claude Code, Cursor, Codex; add `helix doctor` |
| Skills (12 CLI, 5 build, 16 workflow) | Drop-in agent skills | MISSING (not in listed surface) | Ship a `helix-skills` pack: scrape, search, crawl, monitor, amber |
| Workflow skills (deep research, SEO audit, QA, knowledge base ...) | Outcome-focused deliverables | MISSING | Start with three: deep-research, knowledge-base, site-QA |
| `llms.txt` plus `.md` twins plus Copy page | Agent-readable docs | MISSING for Helix docs (check) | Generate llms.txt and `.md` from the docs source |
| SDKs (Python, Node, Go, Java, Ruby, Rust, .NET, PHP, Elixir) | Official libraries | HAS: TypeScript SDK | Generate Python from openapi.yaml first |
| OpenAPI | v2 spec JSON | HAS: openapi.yaml | Serve it at `/openapi.json` and link from llms.txt |
| Credit usage / billing | Credits per endpoint | HAS: job cost and ladder inspection | Rename "credits" to local "work units" with time and tokens |
| Benchmarks (public pages, methodology, open dataset) | Vendor-run leaderboards | MISSING | Section 8 |
| Dashboard with playground | Web app | HAS: dashboard with playground | Add per-endpoint request builder and a "Copy as curl/SDK/CLI" tab strip |
| VS Code extension | None found in the pages I opened | HAS (Helix only) | Keep; Firecrawl has no VS Code surface in what I read |
| Helix-only: enrich, image sheet, metadata scan, robots check, vectors search | Not found in Firecrawl's docs lists I read | HAS | Keep; Firecrawl has an Enrich-style flow only through Alexandria providers |

Six biggest "missing or partial" rows: (1) Alexandria-style data layer; (2) Research, Developer and Government indexes; (3) agent skills pack plus `init`/`doctor`; (4) Monitor depth (goal, search target, sinks); (5) webhooks plus `maxAge` cache; (6) benchmarks page.

---

## 6. What Amber Should Be for a Local, Single-User Product

Shape to copy from Alexandria (their API calls: `search` with a source flag, `find_tools`, `scrape` with an address): one catalogue, three verbs.

- `amber_find`: free, lists categories, providers, tools; `expand` options and response; matches tools to a URL or a task.
- `amber_describe`: contract for one tool (options, response, rate and terms notes, "needs key" flag).
- `amber_run`: provider/capability + options, up to 10 per call, result `data` or `error`.
- Terms: a per-source `terms` record and a local accepted flag; an agent never flips the flag (their rule).
- Local index: sources with a bulk dump are indexed into local storage (Postgres plus embeddings the product already has); sources with only an API are called live and cached with `maxAge`.
- Stats per source: calls, success, empty rate, latency (their Alexandria benchmarks track these per call), shown in the dashboard.
- Single user means no payments: skip billing and provider payouts; keep a "terms and license" column per row (their datasets keep license per row).

Candidate open sources. Terms and limits below are from my memory of these services and are **UNVERIFIED this session** (I did not load these hosts; budget for page loads was spent). Check each before building.

| Source | Access URL | Local form | Terms and limits (UNVERIFIED) |
|---|---|---|---|
| Wikipedia | Dumps https://dumps.wikimedia.org/ ; REST API https://en.wikipedia.org/api/rest_v1/ ; Action API https://en.wikipedia.org/w/api.php | Dump into local index; API for freshness | Text CC BY-SA 4.0; send an identifying User-Agent; keep request rate modest; Wikimedia Enterprise is the paid product Firecrawl says it pays for (blog) |
| arXiv | API http://export.arxiv.org/api/query ; OAI-PMH https://oaipmh.arxiv.org/oai ; bulk metadata snapshot (Kaggle mirror) | Local metadata index; link out to full text | Metadata reuse is permissive (CC0 stated by arXiv); API etiquette about one request every 3 seconds; per-paper full-text licences differ |
| OpenAlex | https://api.openalex.org ; data snapshot at https://docs.openalex.org/download-all-data/openalex-snapshot | Snapshot into local index for citation graph and author/venue; API for fresh | Data CC0; API may now need a free key and has a daily cap (UNVERIFIED; check the current docs) |
| PubMed / NCBI | E-utilities https://eutils.ncbi.nlm.nih.gov/entrez/eutils/ ; baseline files https://ftp.ncbi.nlm.nih.gov/pubmed/baseline/ | API for the long tail, baseline for a local index | About 3 requests a second without a key, 10 with; abstract copyright stays with publishers; read NLM terms |
| GitHub public data | REST/GraphQL https://api.github.com ; events archive https://www.gharchive.org/ | API per repo (issues, PRs, READMEs) cached locally | 60 requests an hour unauthenticated, 5,000 with a personal token; each repo's licence governs reuse; GitHub ToS bar bulk scraping of the website (use the API) |
| Federal Register | https://www.federalregister.gov/developers/documentation/api/v1 | Local index of rules and notices | No key, US government work, generally public domain |
| eCFR | https://www.ecfr.gov/developers/documentation/api/v1 | Local index of CFR text | Public domain; no key (UNVERIFIED) |
| GovInfo | https://api.govinfo.gov ; bulk https://www.govinfo.gov/bulkdata | Bulk XML to local index | Free key from api.data.gov; public domain for federal works |
| CourtListener | https://www.courtlistener.com/api/ ; bulk data via Free Law Project | API plus bulk opinions | Free account token; opinions are public documents; Free Law Project asks for fair use of API rate |
| SEC EDGAR | https://www.sec.gov/edgar ; submissions API https://data.sec.gov | API with cache | About 10 requests a second maximum and a descriptive User-Agent required; public filings |
| data.gov | CKAN https://catalog.data.gov/api/3 | Catalogue search, then fetch dataset links | Per-dataset licence |

Four to start with: **Wikipedia (dumps plus REST)**, **arXiv plus OpenAlex** (research), **GitHub public API** (developer), **Federal Register plus eCFR plus CourtListener** (government). They mirror Firecrawl's three named indexes and need no paid deals.

---

## 7. Agent Surfaces Firecrawl Ships (from the docs)

Sources: https://docs.firecrawl.dev/mcp-server/tools.md, https://docs.firecrawl.dev/sdks/cli.md, https://docs.firecrawl.dev/ai-onboarding.md, https://www.firecrawl.dev/SKILL.md, https://www.firecrawl.dev/llms.txt.

**MCP tools** (hosted at `https://mcp.firecrawl.dev/v2/mcp` keyless, `/v2/mcp-oauth` browser sign-in, or `/v2/mcp` with an API key bearer; local package needs Node 22+): `firecrawl_scrape`, `firecrawl_map`, `firecrawl_search`, `firecrawl_find_tools`, `firecrawl_parse`, `firecrawl_crawl`, `firecrawl_check_crawl_status`, `firecrawl_agent`, `firecrawl_agent_status`, `firecrawl_interact`, `firecrawl_interact_stop`, `firecrawl_research_*`, `firecrawl_developer_search`, `firecrawl_gov_search`, `firecrawl_monitor_*` (create, list, update, run, inspect, delete), `firecrawl_search_feedback`, `firecrawl_feedback`. Keyless hosted mode exposes only search, scrape, parse. Extract tool deprecated. Optional feedback tools are switched off with `FIRECRAWL_NO_SEARCH_FEEDBACK=1` and `FIRECRAWL_NO_ENDPOINT_FEEDBACK=1`. Parse of a local file on the hosted server uses a two-call upload handoff with a signed upload target.

**CLI** (`npm install -g firecrawl-cli`; works keyless for some commands): `login` (`--browser`, `--api-key`), `logout`, `view-config`, `--status`, `init`, `setup skills|build|workflows|developer-index`, `scrape`, `search` (sources, categories, time, location, `--scrape`), `alexandria list`, `alexandria terms show`, `alexandria feedback`, `find-tools`, `developer`, `gov`, `research search-papers`, `map`, `interact` and `interact stop`, `crawl` (status, cancel, webhook, filters), `monitor create|run|checks|check|update|delete`, `agent`, credit usage, `doctor`, `--api-url` for a self-hosted API. Global options include `--pretty`, `--json`, `--output`.

**Skills**: three repos (`firecrawl/cli`, `firecrawl/skills`, `firecrawl/firecrawl-workflows`). 12 CLI skills (firecrawl, search, scrape, interact, crawl, map, agent, monitor, parse, download, research-index, developer-index). 5 build skills (build, build-onboarding, build-scrape, build-search, build-interact). 16 workflow skills (umbrella plus deep-research, seo-audit, lead-research, lead-gen, qa, competitive-intel, market-research, research-papers, company-directories, dashboard-reporting, knowledge-base, knowledge-ingest, demo-walkthrough, shop, website-design-clone).

**`init --all --browser`**: `--all` initialises every detected agent without prompts; `--browser` opens the browser for sign-in; also `--skip-auth`, `--skip-install`, `--skip-skills`, `--agent <name>`. It installs the CLI plus CLI and workflow skills but does not register MCP or connect ChatGPT and Claude accounts (stated in SKILL.md). Docs say to restart the agent afterwards, then verify with `firecrawl --status` and `firecrawl scrape https://firecrawl.dev`. Build skills come from `firecrawl setup build`.

**Other agent routes**: native plugin and connector pages for ChatGPT & Codex and Claude (one-click), Claude Desktop and Cowork guide, Cursor one-click, OpenCode config, GitHub Copilot guide; Stripe Projects provisioning (`stripe projects add firecrawl/api --name firecrawl`); agent self-registration through WorkOS ID-JAG (`auth.md`); an AgentID browser sign-in mentioned in SKILL.md; a hidden "Documentation Index" hint on every docs page; "Are you an AI agent? See setup options" CTA on site pages.

---

## 8. Benchmark Definition (https://www.firecrawl.dev/benchmarks and sub-pages)

- Firecrawl says the benchmarks are vendor-run and "open retrieval evaluations", with each page saying what data and code are published. Rules stated under "How we benchmark": same input for everyone, default settings, no per-system tuning, no dropping hard cases; metrics are computed against human-annotated answers, not model-judged; own numbers included; every result dated and changelogged.
- Scrape coverage run (Jan 13, 2026), listed under "Also published" with no page of its own: 1,000 URLs from ten categories of public pages, dataset `firecrawl/scrape-content-dataset-v1` (Hugging Face). A URL counts as covered when the tool retrieved at least 10 percent of the expected content (core page text without navigation, ads, footers). They state coverage 96 percent, extraction F1 0.638, content recall 0.639, P95 latency 3,387 ms. The 10 percent threshold is loose; Helix should publish a stricter pair (coverage at 50 percent and at 90 percent) alongside any number.
- Legal Retrieval (Nov 03, 2026): 581 requests, one frozen official answer each, exact match on canonical URL; metrics gold@1, gold@10, bad@10 (lower is better); 5 systems; the public half of data and scoring code on GitHub; Firecrawl index 76.2 percent gold@1, Claude Code with built-in search 71.4, Exa 59.6, Parallel 54.2 (as they state). Prices they list: Exa $0.007 and Parallel $0.005 per search call.
- DevDex developer retrieval (Aug 21, 2026): 1,179 tasks in three tracks (repo, issue/PR, docs), Recall@10 and MRR@10 over the agent's first ten citations, one agent (they name Claude Opus 4.8) driving every system with one search tool and ten results per call, memorisation gate that drops items answerable without search, 95 percent confidence intervals, harness and a 594-item public sample at `firecrawl/benchmark-devdex`. Competitors named: Parallel, Mintlify, Exa, Context7, native web search, no tools; Firecrawl Developer Index 63.1 percent overall recall (they state).
- Others: Company Enrichment (200 companies, 6 providers, graded against SEC filings), Fantasy Data (272 NFL questions), plus third-party studies shown with Firecrawl's loss as well as wins (for example it places twelfth of sixteen on one multi-hop board). This disclosure style is worth copying.
- Alexandria's own benchmarks are live telemetry (success, empty rate, latency, cost per provider and use case, 20+ calls to rank), not a fixed dataset.

Helix benchmark proposal (concise): publish `helix-bench` with a frozen URL set and gold text, report coverage at three thresholds, P50/P95 latency per tier of the ladder, cost per page, and run Helix, plain `curl` plus readability, and Firecrawl's self-hosted build on the same set with the harness and a public half of the data in the repo; show losses.

---

## 9. Open Issues and Caveats

- Script measurement errors: in `measure.json` the `h2`, `h3`, `p`, `pre` fields point at hidden or unrelated nodes (the hidden "Documentation Index" heading is one). I used `measure2.json` and screenshots for those and flagged each estimate.
- Dark-mode measurements came from a forced class plus media emulation, not from clicking the theme toggle.
- Docs search palette, the Copy page dropdown contents, tab-sync behaviour and mobile sidebar drawer were not opened.
- The blog's TOC and CTA cards were seen only at scroll offset 1900 on desktop; mobile behaviour below the fold unverified.
- Their numbers (96 percent coverage, 63.1 percent recall, 76.2 percent gold@1, 21 percent higher answer quality across 845 tasks) are vendor claims; only the Developer and Legal pages publish a method and partial data.
- Open-source terms in section 6 are from memory, unverified this session.
- Helix `helix_scrape` could not read any Firecrawl-hosted URL I tried (HTTP 404) while plain `curl` could; used `curl` for text and Playwright for rendering.

## 10. URLs Opened (status)

Fetched with curl (text) or Playwright (render and measure). "soft 200" means the server answered 200 with the blog index instead of the post.

- 200: https://www.firecrawl.dev/llms.txt ; https://docs.firecrawl.dev/llms.txt ; https://docs.firecrawl.dev/llms-full.txt
- 200: https://docs.firecrawl.dev/introduction (render) and `.md` ; https://docs.firecrawl.dev/features/scrape (render) and `.md` ; https://docs.firecrawl.dev/mcp-server (render) and `.md` ; https://docs.firecrawl.dev/mcp-server/tools.md ; https://docs.firecrawl.dev/sdks/cli.md ; https://docs.firecrawl.dev/ai-onboarding.md ; https://docs.firecrawl.dev/quickstarts/claude-code (render) and `.md` ; https://docs.firecrawl.dev/features/alexandria (render) ; https://docs.firecrawl.dev/features/research.md ; https://docs.firecrawl.dev/features/developer.md ; https://docs.firecrawl.dev/features/gov.md
- 200: https://alexandria.firecrawl.dev/ (render and html) ; https://alexandria.firecrawl.dev/llms.txt ; https://alexandria.firecrawl.dev/benchmarks.md ; https://alexandria.firecrawl.dev/firecrawl-gov-index (render and text)
- 200: https://www.firecrawl.dev/blog/introducing-alexandria-series-b (render, text, scroll capture) ; https://www.firecrawl.dev/benchmarks (render) and `.md` ; https://www.firecrawl.dev/benchmarks/devdex (render) ; https://www.firecrawl.dev/benchmarks/legal-retrieval (render) ; https://www.firecrawl.dev/SKILL.md ; https://www.firecrawl.dev/developer-index (html saved, not read in full) ; https://www.firecrawl.dev/gov-index (html saved, not read in full) ; https://www.firecrawl.dev/blog (index scan for post slugs)
- soft 200 (blog index instead of the post): https://www.firecrawl.dev/blog/introducing-alexandria-and-our-75m-series-b.md ; https://www.firecrawl.dev/blog/introducing-alexandria
- 404: https://www.firecrawl.dev/benchmarks/devdex.md ; https://www.firecrawl.dev/benchmarks/legal-retrieval.md
- Helix tool: `helix_scrape` on the two llms.txt URLs and docs `mcp-server.md` returned `service_unavailable (HTTP 404)`; https://example.com worked.

The total page loads exceeded the "about 40" budget in the strict count because several `.md` twins and renders were fetched; no login, sign-up or install was done.

## 11. Screenshots Saved

All in `D:\scratch\helix-revamp\firecrawl-docs\shots\`:

docs-intro-1440-light.png, docs-intro-1440-dark.png, docs-intro-1440-full.png, docs-intro-390-light.png, docs-intro-390-dark.png, docs-scrape-1440-light.png, docs-scrape-1440-full.png, docs-scrape-390-light.png, docs-mcp-1440-light.png, docs-mcp-1440-full.png, docs-mcp-390-light.png, docs-claude-code-1440-light.png, docs-claude-code-1440-full.png, docs-claude-code-390-light.png, docs-alexandria-1440-light.png, docs-alexandria-1440-full.png, docs-alexandria-390-light.png, alexandria-home-1440-light.png, alexandria-home-1440-full.png, alexandria-home-390-light.png, alexandria-provider-1440-light.png, blog-series-b-1440-light.png, blog-series-b-1440-full.png, blog-series-b-1440-scrolled.png, blog-series-b-390-light.png, benchmarks-1440-light.png, benchmarks-1440-full.png, benchmarks-390-light.png, benchmark-devdex-1440-light.png (29 files).

Scripts: `capture.mjs`, `measure2.mjs`, `dump-text.mjs`, `blog-toc.mjs` in the same folder (Playwright imported from `D:\Helix\node_modules\playwright`, run with the existing `chromium_headless_shell-1248` binary; no browser installed).
