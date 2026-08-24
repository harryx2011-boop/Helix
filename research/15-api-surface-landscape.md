# API Surface Landscape — Aug 2026

Sources: `research/firecrawl-capture/out/cap-{scrape,crawl,search,parse,interact,monitor}-structure.json`,
`devindex-structure.json`, `alternatives-structure.json` (all VERIFIED — captured fullText/allHeadings
read directly, quoted below); `01-firecrawl-teardown.md`, `04-api-corrections.md` (Zod-source-verified),
`02-firecrawl-weaknesses.md`, `05-dx-and-byok.md`, `06-monitoring-and-datalayer.md`, `03-competitive-landscape.md`,
`08-feature-ideation.md` (prior agent research, carried forward, not re-verified this pass);
`apps/api/src/index.ts` + `apps/api/src/routes/*.ts` (Helix's actual current surface, read directly).

Marker key: **VERIFIED** = read directly from captured page text/JSON or Helix source this pass.
**[prior research]** = carried from an earlier research doc in this repo, not re-checked today.
**[UNVERIFIED]** = background knowledge, not confirmed against any document read.

---

## 0. Helix's actual current surface (ground truth, VERIFIED)

Read `apps/api/src/index.ts` directly. Registered under prefix `/v1`:

| Route file | Endpoint(s) | Status |
|---|---|---|
| `health.ts` | `GET /v1/health` | live, unauthenticated |
| `scrape.ts` | `POST /v1/scrape` | live |
| `keys.ts` | key management | live |
| `map.ts` | `POST /v1/map` | live |
| `crawl.ts` | `POST /v1/crawl` + status/cancel | live |
| `jobs.ts` | job polling | live |
| `search.ts` | `POST /v1/search` (with inline `scrape` sub-object) | live |

Verbatim from `index.ts` line 174: `// TODO(M7+): /monitors, /enrich`.

Correction to the task brief: there is **no `/batch/scrape` route file** in `apps/api/src/routes/` today (`ls` returned exactly `crawl.ts health.ts jobs.ts keys.ts map.ts scrape.ts search.ts`; grepping the whole `apps/api/src` tree for `batch` case-insensitively hits only `crawl/persistent-frontier.ts`, an internal frontier module, not a route). Batch scraping is not yet a distinct product surface — it would ride on `crawl` internals if built. Treat "6 endpoint families" from the task brief as the target/planning frame, not Helix's current shipped state: **shipped today is 5 endpoint families (scrape, map, crawl, search, jobs) + keys + health**; enrich and monitors are named TODOs with no code.

`search.ts` already does the "search + scrape in one call" pattern Firecrawl markets as its Search API differentiator (`scrape` sub-object on the request, `runPipeline` called per-hit). This is worth knowing before treating Firecrawl's Search API as a gap — Helix already has the core mechanic.

---

## 1. Firecrawl's product decomposition

Firecrawl's footer lists 7 API-shaped products plus Playground/Pricing/Templates/Changelog/Free Tools (non-API). For each, the H1/H2 framing and FAQ headings are VERIFIED from captured `fullText`/`allHeadings`.

| Footer product | Page title (VERIFIED) | Underlying endpoint | Genuinely separate API? | What the page claims (VERIFIED quotes) |
|---|---|---|---|---|
| **Web Scraping API** | "Web Scraping API. Any URL to Clean Markdown" | `POST /v2/scrape` | Yes — this is the base primitive everything else composes | H1: "Web Scraping API - Part of the Firecrawl context API." Sub-features pitched as reasons to use scrape: "Clean, AI-ready output," "JavaScript rendering," "Blazingly fast" (P95 3.4s), "Document parsing," "Batch scraping," "Enhanced mode" (stealth/geo/proxy/retries on by default) |
| **Document Parsing API** | "PDF and Document Parsing API for AI Agents" | `POST /v2/scrape` with a PDF/DOCX/XLSX URL and the `parsers` param, per `01-firecrawl-teardown.md` and `04-api-corrections.md` | **No — marketing packaging, not a separate endpoint.** The page's own copy never shows a `/parse` request; the code sample area shows `firecrawl.scrape(...)`-style flow. It sells the *engine* (a Rust lib, `anydoc` + `pdf-inspector`) that scrape's PDF/DOCX/XLSX handling is built on | H1: "Document Parsing API." Body: "/parse turns PDF, Word, Excel, and HTML files into clean markdown or structured JSON." Speed claim: "anydoc (Firecrawl) 4.7 ms" vs "mammoth 52.5 ms," "pandoc 102.1 ms," "markitdown 134.8 ms," "libreoffice 1,129.5 ms." OCR routing: "About half of PDFs are text based, so they never touch OCR." "The engine is on GitHub" — `firecrawl/pdf-inspector` and `firecrawl/anydoc`, both "MIT licensed and self-hostable" |
| **Web Search API** | "Web Search API. Live Web Results for AI Agents" | `POST /v2/search` | Yes — real endpoint, distinct from scrape/crawl | H1: "Web Search API for AI agents." Key differentiator called out explicitly: "Scrape after searching. Get every result as clean markdown in one call. One vendor, no second pipeline." Also: "Multi-source retrieval" (web/news/images in one call), "Drill down with categories" (GitHub/Research/PDF), time filters (1h/24h/7d/30d) |
| **Developer Index** | "Developer Index: Code & Docs Search API for Coding Agents" | New, separate index/endpoint (`/v2/search/developer` per the cURL sample on the page) | **Yes — a genuinely new, separate product.** Not a parameter on `/search`; a different corpus, different endpoint path, own benchmark. See section 2 | See section 2 below |
| **Web Crawling API** | "Web Crawling API to Turn Whole Sites into LLM-Ready Data" | `POST /v2/crawl` | Yes — real endpoint | H1: "Web Crawling API - Part of the Firecrawl context API." "/crawl discovers and scrapes every subpage on a domain." Features: "Built for the long crawl" (hundreds of browsers, millions of URLs/day), "Stream pages as they're ready" (webhooks/WebSockets/polling), "Scope controls" (path regex, depth limits, subdomain rules) |
| **Browser Interaction** | "Web Interaction API. Give Your Agent a Live Browser" | `POST /v2/interact` (per the terminal sample: `firecrawl interact -p "..."`, and `app.interact(scrape_id, code=...)`) — a session-oriented endpoint distinct from scrape's `actions[]` array | Yes — real, separate capability. Scrape's `actions[]` is scripted/one-shot per `01-firecrawl-teardown.md`; Interact is stateful, NL-driven, session-persistent | H1: "Web Interaction API - Part of the Firecrawl context API." "A live browser for your agent." Features: "Natural language actions," "Code execution" (Playwright/agent-browser code), "Stateful sessions" (sessions "stay open between calls"), "Persistent profiles" (named, reusable cookies/localStorage), "Embeddable live view" (`live.firecrawl.dev/view/s_...` stream URL), "Connect over CDP" (Playwright/Puppeteer/any CDP client) |
| **Web Monitoring** | "Monitor the Web" | New dedicated product, `create_monitor(...)` in the Python sample, own webhook event types | Yes — real, separate product with its own data model (monitors, schedules, judge). Shipped recently per `06-monitoring-and-datalayer.md` (~May–Jul 2026) | H1: "Monitor the web." "Firecrawl watches pages on your schedule, diffs every check against the last, and sends you, or your agent, only what actually changed." Mechanics: schedule + goal in plain English, AI judge scores each diff ("Up to 90% fewer tokens"), page-level or **web-scale search monitors** ("Point a monitor at your queries and Firecrawl searches the whole web on your schedule"), field-level deterministic JSON diffing, webhook payload example shown with `monitor.page` event type and a `judgment{meaningful,confidence,reason}` block |

**Net read on "packaging vs. real surface":** of the 6 capability-named products (excluding Developer Index, handled separately), 5 map to genuinely distinct endpoints (scrape, crawl, search, interact, monitor — each has its own verb/noun and, for interact/monitor, stateful resources). Only **Document Parsing is pure marketing repackaging** of scrape's existing PDF/DOCX handling — there is no visible `/parse` endpoint in the page's own code samples, and `01-firecrawl-teardown.md` / `04-api-corrections.md` (source-verified against the actual OpenAPI/Zod types) list PDF parsing as a `parsers` param on `/v2/scrape`, not a separate route. This matters directly for Helix: cloning "Document Parsing API" as a landing page costs nothing structurally if scrape already handles PDFs — it is a marketing SKU, not an engineering lift.

---

## 2. What "Developer Index" actually is

VERIFIED from `devindex-structure.json` fullText and headings.

**What it does:** A pre-built, continuously-refreshed search index over developer-specific sources — not the general web. Verbatim: "70M+ docs, READMEs, issues, and merged pull requests in one index, with the highest recall of any coding-specific index." Source types explicitly named: `doc:`, `readme:`, `issue:`, `pull_request:` — each result is tagged by type and returns a **matched passage as markdown**, not just a link ("The answer, not just the link... there is no second scrape").

Access surface: "Skill, CLI, MCP, and API. One line into any agent" — `npx -y firecrawl-cli@latest setup developer-index`, wired into Claude Code/Cursor/Codex via MCP, plus a raw endpoint shown as `POST https://api.firecrawl.dev/.../search/developer` with body `{query, k, types:["issue","pull_request"]}`. FAQ heading confirms "No API key" is needed to try it ("No API key. Send one for higher rate limits").

Filtering: "Rich filters... Scope it down to one repo. Filter by type, repo, language, topic, license, or stars." Freshness: "Most sources land within a day of publishing" — live examples show `github.com/vercel/next.js 1 hr ago`, `docs.stripe.com 18 min ago`.

**Benchmark claim (their own, self-reported):** "DevDex, an open benchmark... 1,179 real developer queries. Scored deterministically, no model judge." Recall@10: Firecrawl Developer Index 0.63 vs Firecrawl Search 0.58, Parallel 0.57, Mintlify 0.54, Exa 0.54, **Context7 (docs only) 0.17**, native web search 0.45 (no-tool control: 0.01). Three tracks: repository discovery ("Trails," Developer Index 0.76, beaten by Parallel 0.82), issues/PRs ("Leads," Developer Index 0.66, best), documentation lookup ("Tied" 0.47, statistically tied with Context7). This is a vendor-run, vendor-published benchmark — treat the specific numbers as marketing evidence, not independent verification, but the benchmark's existence and the competitor set it names (Parallel, Mintlify, Context7, Exa) is itself useful signal.

**What it competes with:** Context7 (the incumbent "docs for coding agents" MCP tool, scored lowest on Firecrawl's own benchmark at 0.17 recall — a pointed target), Parallel (a general-purpose competitor doing comparably or better on 2 of 3 tracks), Mintlify's docs search, and implicitly GitHub's own code/issue search plus raw web search as agent context sources.

**Infrastructure implied:** This is not a scrape-on-demand product — it requires (a) a **standing, continuously-crawled corpus** across GitHub (READMEs, issues, merged PRs) and a large set of technical doc sites, refreshed on a sub-daily cadence; (b) **semantic/passage-level retrieval**, not URL discovery — the "ask the way you'd ask a person" framing ("library for incremental pdf parsing" → ranked README/doc hits) implies embeddings + a vector or hybrid index, not keyword search; (c) a **passage-extraction step** so results return matched markdown snippets rather than full pages; (d) **freshness infrastructure** — near-real-time ingestion pipelines per source, not periodic re-crawl; (e) filter/facet infrastructure (repo, language, license, star-count, source-type) implying structured metadata extraction at ingest time, not just text indexing. This is a materially larger infra investment than any of the other 6 products — it is closer to "build a vertical search engine" than "add an endpoint."

**Why it matters for Helix:** this is the one Firecrawl product with no clean 1:1 mapping to an existing Helix endpoint family, and no cheap way to fake it as a parameter on `/search` — a general web search with a `site:github.com` filter (which is what Helix's `search.ts` `CATEGORY_OPERATORS.github` shorthand already does, VERIFIED in the route file) is a fundamentally different and much lower-recall mechanism than a standing, continuously-refreshed, passage-indexed corpus. If Helix wants to compete here it is a distinct infra bet, not a route addition.

---

## 3. Competitor surfaces Firecrawl does not expose

Firecrawl's own `alternatives-structure.json` (VERIFIED) names 18 competitors it runs head-to-head comparisons against: Tavily, Exa, Apify, Bright Data, ScrapingBee, Steel, Browser Use, Brave Search API, Hyperbrowser, Parallel, Scrapfly, Jina AI, Zyte, Browserbase, Crawl4AI, Scrape.do, ScrapeGraphAI, ScraperAPI, Context.dev — confirming these are the market's self-identified peer set, not just this research's framing.

Endpoint-shape comparison, capabilities Firecrawl has no equivalent for:

| Competitor | Endpoint/primitive | What it implies | Verification |
|---|---|---|---|
| **Browserbase** | Session create/list/retrieve, live-view URL, **Observability** ("unified debugging your agent across replays, logs and prompts"), Contexts (encrypted persistent auth state) | A session is a first-class, independently addressable resource with its own lifecycle API — not a side effect of a scrape call. Debugging/replay is a product surface, not a log line | [prior research, `05-dx-and-byok.md`, `03-competitive-landscape.md`] |
| **Apify** | Actor store/marketplace, Dataset (tabular, schema-per-run), Key-Value Store, per-actor Proxy config (group/country/rotation/session), `Actor.get_input()` schema validation | A full platform-as-marketplace model: third parties publish "actors" (scrapers-as-products), outputs land in a structured, queryable-by-API dataset resource, not just a response body | [prior research, `06-monitoring-and-datalayer.md`: "Apify Dataset is tabular... NO SQL — retrieval is programmatic filtering"] |
| **Exa** | Semantic/neural `/search`, `/findSimilar`, `/contents` (fetch by ID after search), Websets (search → structured, enrichable, persistent dataset) | Search-first, ID-addressable content retrieval decoupled from scraping; Websets turns a search into a durable, incrementally-enrichable table — [prior research] flags this as unique in-market | [prior research, `03-competitive-landscape.md`: "Exa: Websets... unique, nothing else has it natively"] |
| **Tavily** | `/search`, `/extract`, `/map`, **`/research`** (multi-step agentic research, 4–250 credits, variable-cost), single credit currency across all 5 ops | A dedicated "answer/research" endpoint as a first-class product, not DIY-composed from search+scrape+your own LLM loop (which is explicitly how Firecrawl's deprecated deep-research is now handled, per `04-api-corrections.md`) | [prior research, `03-competitive-landscape.md`] |
| **Bright Data** | Web Unlocker (per-request unblocking), SERP API, pre-built **structured datasets** (pay for a maintained dataset, not a scrape job) | Sells access to already-scraped, already-structured data as a product distinct from "scrape it yourself" — a dataset marketplace, adjacent to Apify's actor store but data-first not code-first | [prior research, `03-competitive-landscape.md`] |
| **ScrapingBee** | Unlocker-style single endpoint with JS-render/premium/stealth as request-time multipliers | Proxy/unblocking positioned as the whole product, no crawl/search/monitor surface at all | [prior research] |
| **Steel.dev** | Session management (fully OSS, self-hostable), Session Viewer ("view and debug live or recorded sessions") | Same session-as-resource pattern as Browserbase but with a self-hostable, OSS-first posture — the only fully-OSS managed-cloud-browser product identified | [prior research, `05-dx-and-byok.md`] |
| **Jina AI** | `r.jina.ai/<url>` (zero-SDK URL-prefix reader), embeddings endpoint, reranker endpoint | Collapses "scrape" into a GET-able URL with no auth/SDK — lowest integration friction identified in the whole landscape. Embeddings + reranker are adjacent ML-infra products Firecrawl has no equivalent of at all | [prior research, `03-competitive-landscape.md`: "URL-prefix trick... zero SDK, zero auth. Lowest integration friction in market"] |
| **Diffbot** | Knowledge Graph query (DQL), Enhance API (enrich-by-identifier), standing entity graph (10B+ entities, "refreshed every 4-5 days") | A persistent, cross-source **entity resolution** layer — "Apple's entity record draws from 560 different origin sources" — categorically different from page-scoped extraction. [prior research] explicitly flags this as the reference point for Firecrawl's own *unmerged* knowledge-graph RFC (PR #3684) | [prior research, `06-monitoring-and-datalayer.md`] |
| **SerpAPI / Serper** | Dedicated SERP-only endpoints, no scrape/crawl attached | Confirms SERP-as-a-standalone-product is a viable, separately-priced slice (Serper undercuts SerpAPI 10–25x on the same primitive) | [prior research, `03-competitive-landscape.md`] |
| **LlamaParse / Reducto / Unstructured / Docling / MarkItDown** | Dedicated document-parsing-only APIs/libraries, no web-scrape surface at all | Confirms document parsing is a real standalone market Firecrawl chose to fold into scrape rather than spin out — validates section 1's finding that Firecrawl's "Document Parsing API" is packaging, since competitors who *do* treat it as separate ship it as literally the only thing their API does | [prior research] |

[UNVERIFIED, background knowledge, not confirmed against any captured document this pass]: AgentQL exposes a query-language-over-DOM endpoint (`query_data`) distinct from both scrape and interact; Kadoa exposes change-monitoring plus a no-code field-mapping layer. Neither was directly verified in this pass — flagging per instructions rather than asserting as fact.

---

## 4. The unclaimed space

Cross-referencing `05-dx-and-byok.md`, `06-monitoring-and-datalayer.md`, `08-feature-ideation.md`, and section 3 above against what's now confirmed shipped (Firecrawl Monitor, Developer Index) narrows the prior "whitespace" list. Re-ranked by how many of the 18+ competitor surfaces reviewed have *no* equivalent at all:

| Gap | Evidence it's unclaimed | Confidence |
|---|---|---|
| **Cost estimate before execution** (dry-run a crawl/map spec → credits/$ before committing) | [prior research, `05-dx-and-byok.md`] explicitly: "genuine whitespace, nobody does it," cites Firecrawl GH #3552 (agent hits max-credits mid-run on an SPA URL with no warning) and #4083 (silent failure that still burns credits) as direct evidence of the pain this would fix. None of the 18 competitors reviewed in `03-competitive-landscape.md` or the alternatives page surface this | ~70% [prior research's own stated confidence] |
| **Scrape replay/debug — see the actual raw HTML/screenshot/DOM/network trace the scraper saw for a past call** | Browserbase and Steel both ship session replay/observability, but that's for *interactive sessions*, not for a one-shot `/scrape` or `/crawl` call. No scraping-API-proper (Firecrawl, Tavily, Exa, ScrapingBee, Zyte, Bright Data, Apify) ships this for its core scrape primitive per `05-dx-and-byok.md` | [prior research] |
| **Provenance/citation stability** — stable, re-crawl-surviving anchors so a citation into a page doesn't silently break when the page is re-scraped | Flagged in `08-feature-ideation.md` as inferred, no direct complaint found | ~60% [prior research's own stated confidence] |
| **Schema inference at the API layer** — given a URL or a set of sample pages, propose an extraction schema rather than requiring the caller to hand-write one | Not named as shipped by any vendor in `03-competitive-landscape.md`, `01-firecrawl-teardown.md`, or the captured Firecrawl pages (Parse's "Straight to typed JSON" demo still shows a user-supplied schema, VERIFIED from `cap-parse-structure.json`). Not directly evidenced as *demanded* in the research read this pass — flagging as a reasoned gap, not a cited one | [UNVERIFIED demand — no GH issue or complaint found in the docs read this pass; the absence-of-feature is verified, the absence-of-alternative is not] |
| **Content licensing/attribution metadata on extracted content** (e.g., surfacing a source's license, robots directives, or ToS posture alongside the scrape result so callers can make a compliance decision) | No vendor page reviewed (Firecrawl's 7 capture pages, Diffbot notes, or the alternatives list) mentions this as a response field. Adjacent but distinct from Firecrawl's own gap at "no way to block Firecrawl from your own site" (`02-firecrawl-weaknesses.md` #1169) — that's opt-out tooling for site owners, not attribution metadata for callers | [UNVERIFIED demand — reasoned from the shape of the market, not from a cited complaint] |
| **Evaluation/QA of extraction quality** — a scored confidence or accuracy signal per extraction, not just success/failure | `02-firecrawl-weaknesses.md` cites GH #3587/#3782: "no extraction-accuracy evals for RAG ingestion" as an open complaint. Diffbot's DQL and Firecrawl's own Monitor "judge" (confidence: high/low) are the closest analogs, but neither scores a one-shot scrape/extract call itself | [prior research] |
| **Structured diff granularity (word/line/char) inline in the webhook payload** | `06-monitoring-and-datalayer.md`: Firecrawl's monitor.page payload (VERIFIED this pass from `cap-monitor-structure.json`) shows `diff: {text: "- Pro plan $20/mo\n+ Pro plan $25/mo"}` — a single text blob, not granularity-tagged. changedetection.io (the cited reference, self-hosted only) does word/line/char. Gap confirmed present in the actual verified payload shape, not just asserted | VERIFIED gap in the payload shape; MEDIUM difficulty per prior research |
| **Sitemap `lastmod`-driven incremental re-crawl** (skip pages whose sitemap timestamp hasn't advanced) | `06-monitoring-and-datalayer.md`: "CONFIRMED GAP... NOTHING in their docs/changelog/tracker mentions lastmod-based selective crawling," distinguished from Firecrawl's actual sitemap PRs (#4049/#4056) which are about redirect/discovery correctness only | [prior research, stated as confirmed] |
| **Native SQL/OLAP-queryable output over a crawl corpus** (query your own crawled data with SQL rather than re-fetching or paging through JSON) | `06-monitoring-and-datalayer.md`: "No scraping vendor offers this... Apify Dataset is tabular but confirmed NO SQL." HIGH difficulty (real OLAP store per org) but genuinely wide open | [prior research] |
| **Vector-DB-agnostic incremental re-crawl with stable point IDs** | Firecrawl's own community PR #3396 (open, unmerged, Qdrant-only) proves demand exists; making it vendor-agnostic and first-class is unclaimed | [prior research] |

**Note on Monitor and Developer Index specifically:** both were flagged as open questions in the task brief's framing but are now confirmed *shipped* products (Monitor: VERIFIED live page with a working webhook example and Python SDK call; Developer Index: VERIFIED live page with a working cURL example and a self-reported benchmark). Neither is whitespace anymore — competing there means competing on depth/cost/recall against a shipped incumbent, not filling an empty category. The estimate-before-run gap remains the strongest verified-adjacent whitespace: it is evidenced by two distinct, cited Firecrawl bug reports of the exact failure mode it would prevent, and no competitor reviewed (in 18 alternatives + the deep-dive list) ships it.

---

## Summary of Helix-relevant implications

1. **Cheap wins available now:** a "Document Parsing" landing page costs nothing beyond copy — Helix's `/v1/scrape` already needs no new endpoint to sell this the way Firecrawl does, once PDF/DOCX handling exists in `pipeline.ts`/`extract` (status of that not re-verified this pass — check before promising it).
2. **Real endpoint gaps vs. Firecrawl's shipped set**, in order of engineering weight: Interact (session-oriented browser control, distinct from any current Helix route) > Monitor (named TODO, `index.ts:174`) > Enrich (named TODO, same line) > Developer Index (the heaviest lift — a standing indexed corpus, not a route).
3. **Batch scrape is not yet real in Helix** — contrary to the task brief's premise, `grep` confirms no batch route exists; it needs to be built, not just documented, before positioning it as a shipped family.
4. **Best whitespace bet given the research to date:** cost-estimate-before-run remains the most strongly evidenced gap (cited against two specific Firecrawl bugs, absent from all 18+ reviewed competitors) — a reasonable next feature-ideation target once the core 5 families are solid.
