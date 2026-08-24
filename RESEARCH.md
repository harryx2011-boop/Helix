# Helix — A BYOK Web-Data API

**Research brief · 23 August 2026**

A superset of Firecrawl: self-hostable, permissively licensed, bring-your-own-everything. This document is the evidence base for that bet — what Firecrawl actually is, where it breaks, what the field looks like, what it costs to build, and which features are worth building.

Sourced by six parallel research agents against first-party docs, the Firecrawl Zod schema and SDK sources, GitHub issue trackers, vendor pricing pages, and case law. Claims that could not be verified are flagged inline. Full per-agent reports are in `research/`.

---

## 0. The one-paragraph thesis

Firecrawl's paid moat is not its code — it is the anti-bot proxy layer (**Fire Engine**) and the agent models, both withheld from the AGPL-3.0 self-host build. That split produces the category's loudest complaints: self-hosted instances fail against free-tier Cloudflare, credits vanish unpredictably on LLM-heavy operations, and AGPL blocks commercial embedding outright. Meanwhile nobody in the market combines **true bring-your-own-LLM-key with flat, non-multiplied pricing**, and nobody bridges **web scraping and document parsing under one API**. Helix's wedge is to ship the withheld layer as open source under a permissive licence, make BYOK first-class across four axes (LLM, proxy, browser, vector DB), and charge a control-plane fee instead of reselling credits.

---

## 1. What Firecrawl actually is

Base `https://api.firecrawl.dev/v2`, bearer `fc-...`. Verified against `apps/api/src/controllers/v2/types.ts` and the TS/Python SDK type files, which is why several widely-repeated claims below are marked corrected.

### Endpoints

| Endpoint | Shape | Notes |
|---|---|---|
| `POST /v2/scrape` | sync, single page | 18 output formats, 9 action types, ~30 params |
| `POST /v2/crawl` | async | `prompt` field auto-generates crawl config via LLM |
| `GET/DELETE /v2/crawl/{id}` | status / cancel | status enum has 4 values incl. `cancelled` |
| `GET /v2/crawl/{id}/errors` | per-page errors | plus `robotsBlocked[]` |
| `GET /v2/crawl/active` | list running jobs | undocumented in most write-ups |
| `POST /v2/map` | sync | ~2–3s, sitemap-first. **Does not guarantee full discovery** |
| `POST /v2/search` | sync | search + scrape in one call — the real differentiator |
| `POST /v2/extract` | async | glob URLs, `enableWebSearch`, JSON Schema |
| `POST /v2/batch/scrape` | async | shares rate-limit bucket with `/crawl` |
| `POST /v2/agent` | async | spark-1-pro / spark-1-mini / spark-2 |
| `POST /v1/deep-research` | legacy | unmaintained since 2025-06-30, still live |

### The 18 `formats`

`markdown` · `html` · `rawHtml` · `rawBase64` · `links` · `images` · `summary` · `branding` · `product` · `menu` · `audio` · `video` · `json` · `deterministicJson` · `changeTracking` · `screenshot` · `attributes` · `question` · `highlights` · `query`

`branding` / `product` / `menu` are vertical-specific structured extractors — design-system tokens, e-commerce product data, restaurant menus. This is the most interesting thing in their API and the piece most worth generalising: **schema-driven vertical presets**, not one-off verticals.

### Four corrections to the common understanding

These matter because they change the pitch.

1. **`jsonOptions` does not exist in v2.** Structured extraction is `formats: [{type:"json", schema, prompt}]`. The `jsonOptions` name is stale v1 terminology repeated across most third-party write-ups.
2. **"Stealth mode" is now `enhanced`, and — per current first-party docs — carries no credit surcharge.** Verbatim from `docs.firecrawl.dev/features/proxies`: *"Enhanced proxies carry no credit surcharge, so either way only the regular cost is billed."* The widely-cited **5× stealth multiplier** appears across 2026 pricing blogs but is contradicted by the live docs. Either it was removed at an undated point or the blogs were always wrong; the changelog 404s on every URL variant, so this is unresolvable from outside. **Do not build the pitch on the 5× claim.**
3. **No HMAC webhook signing is documented.** Three independent fetches found no signature header. The `X-Firecrawl-Signature` claim traces to a third-party snippet and is contradicted by primary docs. The only auth is whatever you put in your own `headers` object.
4. **There are two parallel agent mechanisms, not a succession.** Legacy FIRE-1 (`agent:{model,prompt}`, v1-scoped only) and the newer standalone `/v2/agent` (spark models). No source states any lineage between them. ~70% confidence they are two generations running side by side.

### Credits (first-party verified)

| Operation | Cost |
|---|---|
| scrape / crawl | 1 credit/page |
| map | 1 credit/call |
| search | 2 credits / 10 results |
| JSON extraction | +4 credits/page |
| changeTracking (json mode) | +5 credits/page — git-diff mode is free |
| PDF parsing | +1 credit/page |
| zero data retention | +1 credit |
| enhanced/auto proxy | **no surcharge** |
| interact | 2 cr/browser-min; 7 cr/browser-min with a prompt |
| agent | 5 free daily runs, then dynamic — "a few hundred credits" typical |
| x.com scrape | ~30 credits (1 + 29 Grok X Query credits) |

Plans: Free $0/1k · Hobby $16/5k · Standard $83/100k · Growth $333/500k · Scale $599/1M. Concurrency 2 / 5 / 25 / 50 / 100. **Credits do not roll over** — convergent across five independent review sites as the single most-hated mechanic. AI Extract is a separate subscription from $89/mo, easy to miss when estimating.

---

## 2. Where it breaks

Every item below is a live GitHub issue or a first-party admission. These are the specification for what Helix must not do.

### Anti-bot is the deepest wound

- **#2257** — self-hosted Firecrawl fails where Browserless succeeds *on the identical host and IP*. The reporter diagnosed browser fingerprinting, not IP blocking. **Closed as "not planned."**
- **#2413** — bot detection is silently treated as success and **still bills a credit**. The payload is the Cloudflare block page; no exception is raised. Explicit stealth fails on the first attempt and succeeds on the second, so stealth is not reliably auto-triggered.
- **#2350** — anti-bot triggers an infinite engine-waterfall loop with no timeout; the process becomes permanently unresponsive (25 comments).
- **#495** — free-tier Cloudflare alone stops self-hosted Firecrawl. Open since 2024.

Independent benchmark: **Proxyway measured 33.69% success at 2 req/s, falling to 26.69% at 10 req/s, against 93.14% for the category leader.** A ~3× reliability gap under concurrency is the reason technical users churn.

### Reliability

Crawls stick in `scraping` forever with no timeout state (#1679). Status polling times out on repeat calls while jobs complete **and get billed** (#2280). Self-host leaks memory from 13% to 85% RAM after ~30 crawls and never recovers without a restart (#722). Cancelling a crawl floods the webhook endpoint with one `crawl.failed` per remaining queued URL (#3614).

The rate limiter **fails closed** (#3728): a transient Redis blip makes `auth.ts` mishandle a plain `Error` where it expects a `RateLimiterRes`, returning 429 to *all* authenticated traffic with the literal string `"Consumed (req/min): undefined, Remaining (req/min): undefined"`. The issue author calls it "the opposite of resilient design." Separately, **#3150** asks for agent-friendly rate-limit headers so autonomous clients can back off without parsing error strings — still unaddressed.

### Extraction correctness

- **#2072** — v2 JSON mode ignores the supplied schema entirely; the JS SDK never converts Zod to JSON Schema before sending. The reporter notes v1 was better. A regression.
- **#1656** — identical batch request returns JSON on cloud, empty on self-host.
- Their own docs admit `minItems`/`maxItems` cause the model to **hallucinate entries** to satisfy the constraint; the documented workaround is to not use those keywords.
- Schemas beyond ~30 fields measurably degrade; official guidance is to split into 2–3 calls of 10–15 fields.

### Self-host

Minimum 8GB RAM (12GB recommended) for API + workers + Playwright + Redis + RabbitMQ + Postgres. RabbitMQ race on first `docker compose up` (#2583). "Unable to build the docker image" (#948, 21 comments). Helm chart cannot use external Redis/Postgres/RabbitMQ (#3827).

And the one that names the opportunity outright: **#1467 — Ollama/local-LLM extraction fails because the code demands a Google API key and ignores the configured local provider.**

### The BYOK smoking gun

**#4083 (20 Jul 2026)** — Firecrawl's *hosted* product already accepts `OPENAI_API_KEY` / `OPENAI_BASE_URL` parameters, but the path is broken: empty values bypass Zod handling, the JSON scrape format **fails silently, and still consumes credits**.

Users are actively trying to BYOK on hosted and it does not work. Combined with **#3552** (agent hits "max credits" on every SPA careers URL), the LLM-heavy operations are exactly where credit burn is unpredictable and exactly where BYOK fixes it. Firecrawl's own `SELF_HOST.md` proves the plumbing exists: *"AI-backed features: no model provider. Connect OpenAI, an OpenAI-compatible endpoint, or Ollama."* The capability is built and withheld from the paid product.

### Licensing

Core is AGPL-3.0. For most companies that forecloses embedding it in a commercial network service without a legal review they will not run. Crawlee is Apache-2.0 by contrast. This is a decision, not an engineering problem — and it is free leverage.

---

## 3. The field

Full matrix in `research/03-competitive-landscape.md`. The structurally important reads:

**BYOK has split into three distinct meanings.** Be precise about which one is claimed.

| Axis | Who genuinely offers it |
|---|---|
| BYO-LLM-key | Browserbase/Stagehand (explicit design goal), Browserless, ~Hyperbrowser |
| BYO-proxy | Crawlee/Playwright/Puppeteer, Steel, Browserless — trivially, you own the infra |
| BYO-browser (your own CDP endpoint) | Browserless, Crawlee/PW/PPTR |

Managed unlockers — Bright Data, Oxylabs, Zyte, ScrapingBee, ScraperAPI — do **not** support BYO-proxy by design: their pool *is* the product. Firecrawl's managed Extract, Exa, Tavily, Diffbot, Kadoa and AgentQL all bundle an opaque model you cannot swap for a cheaper or better one.

**Truly self-hostable:** Crawlee, Playwright, Puppeteer, Steel.dev, Jina Reader (Apache-2.0), Browserless core, Trafilatura, Readability, Docling, MarkItDown, Unstructured's core lib.

**Never self-hostable:** Exa, Tavily, Apify's platform, Bright Data, Zyte, Oxylabs, ScrapingBee, ScraperAPI, Diffbot, Olostep, Scrapfly, Crawlbase, SerpAPI, Serper, LlamaParse, Reducto, Chunkr, AgentQL, Kadoa.

### Three white-space gaps

1. **Nobody combines true BYO-LLM-key with flat, non-multiplied pricing.** Stagehand gets BYOK right but inherits Browserbase's four-axis metering (browser-hours + proxy GB + calls + tokens, with a one-minute billing floor that punishes short sessions). Everyone with simple pricing either bundles an opaque model or has no AI step at all.
2. **Nobody bridges web scraping and document parsing under one API and one pricing model.** Firecrawl/Jina/Tavily do live pages; LlamaParse/Reducto/Unstructured do uploaded documents. Anyone building RAG over both integrates two vendors with two pricing philosophies.
3. **Pricing transparency is itself the wedge.** Tavily's single-credit currency and Spider.cloud's flat rate are explicit reactions against Exa's and Scrapfly's multiplier complexity. Serper beat SerpAPI by 10–25× on a simpler model. This is a proven pattern in this exact category.

### Things worth knowing

- **Jina Reader was acquired by Elastic (Oct 2025).** Pricing unchanged so far; roadmap risk is real. Its `r.jina.ai/<url>` prefix is the lowest-friction integration in the market — zero SDK, zero auth.
- **Apify is retiring rental actors** — new rentals stopped April 2026, forced migration to pay-per-use by October 2026.
- **Meta v. Bright Data ended in summary judgment for Bright Data**, with Meta dismissing its remaining claim. Now cited industry-wide as pro-public-scraping precedent.
- **Reworkd is dead** — GitHub archived 28 Jan 2026, citing infra costs and competition from Apify/Browse.ai. "AI-native scraping startup" is not automatically a moat against incumbents who already own proxy infrastructure.
- **Biggest platform risk:** no frontier lab currently ships a standalone general-purpose scrape API. If one bundles free browsing, the entire category reprices overnight.

---

## 4. Building it

Condensed from `research/07-infra-buildout.md`.

### Browser layer

The governing economic fact: **launching Chrome costs ~1s and hundreds of MB; opening a context in a running browser is nearly free.** One browser process, many contexts — never one browser per job. Restart every few hundred pages to bound leaks.

Memory: ~100MB idle, 300–500MB with one active page, +50–200MB per context. Heuristic: `concurrent pages ≈ (RAM − 1GB) / 300MB`. A 4GB box runs 8–10 concurrent pages with resource blocking. A thousand concurrent pages is ~250GB RAM.

| Platform | Cost |
|---|---|
| AWS Lambda | $0.0000097222/GB-s — 1M req/mo ≈ $2.17 |
| AWS Fargate | 1M req/mo ≈ $56.92 fixed |
| Cloudflare Browser Rendering | $0.09/browser-hour — 1000 pages @1s ≈ $0.025 |
| Fly.io perf-2x (2vCPU/4GB) | ~$31/mo |

Lambda wins to roughly 6–8M sub-second invocations/month; **Fargate/ECS wins above ~1M renders/month** once renders take multiple seconds. Lambda cold start is 3–6s, so launch outside the handler for ~10–20ms warm reuse.

**Lightpanda** deserves a serious look: a Zig browser (not a Chromium fork) that skips CSS layout, GPU compositing and font rendering. **11× faster, 9× less memory** — a 100-page scrape in 2.3s at 24MB versus Chrome's 25.2s at 207MB. CDP-compatible, so near drop-in. It cannot handle anything needing real visual layout or canvas, which makes it a tier, not a replacement.

### Fetch tier and fingerprinting

Fetch first, escalate on signal. The correct escalation heuristic is **content-presence in raw HTML**, not framework name — hybrid frameworks like Next.js and Nuxt often ship real server-rendered HTML, so "if Next.js then browser" burns the expensive path for nothing.

JA3 is dead (Chrome 110 randomised extension order in Jan 2023). **JA4 is universally adopted** by Cloudflare, AWS WAF, Akamai and VirusTotal as of 2026. Naive `requests`/`fetch` get blocked because OpenSSL/Node TLS produce a ClientHello distinct from BoringSSL/NSS — flagged **before a single header or HTML byte is processed**. HTTP/2 adds another layer: a JA4 claiming Chrome 148 alongside `HEADER_TABLE_SIZE=4096` (Python httpx default versus Chrome's actual 65536) is a contradiction detected pre-response. Reportedly >95% of automated HTTP/2 clients carry fingerprints matching no real browser.

**The governing principle: detection needs only one layer inconsistent with the others.** TLS, CDP and JS fingerprint must agree on a single coherent browser/OS/device identity — not three tools configured independently. A subtle corollary: real browsers produce a *stable* canvas hash per device, so tools injecting fresh random noise on every read are themselves a tell. Randomise once per session, then hold.

Tooling: `curl-impersonate` / `curl_cffi` (TLS, no JS), `tls-client` (Go, v1.15.1 June 2026), `rebrowser-patches` (fixes the `Runtime.enable` CDP leak that Cloudflare and DataDome use as an automation signal).

### Proxy

Residential $/GB in 2026: IPRoyal $1.75 PAYG · Webshare $3.50→$1.40 · Decodo $3.75→$2.75 · Oxylabs $6.00→$2.50 · SOAX $5.00→$0.50 at 15TB+. Oxylabs has the longest sticky sessions (24h) and the finest geo granularity (city/state/ZIP/coordinates/ASN). Bright Data's own page would not expose tables; two secondary sources disagree ($5.04 vs $8.40 PAYG) — **treat as unverified**.

BYOP design: the product owns retry/failover, block-page detection and per-domain throttling; the provider owns rotation, geo resolution and pool health. **The managed tier should be architecturally identical internally — the same code path populated with product-owned credentials, not a fork.**

### Compliance

RFC 9309 governs robots.txt: longest-match-wins, 500 KiB minimum parse, ≤24h caching. **Crawl-delay is explicitly not in the RFC** — Google ignores it entirely. Treat sitemap `<lastmod>` as unreliable; it is frequently stale or fabricated.

The legal picture is sharper than most summaries suggest:

- **hiQ v. LinkedIn** — hiQ *won* on CFAA and *lost* on state law. The December 2022 settlement was a **$500,000 judgment against hiQ** under California trespass to chattels and breach of ToS, with a permanent injunction to destroy derived data. Avoiding CFAA exposure by scraping public pages does **not** immunise against contract or tort claims, especially where technical countermeasures were circumvented.
- **Van Buren (2021)** narrowed CFAA "exceeds authorized access" to accessing systems you have no entitlement to at all. Combined with hiQ, live risk has moved to **contract, state tort, copyright and database rights**.
- **EU sui generis database right** (Directive 96/9/EC) has no US federal equivalent post-*Feist*. *Innoweb v. Wegener* found a meta-search engine replicating a target's search over its full database infringing. Systematically mirroring a competitor's structured database carries real EU exposure.
- **GDPR Article 17** erasure applies to cached scraped PII regardless of original source — that is an architectural obligation to locate and purge, not a policy paragraph. CCPA's "publicly available" exemption covers official government records only, **not** scraped third-party content.

AI-crawler landscape: **Cloudflare Pay Per Crawl** (1 Jul 2025) was the first major provider to default AI scraping to blocked for new domains, enforced via HTTP 402. **RSL 1.0** was declared an industry standard on 10 Dec 2025 with 1,500+ endorsing orgs. **llms.txt** sits at ~10% adoption but **no major lab has committed to reading it**. IETF AIPREF's `Content-Usage` header is active but unratified. Note: **"ai.txt" as a distinct standard is unsubstantiated** — it appears to be a conflation of llms.txt and RSL.

One non-obvious defaults note: ship an **honest, contactable User-Agent**. Spoofing a browser UA strengthens a target's unauthorized-access claim if it ever comes to that.

### Extraction

Independently converging benchmarks: trafilatura leads on F1 (0.924 own eval; 0.937 mean and 0.978 precision in Sandia SAND2024-10208), while **Readability leads on recall (0.929)** — it over-includes where trafilatura is precise. SIGIR 2023 found both are the most robust across diverse templates, while boilerpy3 and newspaper4k error out on a real fraction of live HTML. Defuddle has no independent benchmark.

PDF, from olmocr-bench (1,403 PDFs): Gemini Flash 3.5 76.4% · **Marker 76.0% at 2.9 pg/s** · MinerU 72.7% at 0.54 pg/s · Docling 50.3%. Marker (Apache-2.0) matches a frontier VLM at ~5× MinerU's throughput, yet **Docling wins on table fidelity at 97.9%** despite the lower general score. Different tools win different sub-tasks; route accordingly.

A licensing landmine worth catching early: **PyMuPDF is 10–50× faster than pypdfium2 but is AGPL**, requiring either open-sourcing or a commercial Artifex licence. For a permissively-licensed self-hostable product, pypdfium2 (Apache/BSD) is the correct default.

### Structured extraction

Firecrawl's own `/extract` does **relevance-scoring and trimming before the LLM call** — retrieval-then-extract, not raw dumping — and escalates to a more capable model only for recursive schemas. Both patterns are worth copying.

OpenAI (`json_schema` + `strict`), Anthropic (forced tool-use; **not compatible with extended thinking**) and Gemini (`responseSchema`) have all converged on schema-constrained decoding. The lesson: **schema enforcement solves shape, not truthfulness.** A BYOK product needs one internal schema representation compiled to each provider's native mechanism.

Anthropic prompt caching gives a **90% read discount** (write 1.25×, read 0.10×) — cache a fixed system prompt plus schema across a crawl batch. Gotcha: changing `tool_choice` invalidates the cache.

### Queueing

Two tiers: BullMQ or SQS for high-volume leaf fetches, Temporal or a Redis-backed frontier scheduler for durable multi-thousand-URL orchestration. BullMQ's rate limiting is queue-global, so per-host caps need layering on top.

All four candidate systems are honestly **at-least-once** — build an idempotent *side effect* rather than chasing exactly-once. Idempotency key: `hash(normalised URL + render params + proxy country + schema version)`.

Frontier: Redis sorted-set per host, score = next-eligible-fetch timestamp, pop via `ZRANGEBYSCORE` plus a Lua claim, reinsert at `now + delay`.

Dedupe with Bloom filters — **1 billion URLs at 0.1% false-positive costs ~1.8GB versus ~40GB for a plain Redis SET, a 22× saving.** Use Cuckoo filters instead where re-crawl semantics need deletion; Bloom supports none.

**Webhooks are a free differentiator.** Stripe is the reference: up to 3 days of exponential backoff, HMAC-SHA256 over `"{timestamp}.{body}"` with constant-time comparison and a 5-minute tolerance window, dual-active secrets for 24h during rotation, explicit no-ordering guarantee, and dead-letter with manual replay. Firecrawl offers 3 retries over 21 minutes and no signing at all. Clearing this bar is cheap.

---

## 5. What to build

Fifteen differentiators, ranked by demand strength × differentiation. Difficulty S/M/L.

| # | Feature | Why it wins | Diff |
|---|---|---|---|
| 1 | **BYOK across LLM / proxy / browser / vector DB** | Collapses credit margin into a control-plane fee. Validated in-category: Scrapfly's Proxy Saver already accepts Bright Data/Oxylabs/Webshare creds; LLM Gateway routes free because you pay providers directly | M |
| 2 | **Persistent auth profiles + TOTP-native login** | Browserbase Contexts, Steel Profiles and AWS Bedrock AgentCore have all validated the pattern. TOTP-as-a-credential-type is offered by nobody (~80% conf) | M |
| 3 | **Permissive open core (Apache/MIT)** | AGPL is a recurring commercial blocker. A licensing decision, not engineering | S |
| 4 | **Self-hosted stealth parity / pluggable BYO-stealth** | The single most-cited OSS-vs-cloud gap, and Firecrawl closed #2257 as "not planned" | L |
| 5 | **Cost estimator before execution** | `/map`-then-price dry run. Directly answers the loudest pricing complaint (~70% conf nobody ships it) | S |
| 6 | **Scrape replay/debug** | Scrapfly already ships screenshot + content replay URLs per call; Firecrawl users get opaque "Job not found" | M |
| 7 | **Native vector-DB upsert on ingest** | `destination:{type:"pinecone",...}` on the crawl call. Apify requires actor-chaining purely because nobody does this natively | M |
| 8 | **Semantic/contextual chunking at the API layer** | Firecrawl blogs about chunking while its endpoints return raw markdown and leave it as caller homework | M |
| 9 | **changedetection.io-grade monitoring at crawl scale** | Mature self-hosted UX (word/char diffs, JQ selectors on JSON endpoints, Apprise multi-channel) with no hosted-API equivalent | M |
| 10 | **Incremental sitemap-driven recrawl** | Bill only changed pages. Confirmed gap — Firecrawl's sitemap work is about redirect correctness, not `lastmod` scheduling | M |
| 11 | **Unified agentic + scrape endpoint** | "Click through this paywall, then scrape" as one call with schema output. The 2026 convergence point nobody has packaged | L |
| 12 | **SQL-queryable output + Parquet/S3/BigQuery export** | Apify's own docs confirm no SQL and no Parquet/S3/BigQuery sink | L |
| 13 | **Cookies unified across all endpoints** | Works on `/scrape`, not `/map`, `/crawl`, `/search`. Open since June 2024 (#333, #1227, #1779) | S |
| 14 | **First-class YouTube / arXiv / GitHub extractors** | Point-solution vendors (Supadata, TranscriptAPI) exist purely because generalists cover this badly | S |
| 15 | **Accessibility-tree output mode** | Where 2026 agent research is heading for token-cost reasons; absent from scraping APIs | M |

### Also open, from the data-layer research

Two Firecrawl proposals sit **unmerged** and are shippable first:

- **PR #3396** (community-contributed) — Qdrant-backed crawl dedup: *"pages whose SHA-256 content hash is unchanged since the last crawl are skipped entirely… Deterministic point IDs derived from URL (UUID v5) so re-crawls update in-place rather than creating duplicate vectors."* A user built this because Firecrawl does not offer it. Making it vector-DB-agnostic and first-class is the differentiator.
- **PR #3684** (RFC, undecided) — a `knowledgeGraph` scrape format: *"the caller wants to discover what entities and relationships are on the page without pre-specifying their shape."* Page-scoped LLM version is Medium. Diffbot-style cross-source entity fusion (10B+ entities, "Apple's entity record draws from 560 different origin sources") is a separate multi-year bet — do not conflate them.

Also: **content-level dedup** (same content, different URL) appears nowhere in Firecrawl's tracker, though URL-level dedup shipped across #878/#3009/#3044/#3134.

### One caution on scope

**Monitoring is not greenfield.** Firecrawl shipped a substantial Monitor product between May and July 2026 — 25+ merged PRs covering cron and natural-language scheduling, markdown/JSON diff modes, an AI judge for meaningful-change filtering, Slack and email alerts, and web-scale search monitors. They are also already building differential billing for unchanged pages (#4345). Compete there on depth and cost — visual diffs, cheap keyword triggers instead of an expensive LLM judge, business-hours scheduling, browsable version history — not on existing at all.

---

## 6. Pricing

The complaint about per-page pricing is not the unit — it is the **opacity** around retries and rendering overhead counting against the user. Four models worth combining:

- **Open-core self-host** — Apache/MIT core, $0 marginal. fastCRW's pitch is instructive: "$18/month VPS, same cost whether JS rendering or not." Simultaneously neutralises the AGPL complaint.
- **BYOK control-plane fee** — the most disruptive option. LLM Gateway proves the model: routing is free, you pay providers directly. Removes the vendor's incentive to be opaque about failures, because the vendor no longer profits from them.
- **Pay-per-event** (Apify's model) — distinct billable events rather than one opaque credit.
- **Managed credits** for casual users who want no infrastructure decisions.

Two rules that fall directly out of the research: **never bill a request that returned a block page** (Firecrawl #2413 bills them today), and **return an estimated cost before executing**.

---

## 7. Risks

| Risk | Assessment |
|---|---|
| A frontier lab ships free bundled browsing | Category-repricing event. No standalone competing API exists today, but this is the single biggest exogenous threat |
| Anti-bot is a permanent arms race | Firecrawl closed its fingerprinting issue as "not planned" because it is genuinely hard. Mitigate with BYO-proxy/BYO-browser so you are not the sole party fighting it |
| Reworkd's failure mode | Archived Jan 2026 — infra costs plus incumbents who already own proxy infrastructure. "AI-native" is not a moat; BYOK and open-core are, because they are structural rather than technical |
| EU database rights | No US equivalent. Full-database mirroring needs separate legal analysis from ordinary page scraping |
| Cloudflare Pay Per Crawl | Default-blocked AI scraping on new domains, enforced via HTTP 402. Plan to parse and surface pay-per-crawl and RSL signals rather than silently override them |

---

## 8. Open questions

1. **The 5× stealth multiplier cannot be resolved from outside.** Current docs say no surcharge; 2026 pricing blogs say 5×; the changelog 404s. Test empirically against a live account before it appears in any comparison material.
2. **Reddit and X were never reached.** Reddit is blocked for fetch in this environment and two key HN threads returned 429. All community sentiment here is second-hand via blog aggregation. Worth a manual pass.
3. **No v2 OpenAPI spec exists publicly** — `openapi.json` on main is still v1.0.0 with `/deep-research` at top level.
4. **Unresolved API details:** the `attributes` and `query` format internals, the PDF `parsers` per-page field name (`pages` vs `pageMarkdown`), whether `/v2/batch/scrape` nests or flattens `scrapeOptions`, and whether `crawl.failed` actually fires.
5. **Scope decision needed:** does Helix bridge web scraping *and* document parsing (white-space gap #2)? It roughly doubles the surface but is the only unclaimed structural position in the market.

---

## Appendix — source reports

| File | Contents |
|---|---|
| `research/01-firecrawl-teardown.md` | Full API surface, params, pricing, self-host |
| `research/02-firecrawl-weaknesses.md` | ~40 cited GitHub issues by category |
| `research/03-competitive-landscape.md` | ~35 vendors, pricing matrix, BYOK/self-host taxonomy |
| `research/04-api-corrections.md` | Zod-source-verified corrections — **overrides 01 on conflict** |
| `research/05-dx-and-byok.md` | DX gaps, MCP schema issues, BYOK precedents |
| `research/06-monitoring-and-datalayer.md` | Monitor product scope, unmerged PRs, data-layer gaps |
| `research/07-infra-buildout.md` | Browser/fetch/proxy/compliance/extraction/queue with costs |
| `research/08-feature-ideation.md` | Prioritised features with demand evidence |

Reports live in the session scratchpad at
`C:\Users\harry\AppData\Local\Temp\claude\e--Helix\a4dcb1df-5be2-4dab-a8b8-57203af3ad4d\scratchpad\research\`
