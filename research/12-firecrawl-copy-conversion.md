# Firecrawl copywriting & conversion architecture — Aug 2026

Companion to `10-site-ia.md` (structural IA) and `01-firecrawl-teardown.md` (technical/pricing
teardown). This doc is about the WORDS and the PERSUASION SEQUENCE — written so Helix's copy
can follow the same proven moves without cloning the surface phrasing.

Source captures: `research/firecrawl-capture/out/{home,pricing,playground,cap-scrape,cap-crawl,
cap-search,cap-parse,cap-interact,cap-monitor}-structure.json`. Not yet captured: alternatives,
blog, changelog, docs, signup, devindex.

---

## 1. Homepage section ledger (document order, with pixel heights)

Total page height 16,575px. Order below is DOM order; heights are each section's own box
(some overlap/nest, e.g. hero block sits inside `main` height 16575 as the top-level wrapper).

| # | Height (px) | Heading (verbatim) | Body copy (verbatim) | CTA(s) (verbatim) | Persuasive job |
|---|---|---|---|---|---|
| 1 | 1,129 | H1: **"Power AI agents with clean web data"** | "The context API to search, scrape, and interact with the web at scale. It's also open source." | **Start for free** / **Setup for agents** | Category framing + audience split (human dev vs. agent) in the first CTA pair. Announcement bar above it: *"Introducing the Firecrawl Developer Index, built for supercharging coding agents. Read the announcement →"* — freshness/news signal, also narrows ICP to coding-agent builders on the very first line. |
| 2 | 2,107 | H2: **"Start searching today"** / H2: **"Easily connect with your AI agents"** | "The infrastructure layer that helps AI find, read, and act on the live web." Sub-cards: *"Search the web and get full content from results."* / *"Get llm-ready data from websites. Markdown, JSON, screenshot, etc."* / *"Interact NEW — Scrape a page, then interact with it using AI prompts or code."* | **Learn more** ×3, tabbed code sample (Python/Node/cURL/CLI) | Teach the noun-verb capability vocabulary (Search/Scrape/Interact) immediately, each with its own "Learn more" so visitors self-route to a capability page. Live runnable code sample lets a developer self-qualify in seconds without leaving the page. |
| 3 | 1,809 | H2: **"Fast, reliable, token-efficient. And it's open source"** | "Web data infrastructure built from the ground up." Sub-claims: *"Industry-leading reliability. Covers 96% of the web, including JS-heavy pages."* / *"Blazingly fast. P95 latency of 3.4s across millions of searches and scrapes"* / *"Only the content that matters. No navs, footers, or ads. Just clean markdown, with 93% fewer input tokens"* | **See benchmarks** / **See comparisons** / **Calculate your savings** / **Check out our repo** | Quantified-claims block — three hard numbers (96%, 3.4s P95, 93% fewer tokens) replace adjectives with measurements. Doubles as risk reduction (competitor comparison table shown inline: Firecrawl 96% vs Puppeteer 79% vs cURL 75%) and open-source trust signal via GitHub commit feed. |
| 4 | 2,748 | H2: **"We handle the hard stuff"** | "JavaScript rendering, smart wait, media parsing, search, actions, and more." Five feature callouts: Media parsing (PDF/DOCX), Smart wait, Live web data (index vs. fresh), Enhanced mode, Interact actions | none listed (visual demo cards, no button copy) | Objection handling — the "but does it handle X" list (JS-heavy pages, gated sites, stale cache) answered in one scroll, framed as "zero configuration" to lower perceived setup cost. |
| 5 | 1,256 | H2: **"Transform web data into AI-powered solutions"** | "See how you can give your AI better access to the web with Firecrawl." Use case one-liners: Deep research / Smarter AI chats / AI agent tools / Onboarding / Lead enrichment | **View all use cases** ×2, **Learn more** ×3 | Self-identification by scenario rather than by API verb — lets a visitor who doesn't yet know "scrape vs crawl" find themselves via job-to-be-done instead. |
| 6 | 887 | H2: **"People love building with Firecrawl"** | Tweet-style quotes (see §6) | none (quote cards only) | Peer proof in the audience's own voice/platform (X/Twitter), positioned AFTER the pitch, not before — proof reinforces claims already made rather than opening the page. |
| 7 | 2,621 | H2: **"Frequently asked questions"** | Grouped: General / How It Works / API Related / Billing | expandable accordion, no button copy | Pre-empt support tickets and pricing confusion at the bottom of the funnel; last chance to remove objections before the visitor leaves. |
| — | (in fullText, between testimonials and FAQ, own untitled band) | *"Ready to build?"* | "Start getting web context for free and scale seamlessly as your project expands. No credit card needed." | **Start for free** / **See our plans** / **See setup options** | Final low-friction conversion band — explicitly de-risks with "No credit card needed" right before the FAQ catches remaining doubt. |

**Section-order takeaway:** category hook → capability vocabulary → quantified proof → objection
handling → scenario self-ID → peer proof → final CTA → FAQ. Proof is split into two waves
(quantified metrics mid-page, social/community proof near the end) rather than one block.

---

## 2. Voice analysis

**Register:** direct, imperative, second-person-light (mostly implied "you"/"your" rather than
literal second-person pronouns in headlines — headlines read as noun phrases or short claims,
not commands). Sentence length is SHORT: most homepage lines run 4–14 words. Body copy sentences
rarely exceed ~20 words and are frequently fragments ("One command." "Push, not poll." "Milliseconds,
not minutes.").

**Representative lines (verbatim):**
1. "Power AI agents with clean web data" (H1 — noun phrase, not a sentence)
2. "The context API to search, scrape, and interact with the web at scale." (three-verb capability list)
3. "It's also open source." (short declarative afterthought/differentiator, deliberately terse)
4. "Covers 96% of the web, including JS-heavy pages." (quantified, not "most of the web")
5. "P95 latency of 3.4s across millions of searches and scrapes, built for real-time agents and dynamic apps." (benchmark citation + audience naming in one sentence)
6. "Only the content that matters. No navs, footers, or ads." (fragment + negative-space claim)
7. "One command." (single-word-count minimalism as a subhead)
8. "Push, not poll." (antithesis pattern — X, not Y)
9. "Diffs, not pages." (same antithesis pattern reused — a recurring rhetorical device)
10. "Milliseconds, not minutes." (same pattern a third time — X-word, not Y-word)
11. "Stop polling the web." (imperative H2)
12. "Any document in. Markdown out." (input→output frame, two sentence fragments)
13. "One URL. Every page." (Crawl H1 — same two-fragment cadence as #12)
14. "Give your AI better access to the web with Firecrawl." (rare literal "your AI")
15. "We handle the hard stuff." (first-person "we," casual register break from the otherwise impersonal voice)

**Claims are quantified, not adjectival, wherever a number is available:** 96% coverage, P95
3.4s, 93% fewer tokens, 150,000+ companies, 1.25M developers, 5 billion+ requests, 171.4K GitHub
stars, 400,000+ MCP installs, 2.5M+ weekly SDK downloads, 50x faster (customer quote), 4.7ms vs
1,129.5ms parse benchmark. Where no number exists, copy stays terse rather than reaching for
adjectives ("Blazingly fast" is the one recurring adjectival intensifier, paired every time with
a number immediately after it — the adjective never stands alone).

**Vocabulary:** technical but not academic. Domain terms used without definition (markdown, JSON
schema, webhook, CDP, Playwright, OCR, P95, rate limits) — assumes a developer reader. No jargon
inflation; avoids marketing superlatives like "revolutionary" or "game-changing." The one
consistent brand adjective is "clean" (clean markdown, clean data, clean output) — used as the
single differentiator word across every capability page.

**Recurring rhetorical moves:**
- **"X, not Y" antithesis** — "Push, not poll" / "Diffs, not pages" / "Milliseconds, not minutes" — used as a subhead pattern across at least 3 different pages (Monitor, Parse).
- **Input→output two-fragment framing** — "Any document in. Markdown out." / "One URL. Every page." — sentence broken into a noun-phrase pair rather than a full sentence, used as page H1/H2s.
- **"For AI agents / AI-ready" framing appended to every capability** — every /cap-* page repeats the identical section "Built into the AI tools you already use" verbatim, and every H1 pattern is "[Capability] API — Part of the Firecrawl context API" or "[Capability] API for AI agents."
- **Noun-verb capability naming** — Search / Scrape / Parse / Interact / Crawl / Monitor are always capitalized as proper-noun product names, never lowercased as generic verbs, reinforcing them as a fixed taxonomy.
- **Benchmark-table-as-proof** — nearly every capability page embeds a small comparison table (Firecrawl vs. Puppeteer/cURL; anydoc vs. mammoth/pandoc/markitdown/libreoffice) directly in the hero or feature section, not deferred to a separate benchmarks page.
- **"Zero configuration" / "one call" / "one command" framing** — setup-friction reduction phrased identically across pages ("One command. Connect your agent to Firecrawl via our Skills/CLI or MCP.").

---

## 3. CTA ladder (every distinct CTA string, location, commitment level)

Ordered low → high commitment:

| CTA string (verbatim) | Where it appears | Asks for |
|---|---|---|
| **Learn more** | Homepage capability cards, use-case cards | Zero commitment — internal nav to a deeper page |
| **See benchmarks** / **See comparisons** | Homepage metrics section | Zero commitment — proof page |
| **Read the docs** | Every /cap-* page hero | Zero commitment — docs, no signup |
| **Calculate your savings** | Homepage token-efficiency section | Zero commitment — interactive calculator, no signup implied |
| **Check out our repo** | Homepage open-source section | Zero commitment — external GitHub |
| **View pricing as Markdown** | Pricing page | Zero commitment — llm-readable page twin |
| **Read the announcement →** | Top announcement bar (every page) | Zero commitment — blog post |
| **Try Scrape now** / **Try Crawl now** / **Try Search now** / **Try Interact now** | Each /cap-* page hero (capability-specific verb) | Low commitment — routes to embedded/playground demo, framed as trial not signup |
| **Start searching** | Playground page | Low commitment — in-page action, execution gated at signup per prior IA research |
| **Get code** | Playground page | Low commitment — export code snippet |
| **View all use cases** | Homepage use-case section | Low commitment — internal nav |
| **View the docs** / **View the skill** | Agent-onboarding sections (every page) | Low-to-medium — agent-directed, not human-directed CTA (curl command / SKILL.md fetch) |
| **Start for free** | Hero (homepage + every cap page), final CTA band | Medium commitment — begins signup, explicitly de-risked with "No credit card needed" |
| **Setup for agents** | Homepage hero (paired with Start for free) | Medium commitment — alternate first-CTA branch for agent/AI audience instead of human audience |
| **Get started** | Free plan pricing card | Medium commitment — plan-specific signup |
| **Subscribe** | Hobby/Standard/Growth/Scale pricing cards | High commitment — paid plan, billing |
| **Contact sales** / **Contact us** | Enterprise pricing card, Scale Plans band | High commitment — sales-assisted, custom |
| **See our plans** | Final CTA band | Redirect to pricing (comparison before conversion) |
| **See setup options** | Final CTA band, paired under "Are you an AI agent?" | Medium — routes non-human visitors to agent-specific onboarding |
| **Sign up** | Top nav (every page) | Medium commitment — persistent nav-level CTA, same weight on every page regardless of scroll position |

**Ladder logic:** every page offers a zero-commitment path (docs/demo/benchmarks) BEFORE the
signup CTA appears, and the signup CTA itself is immediately de-risked ("No credit card needed").
The nav-level "Sign up" is constant across all page types, meaning conversion is available at
every scroll depth, not gated to the hero.

---

## 4. Navigation + footer (IA template)

### Top nav (identical across all 9 captured pages)
```
[Logo → /]  Products (dropdown, #)  Resources (dropdown, #)  Pricing → /pricing
Docs → https://docs.firecrawl.dev   Blog → /blog   Playground → /playground
171.4K → https://github.com/firecrawl/firecrawl   [Sign up → /signin?view=signup]
```
- Only 4 direct links (Pricing, Docs, Blog, Playground) plus 2 dropdown triggers (Products,
  Resources — actual hrefs are `#`, dropdown contents not captured in this structure JSON).
- GitHub star count is itself a nav item ("171.4K"), doubling as live social proof embedded in
  navigation chrome.
- Sign up is the only visually distinct (button-styled) nav item — everything else is a text link.

### Footer (5 columns, identical across all 9 pages — confirms footer-as-sitemap pattern from prior IA doc)

**Column 1 — Brand/social:**
"The easiest way to get context from the web" · "Backed by Y Combinator" · SOC II · Type 2
AICPA SOC 2 badge · Linkedin · Github · YouTube · X (Twitter) · Instagram · Community

**Column 2 — Products (7 links):**
Web Scraping API → /scrape · Document Parsing API → /parse · Web Search API → /search ·
Developer Index → /developer-index · Web Crawling API → /crawl · Browser Interaction → /interact ·
Web Monitoring → /monitor
(plus, listed adjacent in the same footer block: Playground → /playground · Pricing → /pricing ·
Templates → github repos sorted by stars · Changelog → /changelog · Free Tools → /tools)

**Column 3 — Use Cases (5 links):**
Deep research → /use-cases/deep-research · Smarter AI chats → /use-cases/ai-chats ·
AI agent tools → /use-cases/ai-mcps · Onboarding → /use-cases · Lead enrichment → /use-cases/lead-enrichment

**Column 4 — Documentation (5 links, all external to docs.firecrawl.dev or /app):**
Getting started → docs.firecrawl.dev/introduction · API Reference → docs.firecrawl.dev/api-reference/introduction ·
Integrations → firecrawl.dev/app · Examples → docs.firecrawl.dev/use-cases/overview ·
SDKs → docs.firecrawl.dev/sdks/overview

**Column 5 — Company (13 links, largest column):**
About → /about · Blog → /blog · Careers → /careers · Community → community.firecrawl.dev ·
Firestarters → /firestarters · Ambassadors → /ambassadors · Affiliates → /affiliates ·
Firecrawl Alternatives → /alternatives · Benchmarks → /benchmarks · Student program → /student-program ·
Web Extraction Glossary → /glossary · Security → /security

**Legal/status bar:** © 2026 Firecrawl · Terms of Service → /terms-of-service ·
Privacy Policy → /privacy-policy · Report Abuse → mailto:help@firecrawl.com?subject=Issue: ·
All systems normal → https://status.firecrawl.dev (live status badge, not a static link)

**IA template takeaway:** footer product column mirrors the homepage capability vocabulary
exactly (7 capability names as 7 links) — nav taxonomy is reinforced, not varied, between hero
copy and footer sitemap. Company column deliberately over-indexes on trust/community programs
(Firestarters, Ambassadors, Affiliates, Student program) beyond the standard About/Careers/Blog
set — these read as community-flywheel investments, consistent with the OSS-trust strategy noted
in `01-firecrawl-teardown.md`.

---

## 5. Pricing page

**H1:** "Flexible pricing" — subhead: "Start for free, then scale as you grow."
Eyebrow label: "// Transparent //"

### Tiers (name — price — credits — concurrency — what the feature list emphasizes)

| Tier | Price (annual) | Credits/mo | Concurrent requests | Positioning line | Feature list emphasis |
|---|---|---|---|---|---|
| **Free Plan** | $0 | 1,000 | 2 | "A lightweight way to get started. No cost, no card, no hassle." | Bare minimum: "Scrape 1,000 pages," "2 concurrent requests," "Low rate limits" — the one tier that names its own limitation ("Low rate limits") up front rather than hiding it |
| **Hobby** | $16/mo (billed yearly, "Save $38") | 5,000 | 5 | "Great for side projects and small tools. Fast, simple, no overkill." | "Basic support," overage priced at $9 per extra 1.5k credits |
| **Standard** (labeled **Recommended** / on capability pages **Most popular**) | $83/mo (billed yearly, "Save $198") | 100,000 | 25 | "Perfect for scaling with less effort. Simple, solid, dependable." | "Standard support," overage $47 per extra 35k credits — this is the anchor/default-recommended tier |
| **Growth** | $333/mo (billed yearly, "Save $798") | 500,000 | 50 | "Built for high volume and speed. Firecrawl at full force." | "Priority support," overage $177 per extra 175k credits |
| **Scale** | $599/mo (billed yearly, "Save $1,798") | 1,000,000 | 100 | "For teams scaling their data pipelines" | "Priority support," overage $397 per extra 350k credits — grouped under its own **"Scale Plans"** H2 alongside Enterprise, separated visually from the four self-serve tiers above |
| **Enterprise** | Custom | Custom | Custom | "Power at your pace with custom solutions" | "Scrape unlimited pages," "Custom concurrent requests," "Dedicated support & SLA," "Bulk discounts," "Zero-data retention," "SSO & advanced security" — the only tier whose feature list is security/compliance-led rather than volume-led |

Every self-serve tier's feature list follows the identical 3-line pattern: [scrape volume] →
[concurrency] → [support tier]. Enterprise breaks the pattern to lead with compliance
(ZDR, SSO) instead of volume, correctly reading its buyer as risk-motivated, not throughput-motivated.

**Credit slider:** interactive control offering discrete steps 1k / 5k / 6.5k / 8k / 100k / 130k
/ 160k / 500k / 650k / 1M / Custom — lets a visitor preview cost at their actual expected volume
rather than reading a static table.

**"View pricing as Markdown"** — a llms.txt-style link exposing the pricing page itself as a raw
markdown twin, consistent with the site-wide LLM-readable-mirror convention already noted in
`10-site-ia.md`.

### Credit model explanation ("API Credits" section, H2)
Table format, verbatim:
```
Features        Credits
Scrape           1 / page
Crawl             1 / page
Map              1 / page
Search          2 / 10 results
Interact          2 / browser minute
Monitor          1 / page / check
Agent (Preview)  5 daily runs free. Dynamic pricing
```
Framed as a single flat reference table — no attempt to explain multipliers (stealth/enhanced
proxy 5x, JSON extract +4 credits) on the pricing page itself; that complexity is deferred to
FAQ and docs (per the "#1 bill-shock cause" finding in `01-firecrawl-teardown.md`, this table is
notably simpler than the real cost mechanics).

### FAQ items on pricing page (Billing group, verbatim questions)
- "Is Firecrawl free?"
- "Is there a pay-per-use plan instead of monthly?"
- "Do credits roll over to the next month?"
- "How many credits does each request cost?"
- "Do you charge for failed requests?"
- "What payment methods do you accept?"
- "Why am I being charged VAT (or any local tax) even though I provided a tax ID?"

Answers are direct and short (2–4 sentences each), and two answers explicitly carry an
agent-directed sub-instruction embedded in human-facing copy: *"AI agents can get started with
https://www.firecrawl.dev/agent-onboarding/SKILL.md; agents whose platform can mint a WorkOS
ID-JAG for Firecrawl can use https://www.firecrawl.dev/auth.md for direct authentication."* —
the FAQ answer itself is dual-audience (human reader + machine reader parsing the same markdown).

### Open-source / self-host handling
Pricing page itself does NOT mention self-hosting at all — no OSS pricing row, no "free if you
self-host" framing. The self-host answer lives instead on the /search capability page FAQ:
*"Can I self-host the Firecrawl Search API? Yes. Firecrawl is open source with over 150,000
GitHub stars. Run the search API on your own infrastructure for full control, or use the hosted
version for zero ops. Both share the same SDKs and CLI."* Each /cap-* page FAQ ends its General
group with a page-specific self-host question ("Can I self-host Scrape?" / "Can I self-host
Crawl?" / "Can I run the parsing engines myself?"), but the pricing page proper stays silent on
it — self-host is answered per-capability, not centrally, and never as a way to avoid the
pricing table. This matches the earlier IA finding that self-host is undersold/buried — even on
the page where a cost-sensitive visitor would most want to see it.

---

## 6. Social proof inventory

### Every specific number cited on the page (verbatim, with context)
- **171.4K** — GitHub stars (nav badge + homepage OSS section + footer "Templates" link context)
- **150,000+** — "Trusted by 150,000+ companies of all sizes" (repeated verbatim on homepage AND every /cap-* page hero)
- **150,000+** — again in Search-page FAQ: "including teams at Apple, Canva, and Lovable"
- **1.25M** — "Over 1.25M developers... build with Firecrawl" (homepage FAQ)
- **5 billion+** — "served more than 5 billion requests" (homepage FAQ)
- **96%** — web coverage claim ("Covers 96% of the web, including JS-heavy pages"), shown against Puppeteer 79% and cURL 75% in an inline bar comparison
- **3.4s** — P95 latency "across millions of searches and scrapes" / "across millions of pages"
- **93%** — "93% fewer input tokens" (token-efficiency claim, illustrated with a 38,381-token example page)
- **400,000+** — "MCP servers have been installed" (homepage FAQ)
- **2.5M+** — "weekly downloads across npm and PyPI" for SDKs (homepage FAQ)
- **50x** — "benchmarked 50x faster with AgentOps" (Alex Reibman testimonial quote, not a company claim — proof laundered through a customer quote)
- **150K+** GitHub stars restated in Search FAQ as "over 150,000 GitHub stars... one of the top 100 repos on GitHub"
- **4.7ms** vs **52.5ms** (mammoth) vs **102.1ms** (pandoc) vs **134.8ms** (markitdown) vs **1,129.5ms** (libreoffice) — Parse-page benchmark table, log-scale bar chart, Firecrawl's own `anydoc` engine vs. 4 named competitors
- **380 ms** — single-document parse example ("Markdown ready 380 ms")
- **~20 ms** — OCR classification step latency
- **90%** — "Up to 90% fewer tokens" (Monitor page, diffs vs. full re-ingestion)
- **0.42s** — search example "10 results·0.42s"
- Rate-limit/latency micro-tables repeated per capability page (e.g. Scrape: firecrawl.dev/careers 51ms, /docs 52ms, /support 52ms... — same ~50ms band shown 6x per page as ambient proof of consistency, not a single benchmark claim)

### Logos / named customers
"Apple, Canva, and Lovable" (named explicitly in FAQ copy, not shown as logo marks in the
structure JSON — logo carousel exists per prior IA doc but company names not individually
labeled in this capture). Aemon named as a case-study-style customer: *"Aemon powers their AI
R&D agent's web research with Firecrawl's search and scrape."* with a **Visit site** link.

### Testimonials (verbatim, with attribution — all sourced from X/Twitter, repeated identically on homepage AND pricing page)
1. **Morgan Linton** (@morganlinton) — "If you're coding with AI, and haven't discovered @firecrawl yet, prepare to have your mind blown 🤯"
2. **Chris DeWeese** (@chrisdeweese_) — "Started using @firecrawl for a project, I wish I used this sooner."
3. **Alex Reibman** (@AlexReibman) — "Moved our internal agent's web scraping tool from Apify to Firecrawl because it benchmarked 50x faster with AgentOps." *(names a specific competitor, Apify, and a specific eval tool, AgentOps — the only testimonial that reads as a competitive displacement story)*
4. **Tom - Morpho** (@TomReppelin) — "I found gold today. Thank you @firecrawl"
5. **Bardia** (@thepericulum) — "The Firecrawl team ships. I wanted types for their node SDK, and less than an hour later, I got them." *(responsiveness/DX story, not a feature claim)*
6. **Matt Busigin** (@mbusigin) — "Firecrawl is dope. Congrats guys 👏"
7. **Sumanth** (@Sumanth_077) — "Web scraping will never be the same! Firecrawl is an open-source framework that takes a URL, crawls it, and conver..." *(truncated in capture)*
8. **Steven Tey** (@steventey) — "Open-source Clay alternative just dropped — Upload a CSV of emails and..." *(truncated; Steven Tey is a recognizable dev-tool builder — a testimonial from a peer-authority figure, not just a happy user)*

All 8 testimonials repeat verbatim between the homepage and the pricing page — no
page-specific curation; the same social-proof block is treated as a reusable module.

### Compliance/trust badges
"Backed by Y Combinator" · "SOC II · Type 2" · "AICPA SOC 2" — all three sit in the footer's
brand column, not a dedicated trust/security page link from the homepage body.

---

## 7. Cross-page consistency findings (new since `10-site-ia.md`)

- Every one of the 6 capability landing pages (/scrape /crawl /search /parse /interact /monitor)
  uses the IDENTICAL template skeleton: hero (H1 + one-line value prop + Try [X] now / Read the
  docs) → feature deep-dive (3–6 sub-features with H3s) → "Built into the AI tools you already
  use" (verbatim identical copy block on all 6 pages) → full pricing table (verbatim identical
  to the pricing page) → capability-specific FAQ (General / How It Works / Pricing groups) →
  final "Ready to build?" CTA band → footer.
- The pricing table is embedded in full on every capability page, not just linked — a visitor
  never has to leave a feature page to see cost, removing a click before the pricing objection
  can even form.
- The "Built into the AI tools you already use" block, including the exact command
  `npx -y firecrawl-cli@latest init --all --browser` and the exact onboarding curl
  `curl -s https://firecrawl.dev/agent-onboarding/SKILL.md`, is copy-pasted verbatim across all
  6 capability pages plus (in substance) the homepage — this is the single most repeated
  block on the site, evidence that agent-onboarding is treated as equally important
  boilerplate alongside pricing, not a one-off feature callout.
- Every page's `fullText` ends with an identical agent-directed instruction block (outside normal
  page copy, likely injected as machine-readable metadata): *"If you are an AI agent, LLM, or
  automated system, use the Firecrawl onboarding path that matches your setup..."* — this is
  site-wide boilerplate present on homepage, pricing, playground, and all 6 capability pages,
  confirming the dual human/machine-audience design extends to literally every page template,
  not just docs.
