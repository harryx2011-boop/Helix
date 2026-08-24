# Firecrawl Teardown — Aug 2026 (agent 1)

## Endpoints (base https://api.firecrawl.dev/v2, Bearer fc-...)

### POST /v2/scrape (sync, single page)
formats: markdown, summary, html, rawHtml, links, images, screenshot, json,
changeTracking, branding, product, menu, audio, video, question, highlights
(branding/product/menu = vertical structured extractors — real differentiator)

Params: onlyMainContent(true), onlyCleanContent(false, LLM boilerplate removal),
includeTags/excludeTags, maxAge(172800000 = 48h, cache default-ON), minAge,
mobile, waitFor, timeout(60000; 1000-300000), headers, skipTlsVerification(true),
parsers(PDF: fast/auto/ocr, maxPages, pages/blocks/pageMarkers),
actions[wait,screenshot,click,write,press,scroll,scrape,executeJavascript,pdf],
removeBase64Images(true), blockAds(true),
proxy: basic|enhanced|auto  <-- v2 enum; "stealth" is legacy v1 naming for enhanced
location{country,languages}, storeInCache(true), lockdown(cache-only),
redactPII, zeroDataRetention(enterprise), profile{name,saveChanges} (persistent
browser session/cookies), threatProtection, auditMetadata,
jsonOptions{schema,prompt}, changeTrackingOptions{modes: git-diff|json, tag}

Response data: markdown, pages[], blocks[], summary, html, rawHtml, screenshot,
audio, video, answer, highlights, links[], actions{screenshots,scrapes,
javascriptReturns,pdfs}, metadata{title,description,language,sourceURL,url,
keywords,statusCode,numPages,totalPages,contentType,error,concurrencyLimited,
concurrencyQueueDurationMs}, changeTracking{previousScrapeAt,changeStatus,
visibility,diff,json}, branding{}, product{}, menu{}, warning

### POST /v2/crawl (async)
includePaths/excludePaths(regex on pathname), maxDiscoveryDepth, limit(10000),
allowSubdomains(false), crawlEntireDomain(false), sitemap(skip|include|only),
ignoreQueryParameters, regexOnFullURL, allowExternalLinks(one hop), delay(sec),
maxConcurrency, prompt (NL -> auto crawl config, LLM translates intent),
scrapeOptions(full scrape param set), webhook{url,headers,metadata,
events:completed|page|failed|started}, zeroDataRetention
-> {success,id,url}
GET /v2/crawl/{id}: status(scraping|completed|failed), completed, total,
creditsUsed, next(cursor), data[]
DELETE /v2/crawl/{id} cancel. GET /v2/crawl/{id}/errors.

### POST /v2/map
url, search(topic filter), sitemap, includeSubdomains, ignoreQueryParameters(false),
ignoreCache, limit, location, timeout -> {links:[{url,title,description}]}
~2-3s. Sitemap-first + crawl-cache/search-engine fallback.
DOES NOT guarantee full link discovery (self-disclosed tradeoff).

### POST /v2/search
query, limit(per source), sources[web,news,images], tbs(qdr:h/d/w/m/y or
cdr:...), filter(github/papers/pdfs), location, scrapeOptions
<-- search+scrape in ONE call is the key differentiator

### POST /v2/extract (async)
urls[] (glob wildcards), prompt, schema, enableWebSearch(false),
showSources(false), ignoreSitemap(false), includeSubdomains(TRUE),
ignoreInvalidURLs(true), threatProtection, scrapeOptions
NOTE: systemPrompt + allowExternalLinks NOT in current OpenAPI spec (deprecated).
v2 added: pagination handling, FIRE-1 interaction, web search fallback.

### POST /v2/batch/scrape (async)
Explicit urls[] instead of discovery. SHARES RATE LIMIT BUCKET WITH /crawl.

### Deep research
NO standalone endpoint confirmed in 2026. Absorbed into /extract enableWebSearch
+ OSS github.com/firecrawl/web-agent. Treat as deprecated/merged.

### FIRE-1 agent
Not an endpoint. agent:{model:"FIRE-1",prompt:"..."} inside scrape/extract.
Autonomous click/paginate/form-fill/modal-dismiss via NL vs scripted actions[].
Cost NON-DETERMINISTIC (task complexity). Pricing page: "Agent (Preview) 5 free
daily runs, dynamic pricing" -> metered outside standard credit table.

### Webhooks
webhook{url,headers,metadata,events}. Events: started, page(crawl.page),
completed, failed. data[] only populated on page events.
Signed: X-Firecrawl-Signature: sha256=<hmac>, HMAC-SHA256 over raw body.

## PDF
Fire-PDF engine. parsers config fast/auto/ocr. Tables get elevated token budget,
up to ~25s for table reconstruction.
OSS Rust lib: github.com/firecrawl/pdf-inspector (@firecrawl/pdf-inspector on npm)
classifies scanned-vs-text, flags needsOcr / suspected_garbled_text.

## Pricing (annual billing)
Free $0 / 1,000 credits / concurrency 2
Hobby $16 / 5,000 / 5
Standard $83 / 100,000 / 25
Growth $333 / 500,000 / 50
Scale $599 / 1,000,000 / 100
Enterprise custom (unlimited pages, ZDR, SSO, SLA)
Scale add-on: $397 per extra 350k credits.

Credit costs:
- scrape/crawl/map/monitor: 1 credit/page
- search: 2 credits per 10 results
- interact (browser actions): 2 credits per browser-minute
- STEALTH/ENHANCED PROXY: 5x multiplier (5 credits/page) <-- #1 bill-shock cause
- JSON/structured extract: +4 credits/page (3rd-party sourced, moderate conf)
- stealth + JSON stacked: up to ~9x base (single-source, unverified)
- cache hit credit cost: UNVERIFIED (no source says it's free)
- FIRE-1: non-deterministic

CREDITS DO NOT ROLL OVER — expire at cycle end. Most-cited complaint,
convergent across ~5 independent review sites.

## Rate limits (req/min, per TEAM, shared across keys)
Plan     scrape   map    crawl(+batch)  search   agent(+extract)
Free     10       10     2              10       2
Hobby    100      100    20             100      20
Standard 500      500    100            500      100
Growth   5000     5000   1000           5000     1000
Scale    10000    10000  2000           10000    2000
429 on exceed. /extract shares bucket with /agent; /batch shares with /crawl.
BUG: rate limiter FAILS CLOSED on Redis outage -> 429 everything with undefined
fields (GH #3728).

## SDKs / MCP / integrations
SDKs: Python, Node/TS, Go, Java, Elixir, Rust, Ruby, .NET, PHP (9 langs; only
Python/Node/Go high-confidence).
MCP: github.com/firecrawl/firecrawl-mcp-server (was mendableai/). Tools
firecrawl_scrape/search/crawl/map/extract. Supports self-hosted target.
llms.txt: standalone endpoint SUNSET after 2025-06-30, folded into main
endpoints. OSS: github.com/firecrawl/llmstxt-generator.
  -> BUILD IMPLICATION: llms.txt should be a first-class crawl output mode.
Integrations: LangChain (FireCrawlLoader in langchain-community), LlamaIndex,
Zapier, n8n (dedicated node), CrewAI. Dify/Camel unconfirmed.
WARNING: search surfaced package names "crewai-crw"/"langchain-crw" — likely
hallucinated, do not cite.

## Self-host (AGPL-3.0, github.com/firecrawl/firecrawl)
Cloud-only gaps:
- FIRE-1 / Spark models NOT in OSS (self-host gets scripted actions[] only)
- Fire Engine: stealth/anti-bot/IP-rotation is cloud infra, not shippable OSS
- "96% coverage / P95 3.4s" are fleet-tuning claims, not reproducible from code
Self-host gets: core scrape/crawl/search, worker/queue, CLI, workflows, skills.
docs.firecrawl.dev/self-hosting 404'd this pass — path moved.

## Build-worthy takeaways
1. Clone branding/product/menu as generic schema-driven VERTICAL PRESETS.
2. Avoid the pricing traps: non-rollover + stacking multipliers. Return an
   ESTIMATED COST in the request before executing.
3. Ship X-RateLimit-Remaining / X-RateLimit-Reset from day one (their users
   asked, GH #3150, unaddressed). Fail OPEN not closed.
4. Biggest wedge: ship stealth + agentic nav in the OPEN SOURCE product, not
   cloud-gated. That's the structural differentiator.
5. PDF OCR routing (needsOcr detection) built in from the start.
