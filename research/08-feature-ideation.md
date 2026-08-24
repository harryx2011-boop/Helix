# Feature Ideation (agent 4, redo) — 26 searches

## Top 15 differentiators (ranked demand x differentiation)
1. BYOK everything (LLM key, proxy, browser, vector DB) — collapses credit margin into control-plane fee
2. Persistent auth profiles + TOTP-native login
3. Permissive-license open core (AGPL is a recurring commercial blocker)
4. Self-hosted stealth parity, or pluggable BYO-stealth-proxy
5. Cost estimator before execution (/map-then-price dry run)
6. Scrape replay/debug UI (screenshot + full request replay per call)
7. Native vector-DB upsert on ingest
8. Contextual/semantic chunking at the API layer
9. changedetection.io-grade diff/webhook monitoring at crawl scale, hosted
10. Incremental sitemap-driven recrawl (bill only changed pages)
11. Unified agentic-action + scrape endpoint (act/extract/observe as ONE scrape call)
12. SQL/DuckDB-queryable output + native Parquet/S3/BigQuery export
13. Cookie/session unified across ALL endpoints (not just /scrape)
14. First-class YouTube-transcript / arXiv-PDF / GitHub-repo extractors
15. Accessibility-tree output mode for agent-context efficiency

## Unmet needs (cited)
- Cookies work on /scrape but NOT /map, /crawl, /search. GH #333 (open since Jun 2024),
  #1227 (scrape_url works, map_url/crawl_url don't), #1779 (Python SDK cookie confusion).
  Difficulty S — architecture consistency fix, not new capability.
- Self-host is "a barebones crawler" — plain Playwright, no stealth/proxy. Fire Engine is closed.
  GH #1964. HN "I replaced Firecrawl with 2,700 lines of Elixir" (#47578663),
  "Show HN: FastCRW — 6MB binary self-hosted Firecrawl alternative" (#48819736).
  fastCRW markets "$0/1k self-hosted vs $0.83-5.33/1k hosted". Difficulty L.
- AGPL-3.0 triggers legal review at most companies embedding it in a commercial network service.
  "Most commercial applications cannot comply." Crawlee is Apache-2.0. Difficulty S (a decision).
- PROXYWAY BENCHMARK: Firecrawl 33.69% success at 2 req/s, DROPPING TO 26.69% AT 10 req/s,
  vs 93.14% for the top performer. ~3x reliability gap under concurrency. Scrapfly claims 98%.
  Also: no mobile proxy support, headers.user-agent not passed to Playwright. Difficulty L.
  <-- this is the #1 reason technical users churn

## Auth'd scraping
- Browserbase Contexts: "save cookies, tokens, session state once, reuse... uniquely encrypted at rest"
  + a documented manual-MFA-with-Contexts template.
- Steel Profiles: "Your Agent's Persistent Identity".
- AWS Bedrock AgentCore has save-browser-session-profile as an API primitive => CATEGORY MATURITY.
- Firecrawl users asking how to log into Amazon-style sites and stay authed: GH #1093.
- TOTP-NATIVE (secret in, code out, no manual step): documented ad hoc via pyotp+Puppeteer but
  NOBODY offers it as a managed credential type. ~80% confident this is unbuilt. Difficulty S-M.

## Agentic browsing SOTA 2026
- Stagehand v3 (Browserbase): FULL REWRITE, talks DIRECTLY TO CDP (no Playwright layer), 44% FASTER.
  act/extract/observe blend scripted determinism with AI fallback.
- Browser Use: 89.1% WebVoyager, goal-level autonomy.
- Skyvern: 85.85% WebVoyager, best at form-filling / write-heavy authed workflows.
- Pricing diverges: per-browser-minute (Browserbase/Steel/Skyvern) vs per-page-credit (Firecrawl)
  vs flat subscription (consumer browsers).
- OPPORTUNITY: expose act/extract/observe AS A SCRAPING-API SURFACE — "click through this paywall,
  then scrape" as ONE call with schema output. The actual convergence point between bulk scraping
  and agentic control that NOBODY has cleanly unified. Difficulty L.

## RAG-native
- Firecrawl's OWN blog covers chunking strategies but core endpoints still return raw markdown —
  chunking is caller homework. Unstructured.io is chunking-focused but not scraping-focused.
- Contextual Retrieval (Anthropic pattern): prepend 50-100 token LLM summary per chunk. Difficulty M.
- Stable citation-preserving anchors surviving re-crawls: INFERRED gap, no direct complaint found,
  ~60% confidence. Difficulty M.
- Direct vector upsert as a scrape param: destination:{type:"pinecone",index,namespace}.
  Apify's Pinecone integration "handles batching, retries, collection creation, metadata mapping,
  ID generation" — exactly the boilerplate a native feature eliminates. NOBODY does it natively;
  Apify requires actor-chaining as a workaround. Difficulty M.

## Monitoring
- changedetection.io API: word/char-level diffs, Jinja2-templated webhooks, JSON/API monitoring via
  JQ SELECTORS (not just HTML), Apprise multi-channel. Mature + well-loved BUT SELF-HOSTED ONLY.
  Clear combine-X-with-Y: changedetection.io's diff/webhook UX + crawl-scale infra. Difficulty M.
- Incremental sitemap lastmod + content hashing, bill only changed pages. Difficulty M.

## Data layer
- SQL-queryable output (DuckDB over Parquet on S3): SELECT * WHERE price < 50 over a crawl result.
  Inferred from scrapy-contrib-bigexporters existing purely to add Avro/Parquet/ORC. ~65% conf. L.
- Native Parquet/S3/BigQuery export. Difficulty S-M.
- Entity resolution/dedup (same product from 50 sites -> one record). ScrapingAnt's "Web Data Quality
  Layer" post treats this as a distinct product concern = currently a bolt-on. Difficulty L.

## DX
- Cost estimator: dry-run crawl spec against /map to show "N credits / $X" before committing.
  ~70% conf nobody does it. Difficulty S.
- SCRAPFLY ALREADY SHIPS REPLAY/DEBUG: "debug each API call by saving the scraped result...
  screenshot URL and content replay URL." Firecrawl users hit opaque "Job not found". Difficulty M.
- MCP server with live per-call latency + credit cost inspection. Difficulty S.

## BYOK — the economic core
- Scrapfly Proxy Saver: "bring your own provider via Bright Data, Oxylabs, Webshare, SmartProxy...
  into the same API endpoint" => PROXY BYOK ALREADY VALIDATED IN-CATEGORY.
- LLM Gateway: "routing through LLM Gateway is FREE — you pay your providers directly"
  => proves LLM-key BYOK collapses the platform fee to near-zero. THE economic unlock.
- Bright Data ships a "BYOK mode for improved compliance and monitoring" on its LLM scraper.
- EFFECT: converts per-page margin into a flat control-plane fee, AND removes the vendor's
  incentive to be opaque about retries/failures — which IS the #1 credit-pricing complaint.
  Difficulty M (product/pricing architecture, not hard engineering).

## Niche power features
YouTube transcripts w/ timestamps, no quota/OAuth — Supadata, TranscriptAPI, youtube-transcript.io
  exist PURELY to fill this gap = standalone demand supports point solutions. Difficulty S.
Common Crawl / Wayback fallback on live-fetch failure — scrapy-wayback middleware, GoGetCrawl
  (dual-archive). Both OSS point tools, NO major API vendor. Difficulty M.
Accessibility-tree extraction for agent consumption — active 2026 research (arXiv Prune4Web,
  observation-reduction papers), token-cost optimization. Emerging in browser-agent frameworks,
  NOT in scraping APIs. Difficulty M.
Geo-variant capture (same URL, N countries) — "41% of global websites deploy geo-IP customization".
  Scrape.do, Bright Data. Difficulty S if the proxy layer is already geo-capable.
Shadow DOM / iframe-nested extraction — browser-use #3619 "IFRAME excessive scrolling /
  get_element_by_prompt only returns visible elements". NOBODY FULLY SOLVES THIS. Difficulty M-L.

## Pricing innovation
- Per-successful-page: the complaint is not the unit, it's OPACITY around retries/rendering overhead.
- Apify pay-per-event: distinct billable events (start, per-dataset-item) rather than one opaque
  credit. Proven, 20% platform commission on top.
- BYOK collapses platform fee to near-zero (LLM Gateway model). Most disruptive available.
- Flat self-host / per-GB ceiling: fastCRW pitches "$18/month VPS cost same whether JS rendering
  or not". Open-core (Apache core + paid hosted control plane) sidesteps the AGPL complaint at
  the same time.
- Hybrid (credits casual + BYOK flat scale + open-core self-host): Difficulty M, billing/packaging.

## Flagged lower-confidence
Citation anchors ~60%. SQL output as wholly unmet ~65%. Cost estimator unbuilt ~70%
(absence of evidence in search, not confirmed absence of feature).
HN #47578663 and #48819736 returned 429 — titles + secondary citations only, threads not read.
