# Infra Deep-Dive: browser / fetch / proxy / compliance / extraction / queue (agent 3)

## 1. BROWSER LAYER
Playwright v1.62 (Jul 2026), releases every 3-6wks. Multi-browser, first-class BrowserContext
isolation (hundreds of isolated sessions in ONE process). npm 57.6M/wk vs Puppeteer 10.7M/wk (~5x).
All stealth plugins + AI agent frameworks (Browser Use, Skyvern, Stagehand) standardized on it.
Puppeteer v25.1.0 (May 2026), tracks Chrome 149, monthly. Slimmer, more CDP-native, faster for
simple single-page. Better for serverless bundles.
Raw CDP: browser-use MIGRATED OFF PLAYWRIGHT to raw CDP in 2025 for speed. "Growing trend toward
direct CDP for performance-critical applications."
--headless=new: since Chrome 112 headless/headed share the code path. OLD HEADLESS FULLY REMOVED
in Chrome 132. Remaining deltas: GPU rendering, missing input-device entropy, font/AudioContext.
DETECTION HAS MOVED UP THE STACK to input-event physics + CDP session leaks.

### Pool architecture
CORE: launching Chrome ~1s+ and hundreds of MB; opening a page/context in a running browser is
nearly free. Pattern = ONE BROWSER PROCESS, MANY CONTEXTS. Never one-browser-per-job.
- warm pool, pool manager owns lifecycle, concurrency ceiling = pool size
- reuse page if no isolation needed; fresh BrowserContext per session otherwise
- RESTART the browser every few hundred pages to bound memory-leak accumulation
- Lambda cold start 3-6s; launch OUTSIDE the handler -> ~10-20ms warm. Tune >=1600MB, ~30s timeout.

### Memory
baseline ~100MB idle, 300-500MB w/ one active page
per tab/context +50-200MB (static article ~80MB, app-like 150-250MB, video-heavy 300-530MB)
separate processes cost 200MB+ EXTRA each vs shared-browser reuse
1,000 concurrent pages @ ~250MB = ~250GB RAM
HEURISTIC: concurrent pages ~= (RAM - 1GB) / 300MB. A 4GB box = ~8-10 concurrent w/ resource blocking.
@sparticuz/chromium: brotli binary ~50MB, Chromium v149, Node 16-22, x86_64/arm64, Lambda Layer.
De facto Lambda-Chromium standard (successor to deprecated chrome-aws-lambda).

### Cost per platform
AWS Lambda   $0.0000097222/GB-s. 1M req/mo ~= $2.17; 50M/mo ~= $108.33
AWS Fargate  $0.0512/vCPU-hr + $0.0176/GB-hr. 1M req/mo ~= $56.92 fixed
GCP Cloud Run $0.000024/vCPU-s + $0.0000025/GiB-s, $0.40/M above 2M free. Needs >=1GB for Chrome
Fly.io       per-second no idle charge. 256MB shared ~$0.0027/hr (~$1.94/mo always-on);
             2vCPU/4GB perf-2x ~$31/mo
Cloudflare Browser Rendering $0.09/browser-hour. 1000 pages @1s = $0.025; @10s = $0.25.
             Billing began 2025-08-20.
RULE: sub-second jobs favor Lambda to ~6-8M invocations/mo. FARGATE/ECS WINS ABOVE ~1M RENDERS/MO
given multi-second render times.
Firecrawl hosted reference: P95 3.4s/scrape. $19/3K=$6.33/1000; $99/100K=$0.99/1000; $399/500K=$0.80/1000.

### Lightpanda (Zig, NOT a Chromium fork)
libcurl + html5ever + custom DOM + V8. Skips CSS layout, GPU compositing, font rendering.
11x FASTER, 9x LOWER MEMORY than headless Chrome.
100-page scrape: 2.3s @ 24MB vs Chrome 25.2s @ 207MB.
933 pages/100 tabs on EC2 m5.large: Chrome >1hr, Lightpanda <5s.
CDP-COMPATIBLE — near drop-in for Playwright/Puppeteer scripts.
CANNOT handle sites needing real visual layout/canvas.
Steel.dev: OSS self-host free; hosted Hobby free 100 browser-hrs/mo -> Startups $499/mo 9,980 hrs.
  Built-in stealth/CAPTCHA solving EVEN SELF-HOSTED.
ScrapingBee: stealth-proxy requests cost 75 CREDITS EACH (~3,333 protected requests at $49 tier).

## 2. FETCH TIER
### Escalation heuristics
- raw-HTML vs rendered-DOM diff: large gap = client-side rendering
- hydration markers: empty <div id="root">/<div id="__next">, missing JSON-LD, content only post-XHR
- framework signatures (__NEXT_DATA__, data-reactroot) = a PRIOR, not certainty
- CRITICAL: hybrid frameworks (Next/Nuxt/SvelteKit) often ship real SSR HTML. Plain fetch may already
  have the content; hydration only adds interactivity. "If Next.js then browser" OVERUSES the
  expensive path. Correct heuristic = CONTENT-PRESENCE-IN-RAW-HTML, not framework name.
- Standard: fetch-first, escalate on signal. High-scale scrapers converge on this vs browser-first.

### TLS/HTTP fingerprinting
JA3 (2017): MD5 of ordered TLS version/ciphers/extensions/curves. BROKEN for real Chrome too since
  Chrome 110 (Jan 2023) randomized extension order.
JA4: sorts before hashing (order-independent). UNIVERSALLY ADOPTED by Cloudflare, AWS WAF,
  VirusTotal, Akamai as of 2026.
WHY naive requests/fetch get blocked: OpenSSL/Node TLS produce ClientHello signatures distinct from
  BoringSSL/NSS. FLAGGED BEFORE ANY HEADER OR HTML BYTE IS PROCESSED.
HTTP/2 layer: SETTINGS frame params, flow-control windows, pseudo-header order.
  Example: JA4 claims "Chrome 148" but HEADER_TABLE_SIZE=4096 (Python httpx default vs Chrome's
  actual 65536) -> flagged pre-response.
  Claimed >95% of automated HTTP/2 clients carry fingerprints matching NO real browser.

### Mimicry tools
curl-impersonate  TLS/HTTP2, curl fork, pre-compiled per-browser binaries
curl_cffi         (lexiforest/curl_cffi) Python bindings, actively maintained, NO JS execution
tls-client        (bogdanfinn/tls-client, Go) v1.15.1 2026-06-08, selectable per-request TLS profiles
rebrowser-patches CDP session layer. Fixes the Runtime.enable leak used by Cloudflare/DataDome as an
                  automation signal. Chromium-only, no TLS/JS coverage.

### FINGERPRINT CONSISTENCY (the key principle)
Detection needs only ONE layer inconsistent with the others. No single signal needs to be wrong.
- Chrome UA header + JA3/JA4 matching Python requests = immediate spoofing evidence
- JA4 "Chrome 148" + wrong HEADER_TABLE_SIZE = contradiction detected pre-response
- CANVAS: real browsers give a STABLE hash per device. Tools injecting RANDOM noise per read are
  THEMSELVES A TELL. Randomize once per session, then hold stable.
- TLS + CDP + JS-fingerprint layers must all agree on ONE coherent browser/OS/device identity.
  Not three independently-configured tools bolted together.

### Recommended pipeline
(1) TLS-impersonating plain fetch (curl_cffi/tls-client) w/ coherent identity
(2) hydration-marker check
(3) full browser render (Playwright + rebrowser-patches, or Lightpanda for pure extraction) ONLY when
    needed, with MATCHING TLS/CDP/JS identity
Firecrawl itself: Playwright + basic-fetch fallback, Express.js + BullMQ/Redis, pinned v2.11.162.

## 3. PROXY LAYER
Type          Detection risk  Cost      Best for
datacenter    highest (ASN)   cheapest  weak/no bot defenses
residential   low             mid-high  Cloudflare/Akamai/PerimeterX/DataDome
ISP (static)  low             mid/IP/mo stable identity, logged-in sessions
mobile        lowest          highest   hardest targets only

### Residential $/GB 2026
Webshare    $3.50 (1GB) -> $1.40 (3000GB)   steepest curve
IPRoyal     $1.75 PAYG
Decodo      $3.75-4.00 -> $2.75 (100GB)     sticky 30min
SOAX        $5.00 Tier1 low-vol -> $0.50-0.85 Tier1 15TB+   geo-tiered
Oxylabs     $6.00 (5GB) -> $2.50 (1TB)      sticky 24hrs (LONGEST)
BrightData  ~$5-8 -> ~$2-3  [UNVERIFIED — two secondary sources disagree, $5.04 vs $8.40 PAYG]
Webshare datacenter is cheapest in market: $0.018-0.03/IP/mo.
Geo pricing: SOAX Tier1/2/3 shows Western IPs cost 2-4x rest-of-world at equal volume.
Oxylabs geo granularity extends to city/state/ZIP/coordinates/ASN.

### BYOP interface design
Config: global default proxy; per-request `proxy` field (scheme://user:pass@host:port);
  per-domain routing table; session_id/session_ttl fields; encrypted creds, redacted logs.
PRODUCT OWNS: retry/failover, block-page detection (CAPTCHA/403/429/WAF fingerprinting),
  per-target-domain concurrency throttling.
DELEGATE TO PROVIDER: IP rotation mechanics, geo resolution, pool health, uptime SLA.
Managed tier = architecturally IDENTICAL internally, just populated with product-owned pool creds.
NOT a divergent code path. <-- important design decision

## 4. COMPLIANCE / LEGAL
### robots.txt
RFC 9309 (Sept 2022): case-insensitive UA matching, LONGEST-MATCH-WINS Allow/Disallow, 500 KiB min
parser support, <=24hr caching. CRAWL-DELAY IS EXPLICITLY NOT IN RFC 9309 — Bing/Yandex honor it
differently, GOOGLE IGNORES IT ENTIRELY. Libs: Python Protego (Scrapy default), Node robots-parser.
Sitemaps: max 50,000 URLs / 50MiB per file. Discovered via Sitemap: line in robots.txt or default
path probing. TREAT <lastmod> AS UNRELIABLE — often stale or fabricated.

### Rate limiting shape
token bucket per host + per-domain concurrency cap (2-8) + adaptive backoff (honor Retry-After,
exponential + jitter) + global ceiling. [no single canonical source — established practice]

### Case law
hiQ v LinkedIn FINAL: 9th Cir held public-data scraping doesn't violate CFAA (2019); SCOTUS
vacated/remanded post-Van Buren (2021); 9th Cir reaffirmed (Apr 2022); **DEC 2022 SETTLEMENT:
$500,000 JUDGMENT AGAINST hiQ**, liability under CALIFORNIA TRESPASS TO CHATTELS + BREACH OF ToS,
permanent injunction to destroy derived data.
=> hiQ WON ON CFAA, LOST ON STATE CONTRACT/TORT LAW. THE key lesson: avoiding CFAA risk via
public/unauthenticated scraping DOES NOT immunize against ToS-breach or trespass claims,
especially where technical countermeasures were circumvented.
Van Buren v US, 593 U.S. 374 (2021): SCOTUS 6-3 narrowed CFAA "exceeds authorized access" to mean
accessing files/systems you're not entitled to AT ALL — not misusing authorized access.
=> CFAA now weak against public-data scrapers; LIVE RISK SHIFTED TO CONTRACT, STATE TORT,
   COPYRIGHT, AND DATABASE RIGHTS.
EU sui generis database right (Directive 96/9/EC): protects "substantial investment" against
unauthorized extraction/re-utilization. Innoweb v Wegener (2013 CJEU): meta-search engine
replicating a target's search functionality against its full DB INFRINGED. Ryanair v PR Aviation:
exceptions don't apply to non-qualifying DBs — those fall to ordinary contract law.
=> Systematically mirroring a competitor's structured DB (job board, catalog, listings) carries
   REAL EU exposure with NO US federal equivalent post-Feist.
   [C-762/19 CV-Online v Melons — UNVERIFIED, don't cite specific holdings]
GDPR/CCPA: scraping EU-resident PII makes you a DATA CONTROLLER (Art 5/6). "Legitimate interest"
requires a documented balancing test DPAs have repeatedly found tips AGAINST scrape-for-resale/
profiling. RIGHT TO ERASURE (Art 17) applies to cached/re-served scraped PII regardless of original
source — real architectural obligation to locate/purge on request. CCPA's "publicly available"
exemption covers OFFICIAL GOVERNMENT RECORDS ONLY, not scraped third-party content.

### AI-crawler landscape
Cloudflare Pay Per Crawl launched 2025-07-01: first major infra provider to DEFAULT AI SCRAPING TO
BLOCKED for new domains. Allow free / block / set a price enforced via HTTP 402 Payment Required.
TIME, The Atlantic, Conde Nast at launch. ["billions of daily 402s" UNVERIFIED, single source]
RSL (Really Simple Licensing): launched 2025-09-10 by RSL Collective (RSS co-creator Eckart Walther
+ ex-Ask.com CEO Doug Leeds). RSL 1.0 declared "official industry standard" 2025-12-10, 1,500+
endorsing orgs. Machine-readable licensing vocabulary (attribution, pay-per-crawl, pay-per-inference)
layered on robots.txt.
llms.txt: Jeremy Howard (Answer.AI) 2024-09-03. ~10.13% adoption of a 300K-domain sample by 2026 BUT
NO MAJOR AI LAB HAS PUBLICLY COMMITTED TO READING IT. Community proposal, not IETF/W3C standard.
"ai.txt" AS A DISTINCT STANDARD IS UNSUBSTANTIATED — likely conflated with llms.txt/RSL.
IETF AIPREF WG: Content-Usage header (train-ai/search, each y/n). draft-ietf-aipref-vocab Proposed
Standard track rev 06, expiring ~Oct 2026. ACTIVE BUT NOT RATIFIED, no production deployment.

### Responsible defaults checklist
1. parse/honor robots.txt (longest-match), logged opt-in override only
2. honor crawl-delay despite nonstandard status
3. discover/prefer sitemap.xml over blind link-following
4. conservative per-host token-bucket + concurrency defaults, user raises deliberately
5. HONEST CONTACTABLE User-Agent — spoofing a browser UA STRENGTHENS a target's unauthorized-access claim
6. parse/surface AI-usage signals (robots AI-UA blocks, RSL, AIPREF) rather than silently overriding
7. OPERATIONAL GDPR/CCPA erasure support, not just policy text
8. treat authenticated scraping as CATEGORICALLY higher legal risk than public
9. flag EU database-sui-generis exposure separately for full-DB-mirroring use cases

## 5. CONTENT EXTRACTION
Readability.js  Apache 2.0  Firefox Reader View engine, ~30ms init ~10ms/doc
trafilatura     Apache 2.0  v2.2.0, used by HuggingFace/MSR/Stanford
Defuddle        TS/JS       9.1k stars, Obsidian Web Clipper engine, uses page's own MOBILE CSS as signal
Docling         MIT (IBM/LF) deep-learning layout->table->role pipeline
markitdown      MIT (MS)    v0.1.6 May 2026, 175k stars, plugin architecture
turndown/html2text  MIT/GPLv3  pure format converters, NOT boilerplate removers

### Benchmarks (independently converging)
trafilatura own eval (990 docs): trafilatura 2.2.0 F1 0.924 > justext 0.862 > readability-lxml 0.826
  > goose3 0.810
Sandia National Labs (SAND2024-10208): trafilatura highest mean F1 0.937 / precision 0.978;
  READABILITY HIGHEST RECALL 0.929 (over-includes vs trafilatura's precision)
SIGIR 2023 (Bevendorff et al.): Readability + trafilatura are the two most ROBUST across diverse
  templates; boilerpy3/newspaper4k ERROR OUT on a real-world HTML fraction
DEFUDDLE HAS NO INDEPENDENT THIRD-PARTY BENCHMARK — vendor claims only.

### PDF
Tables: rule-based (Camelot lattice/stream) -> neural (Table Transformer, ~2x borderless TEDS
  improvement) -> full pipeline (Docling TableFormer, 97.9% third-party-benchmarked)
Engines: pypdfium2 (Apache/BSD — SAFER LICENSE for self-hostable BYOK) vs PyMuPDF (10-50x faster
  but AGPL, requires open-sourcing or a commercial Artifex license) <-- licensing decision point
olmocr-bench (1,403 PDFs):
  Gemini Flash 3.5 (VLM)  76.4%   —
  Marker (balanced)       76.0%   2.9 pg/s
  MinerU                  72.7%   0.54 pg/s
  Marker (fast)           66.6%   7.4 pg/s
  Docling                 50.3%   2.1 pg/s
=> Marker (Apache 2.0) matches a frontier VLM at ~5x MinerU throughput. Docling wins specifically on
   TABLE FIDELITY (97.9%) despite lower general OCR score. DIFFERENT TOOLS WIN DIFFERENT SUB-TASKS.
Mistral OCR: 94.89% accuracy, $1/1,000 pages, 2,000 pages/min/node [possibly superseded, verify]
Office: python-docx/pptx/openpyxl composed, or markitdown/Docling wrapping them behind one
  convert()->markdown. Office formats are notably MORE reliable out-of-box than scanned PDFs.
Images: OCR (Tesseract/PaddleOCR, cheap/deterministic/self-hostable) for text-dominant; VLM
  captioning for semantic (charts, diagrams). BEST PRACTICE = HYBRID CONDITIONALLY-ROUTED, not all-VLM.

## 6. STRUCTURED EXTRACTION
Firecrawl /extract internals: async pipeline, JSON Schema input, Vercel `ai` SDK getModel router
that ESCALATES TO A MORE CAPABLE MODEL ONLY FOR RECURSIVE SCHEMAS, schema normalization (strips
additionalProperties, aligns required) for strict:true compat, PLUS relevance-scoring/trimming
before the LLM call (retrieval-then-extract, NOT raw dumping). <-- copy this
Instructor (Python): 3M+ monthly downloads, 11k stars. Pydantic BaseModel -> provider call ->
AUTOMATIC VALIDATION + RE-ASK-ON-FAILURE across 15+ providers.
OpenAI    json_schema mode, strict:true (distinct from older non-conformant "JSON mode")
Anthropic forced tool-use, tool_choice any/tool + strict:true. NOT COMPATIBLE WITH EXTENDED THINKING.
Gemini    responseSchema, native Pydantic/Zod. Explicitly warns syntactically valid != semantically correct.
=> All three converged on schema-constrained decoding with a strict-equivalent flag.
   SCHEMA ENFORCEMENT SOLVES SHAPE, NOT TRUTHFULNESS.
   A BYOK product needs ONE internal schema representation compiled to each provider's native mechanism.
Anthropic prompt caching: write 1.25x base, READ 0.10x (90% discount). 100K-token scenario
  11.5s -> 2.4s. Cache a fixed system prompt + schema across a crawl batch.
  GOTCHA: CHANGING tool_choice INVALIDATES THE CACHE.
Self-healing selectors: Anansi (OSS) — CSS selectors carry CONFIDENCE SCORES; on failure four
  competing repair strategies (fuzzy class match, regex, structural context, XPath fallback) with
  the winner PERSISTED. Industry pattern: selector cache -> LLM-repair-on-failure -> validate -> persist.
  NO PEER-REVIEWED BENCHMARK EXISTS for selector self-healing — vendor/blog-sourced only.
Change detection in practice is mostly CHEAP PRE-FILTERING (ETag/Last-Modified/content-hash/
  sitemap lastmod), NOT formal DOM-tree-diff. [weakest-sourced subsection]

## 7. SCALE / QUEUEING
BullMQ (Redis) v5.x  leaf fetch jobs. De facto Node standard (Firecrawl uses it).
                     RATE LIMITING IS QUEUE-GLOBAL — per-host caps need layering.
Temporal             crawl orchestration. Durable execution survives crashes, idempotency via
                     deterministic Activity IDs. Heavier ops burden.
AWS SQS              zero-ops on AWS. Standard at-least-once ~$0.40/M. FIFO 300 msg/s/group.
NATS JetStream       queue + pub/sub fan-out, lower ops than Kafka, smaller ecosystem.
RECOMMENDATION: two-tier — BullMQ/SQS for high-volume leaf fetches, Temporal (or Redis-backed
frontier scheduler) for durable multi-thousand-URL crawl orchestration.

Idempotency key = hash(normalized URL + render params + proxy-country + schema version), used as the
queue's native dedup key (BullMQ jobId, SQS FIFO MessageDeduplicationId 5-min window).
ALL FOUR SYSTEMS ARE HONESTLY AT-LEAST-ONCE — build an idempotent SIDE EFFECT (upsert on write,
dedupe webhook dispatch on (job_id, event_type)). URL normalization (strip utm_*, sort query params,
normalize trailing slash/case) is a prerequisite.

Frontier: per-host queue partitioning by eTLD+1 with independent rate limiter/delay timer
(Nutch, StormCrawler fetcher.server.delay, Colly LimitRule{DomainGlob,Parallelism,Delay,RandomDelay}).
SELF-HOSTABLE ARCH: Redis sorted-set-per-host, score = next-eligible-fetch-timestamp; scheduler pops
eligible via ZRANGEBYSCORE + Lua claim, enqueues to fetch queue, reinserts score = now + delay.

### Bloom filters (verified against Redis's own docs)
k = ceil(-ln(error_rate)/ln(2)) hash functions
bits/item = -ln(error_rate)/ln(2)^2
  1%    -> 7 fns,  9.585 bits/item
  0.1%  -> 10 fns, 14.378 bits/item
  0.01% -> 14 fns, 19.170 bits/item
**1 BILLION URLs @ 0.1% FP = ~1.8GB vs a plain Redis SET at ~40GB (22x more memory).**
BF.RESERVE key error_rate capacity [EXPANSION n] auto-scales by stacking sub-filters (default 2x).
Accept auto-scaling for open-ended crawls rather than NONSCALING.
CUCKOO FILTERS (CF.*) when you need DELETION/re-crawl semantics — Bloom supports no deletion.
HyperLogLog answers cardinality, NOT membership. Not a substitute.

Backpressure: global concurrency semaphore in front of the browser pool is the primary control —
never dispatch beyond warm pool capacity. Layer token buckets at per-host, per-customer, global.
ADAPTIVE CONCURRENCY (AIMD/TCP-congestion-style): shrink in-flight when p99 latency/error rate
spikes, ramp back gradually. Queue depth per tenant gates new submissions (429/Retry-After) rather
than accepting unbounded backlog.

### Webhooks — Stripe as the verified reference model
Retry: up to 3 DAYS exponential backoff (live); 3 retries over hours (test).
Signature: `Stripe-Signature: t=<timestamp>,v1=<hmac>`, HMAC-SHA256 over "{timestamp}.{body}",
  CONSTANT-TIME comparison, 5-MINUTE default tolerance window. NEVER use 0 tolerance.
Secret rotation: dual-active secrets for 24hrs during rollover.
ORDERING NOT GUARANTEED — receivers must be idempotent and order-independent.
Fast-ack: return 2xx immediately, slow work async. Applies BOTH to inbound handling and the
  product's own OUTBOUND dispatch — isolate it so a slow customer endpoint can't backpressure scraping.
Dead-letter: after retry exhaustion, surface failed-delivery history with MANUAL REPLAY.
=> Firecrawl's 3 retries over 21 min + no signing is far below this bar. Easy differentiator.

Observability priority metrics: queue depth per stage (EARLIEST backpressure signal), per-host
success rate + latency percentiles (drives adaptive concurrency), browser pool utilization, proxy
pool health (block-rate by pool), extraction latency/cost tracked SEPARATELY from fetch/render,
idempotency hit rate. Stack: OpenTelemetry + Prometheus + Grafana.

## UNVERIFIED in this report
BrightData exact per-GB (two disagreeing sources); BrightData mobile-proxy closure to new customers
(~Apr 2026); CJEU C-762/19 holding; CCPA scraping enforcement guidance; Cloudflare PPC "billions of
402s/day" + GA status; "ai.txt" as a distinct standard; StormCrawler/Nutch maintenance velocity;
Temporal-at-scraping-company case studies; Mistral OCR figures (possibly superseded); Docling
"Heron"/RT-DETRv2 internals; Defuddle precision/recall; DOM-tree-diff & perceptual-hash change
detection (NO sourcing obtained); chunking specifics + semantic/result caching (general knowledge,
not freshly sourced); chrome-remote-interface & Node robots-parser maintenance cadence.
