# Firecrawl site IA teardown (structural, not visual)

## Route families (firecrawl.dev)
/ · /pricing · /playground · /blog[/slug] · /changelog
/scrape /crawl /search /parse /interact /monitor   <- ONE LANDING PAGE PER CAPABILITY
/developer-index
/alternatives/firecrawl-vs-[competitor]  <- 20 COMPARISON PAGES + hub
/use-cases[/...] · /about /careers /security
/signin?view=signup
status.firecrawl.dev (Statuspage) · community.firecrawl.dev (Discourse) · docs.firecrawl.dev

## Nav pattern
Top nav SPARSE + CTA-weighted: Products(dropdown) Resources(dropdown) Pricing Docs Blog Playground Signup
Footer IS the sitemap: 5 columns (Products 7, Use Cases 5, Documentation, Company, Social)

## Docs (Mintlify)
Max depth 3. BREADTH OVER DEPTH — 41 separate quickstart pages (one per framework:
Node/Next/Express/Nest/Fastify/Hono/Bun/Remix/Nuxt/SvelteKit/Astro/Mastra, CF Workers,
Vercel, Lambda, Supabase Edge, Deno, PHP/Laravel/Ruby/Rails/Python/FastAPI/Django/Flask/
Go/Rust/Elixir/Java/Spring/.NET, + agent tools: Claude Code/Cursor/OpenCode/Codex/Amp/
Windsurf/Gemini CLI/AutoGen). Deliberate SEO play — each matches a discrete query.
17 integration pages. 9 SDK pages. 12 use-case pages (duplicated with marketing).
API reference OPENAPI-DRIVEN: v2-openapi.json, v1-openapi.json, webhooks-openapi.json, v0.
THREE API generations documented concurrently.

## LLM-READABLE DOCS MIRROR  <-- now a category convention
Every page dual-served: HTML at /path, raw markdown at /path.md, plus root llms.txt.
Purpose-built for agent consumption.

## Homepage section order + the job each does
1  hero + announcement banner        category framing + fresh-news signal
2  primary CTA band                  one clear conversion moment under the fold
3  capability 4-up grid              teach the noun-verb vocabulary first
4  live code sample, language tabs   self-qualify in <10s without leaving
5  logo carousel                     risk reduction
6  agent/MCP section                 addresses AI-tooling audience separately
7  METRICS BAND (coverage%, P95, token%)  quantified claims instead of adjectives
8  open-source proof (stars, commits)     codebase trust, distinct from company trust
9  feature deep-dive                  objection handling AFTER the pitch
10 use-case gallery w/ mini demos     self-identify by scenario not by API verb
11 testimonials (dev quotes from X)   peer validation in audience's own voice
12 FAQ grouped (General/How/API/Billing)  pre-empt support + pricing bounce
=> TWO parallel proof strategies: quantified metrics AND social/community proof.

## Demo strategy — TWO surfaces
- Homepage embedded widgets: runnable WITHOUT signup. Search widget -> JSON. Scrape+interact
  widget -> URL in, sequential actions, JSON out + live view URL.
- Dedicated /playground: tabbed by capability, URL input, "Get code" export button.
  Full execution GATED at signup.
=> Pattern: taste free on homepage, gate the full playground.
[unverified whether playground allows any anonymous runs]

## Conversion
CTA in: top nav, hero, mid-page band, playground, pricing.
Free tier 1,000 credits/mo, 2 concurrent — materially usable, not a teaser.
GATED: playground execution, dashboard, API keys, usage endpoints.
NOT gated: docs, homepage widgets, blog, changelog, comparisons, OpenAPI specs.
Account state is API-FIRST: Activity/Credit Usage/Historical/Queue Status are documented
endpoints, not just dashboard UI.

## GAPS (open positioning space)
- SELF-HOST GUIDE BURIED in docs, absent from marketing nav. Steel.dev puts it on the
  homepage. For an OSS-core product this is undersold vs peers. <-- BIGGEST OPPORTUNITY
- No newsletter signup on blog
- No RSS on changelog (but status page has 6 subscribe channels — inconsistent)
- No browsable template/example gallery as nav item (Apify Store, Browserbase Templates do)
- No marketplace/community contribution concept
- Community is Discourse subdomain, not Discord
- No cost calculator on pricing (just a credit conversion table)
STRENGTH not gap: 20 comparison pages is heavy investment, corrects the assumption that
AI-infra tools skip competitive content.

## Peer IA conventions
Browserbase: nav organised around PRIMITIVES (Browsers/Web APIs/Runtime/Identity/Model
  Gateway/Observability). Dedicated OBSERVABILITY product (session replay/logs/prompt
  debugging) — no Firecrawl equivalent. Templates first-class in nav.
Steel.dev: sparse nav (Sessions API/Pricing/Blog/Docs). LEADS WITH OSS + SELF-HOST on the
  homepage. Named "Session Viewer" feature.
Apify: marketplace-first IA (Actor Store) reframes nav around discovery. Has an ACADEMY
  (multi-course learning path) — a step beyond quickstarts. Affiliate program, startup/
  university/nonprofit discount tiers.

## Net takeaway for Helix
Category convention = flat nav + exhaustive footer · one page per capability · ungated
homepage micro-demo + gated full playground · breadth-over-depth quickstarts + OpenAPI
reference · heavy comparison investment · LLM-readable .md twins.
Differentiation space: session/observability tooling, SELF-HOST PROMINENCE, ecosystem.
