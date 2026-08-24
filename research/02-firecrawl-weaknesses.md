# Firecrawl Weaknesses & Complaints (agent 1b) — cited GH issues

## Reliability
- #3751 no configurable scrape timeout self-host -> hangs, returns {"success":true} empty. Dup in mcp-server #103.
- #1679 crawls stuck in "scraping" forever, completed never increments, no timeout state (14 comments)
- #3210 `crawl --wait` hangs w/o --progress on self-host (SDK crawl() incompatible w/ self-hosted API)
- #1912 intermittent "No response received" JS SDK, same URL works sometimes. No retry/backoff built in.
- #2280 getCrawlStatus() times out on repeat calls but jobs complete AND GET BILLED
- #1327 self-host 408 "Missing lock for job"
- #3614 cancelling crawl FLOODS webhooks with crawl.failed per remaining queued URL
- #722 MEMORY LEAK self-host: 13%->85% RAM after ~30 crawls, never recovers w/o restart (16 comments)

## JS/SPA rendering
- #2434 fullPage:true screenshots randomly return only hero section; waitFor:4000 does not fix (27 comments)
- #2639 click actions silently no-op — XPath works in console, not via actions[]
- Their own docs market "smart wait"+actions BECAUSE infinite scroll/SPA is otherwise missed = not automatic
- Hyperbrowser (biased): Firecrawl extraction is "stateless", struggles w/ authed routes + deep session workflows

## Anti-bot (BIGGEST GAP)
- #2257 self-host fails where Browserless SUCCEEDS on identical host/IP. Root cause = BROWSER
  FINGERPRINTING not IP blocking. SCRAPE_ALL_ENGINES_FAILED vs Cloudflare/WAF.
  CLOSED AS "NOT PLANNED" — no maintainer fix.
- #2413 bot detection SILENTLY TREATED AS SUCCESS AND STILL BILLS A CREDIT. Payload is the
  Cloudflare block page, no exception. Explicit stealth fails 1st attempt, succeeds 2nd
  -> stealth not reliably auto-triggered on detection.
- #2350 anti-bot causes INFINITE WATERFALL LOOP, no timeout, engine pdf->document forever,
  process permanently unresponsive (25 comments)
- #495 (2024, still referenced) free-tier Cloudflare alone stops self-hosted Firecrawl (15 comments)
- Self-host lacks "Fire Engine" (cloud-only anti-bot/IP rotation) entirely

## Cost
- stealth = 5x multiplier, $0.00083 -> $0.0042/page Standard, often AUTO-invoked on CF sites
- extract = 5 credits/page, "most expensive op and the one most teams misuse"
- credits DO NOT ROLL OVER — "the Firecrawl tax"
- free tier = 1,000 credits ONE-TIME not monthly (most common overpay complaint)
- HN #45374976 (nextworddev): "egregiously expensive"
- Benchmarks: Firecrawl $6.84/1k req vs Scrapfly $3.97 vs WebScrapingAPI $2.49 (1.7-2.7x premium)
- HN #47578663 "I replaced Firecrawl with 2,700 lines of Elixir"
- AI Extract billed as SEPARATE subscription from $89/mo

## Rate limits
- free: 10 scrape/min, 1 crawl/min, 5 search/min
- paid still low concurrency, reported as low as 2 concurrent on some paid tiers
- #3150 NO agent-friendly rate-limit headers — agents must parse error strings + hand-roll backoff
- #3728 rate limiter FAILS CLOSED on Redis blip: auth.ts expects RateLimiterRes, gets plain Error,
  returns 429 to ALL traffic w/ "Consumed: undefined, Remaining: undefined" ~30s.
  Worker crashes on unhandled MaxRetriesPerRequestError. "opposite of resilient design"

## Missing features
- #1169 NO WAY TO BLOCK FIRECRAWL FROM YOUR OWN SITE — no identifiable UA, no robots.txt token,
  no meta noindex support. Open since 2024, 18 comments. (+ #558 meta tag)
  HN: robots.txt compliance "inconsistent, particularly one-off scrapes vs full crawls"
- #3587/#3782 no extraction-accuracy evals for RAG ingestion
- #2383 no timezone in results
- #814 Go SDK missing batch scrape
- #3827 Helm chart cannot use external Redis/Postgres/RabbitMQ
- #3407 timeout param used as BOTH seconds (API) and ms (Axios)

## PDF
- #3784 / Discussion #3708 garbled CJK text->markdown, reproducible w/ samples
- Fire-PDF + PDF Parser v2 rewrite w/ auto-OCR fallback = vendor concedes this was common
- #364 "improve PDF parsing" open since early

## Extract / structured output
- #2072 v2 JSON mode IGNORES SCHEMA — JS SDK does not convert Zod->JSON Schema before send.
  Reporter: v1 was better. REGRESSION. (8 comments)
- #1656 identical batch request returns json on cloud, EMPTY json on self-host
- DOCS ADMIT: minItems/maxItems cause the LLM to HALLUCINATE entries to satisfy constraint.
  Workaround = do not use those keywords.
- prompt-only extraction has unstable field names run-to-run (docs push schema instead)
- 30+ field schemas measurably degrade; official guidance = split into 2-3 calls of 10-15 fields

## Self-host
- Fire Engine cloud-only; billing logic + some AI features stripped from OSS build
- #2583 RabbitMQ race: API container ECONNREFUSED on first `docker compose up`
- min 8GB RAM (12GB rec) for API+workers+Playwright+Redis+RabbitMQ+Postgres(+FoundationDB)
- #1028 screenshots unsupported in early self-host (18 comments) — feature lag cloud vs OSS
- #948 "unable to build the docker image" (21 comments)
- #1791 Bull Auth Key regex bug
- #1467 OLLAMA/LOCAL LLM EXTRACT FAILS — demands Google API key, ignores configured local provider
  <-- direct BYOK opportunity

## Evidence gaps
Reddit not directly fetchable this pass (blocked); Reddit claims are 2nd-hand via blogs.
X/Twitter not covered at all. Large-PDF-specific timeouts unconfirmed as distinct category.
HN threads 47578663 + 45377657 hit 429 on fetch, snippets only.
