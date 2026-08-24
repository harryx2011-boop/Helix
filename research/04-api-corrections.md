# Firecrawl v2 API — Zod-source-verified CORRECTIONS (agent 1c)
Verified against apps/api/src/controllers/v2/types.ts + TS/Python SDK types.
THESE OVERRIDE report 01 where they conflict.

## MAJOR CORRECTIONS to report 01
1. NO `jsonOptions` top-level field in v2. Structured extraction = formats:[{type:"json",schema,prompt}]
   Zod + both SDKs + docs all agree. "jsonOptions" is stale v1 terminology.
2. `stealth` is NOT the current enum. proxy = basic|enhanced|auto (default auto).
   "stealth" persists only as an unpurged literal in SDK type unions.
3. **ENHANCED PROXY HAS NO CREDIT SURCHARGE.** Verbatim from docs/features/proxies:
   "Enhanced proxies carry no credit surcharge, so either way only the regular cost is billed."
   THIS REVERSES the widely-repeated "5x stealth multiplier" claim. The 5x figure appears
   in 2026 third-party pricing blogs but is CONTRADICTED by current first-party docs.
   -> Either the surcharge was removed at an undated point, or the blogs were always wrong.
   -> changelog 404s on every URL variant, so the change date is unrecoverable.
4. crawl status enum has 4 values incl. `cancelled` (Zod), not 3 (prose docs).
5. NO HMAC WEBHOOK SIGNING documented. Three independent direct fetches found no
   signature/HMAC/secret language. The X-Firecrawl-Signature claim came from a
   third-party snippet and is CONTRADICTED by primary docs. Only auth = your own
   headers{} object. (Report 01's HMAC claim is wrong.)
6. changeTracking.diff is an OBJECT {text: "..."}, not a nullable string.
7. deep-research: /v1/deep-research STILL LIVE but deprecation banner says unmaintained
   after 2025-06-30 — 14 months past. No v2 equivalent ever existed. Replacement is a
   DIY workflow pattern (search + scrape + your own LLM loop), pointing at their OSS "Firesearch".

## formats — FULL union (18 entries, Zod source)
String-only (coerced to {type:name}): markdown, html, rawHtml, rawBase64, links, images,
  summary, branding, product, menu, audio, video
Object-based:
  json {schema?, prompt?}
  deterministicJson  <-- mutually exclusive with json (.refine)
  changeTracking {modes?:("git-diff"|"json")[], schema?, prompt?, tag?}
    REQUIRES markdown also in formats. Bypasses cache/maxAge entirely.
  screenshot {fullPage?, quality?1-100, viewport?{width,height}}  <-- only ONE per request
  attributes  <-- inner fields UNRECOVERED
  question {question: string <=10000}
  highlights {query: string <=10000}
  query  <-- distinct from question; differentiation UNRESOLVED
rawBase64 cannot combine with any other format.
NOTE: `screenshot@fullPage` is NOT a format string — fullPage is a boolean inside screenshot.

## actions — full schema (max 50/request, combined wait <=60s)
wait {milliseconds? | selector?}
click {selector, all?=false}
write {text}  (requires prior click/focus)
press {key}
scroll {direction?=down, selector?}
screenshot {fullPage?, quality?, viewport?}
executeJavascript {script}
scrape {}  (mid-flow snapshot)
pdf {format?=Letter (A0-A6|Letter|Legal|Tabloid|Ledger), landscape?=false, scale?=1}

## Additional scrape params not in report 01
fastMode (bool, default false) — in both SDKs, behavior undocumented
deduplicateSimilarURLs (crawl, default TRUE) — new in v2
ignoreRobotsTxt (crawl, ENTERPRISE-GATED)
robotsUserAgent (crawl)
redactPII {mode: accurate|aggressive|fast, entities:[PERSON,EMAIL,PHONE,LOCATION,FINANCIAL,SECRET],
           replaceStyle: tag|mask|remove}
threatProtection {mode: off|normal, riskScoreThreshold 0-100, blacklist, whitelist,
                  blockedTlds, failurePolicy: open|closed}
auditMetadata {username, <=1024 chars}
integration, origin, useMock — in SDK types, purpose undocumented

## GET /v2/crawl/active  (not in report 01)
Lists all running crawl jobs for the team: {success, crawls:[{id,teamId,url,options}]}

## /v2/map corrections
limit default = 5000 (max 100,000), NOT 100.
includeSubdomains default TRUE. ignoreQueryParameters default TRUE. 7-day sitemap cache.
Response links have ONLY url/title/description — no lastModified, no depth.

## /v2/search detail
query max 500 chars. limit default 10 (1-100) PER SOURCE.
sources: oneOf {type:web, tbs?, location?} | {type:news} | {type:images}
categories enum: github, research, pdf, developer
includeDomains/excludeDomains MUTUALLY EXCLUSIVE
highlights default TRUE
Response asymmetry: images = metadata only (NO scrape fields even with scrapeOptions);
web has description, news has snippet+date; both carry full scrape shape.

## /v2/extract
NO systemPrompt field. NO agent field on v2 (FIRE-1 examples are all /v1/ scoped).
GET /v2/extract/{id}: status completed|processing|failed|cancelled, data, expiresAt, tokensUsed.
showSources exists as a request option but WHERE sources land in the response is UNRESOLVED.

## /v2/batch/scrape
Docs example FLATTENS scrape params at top level next to urls (formats sits beside urls),
NOT nested under scrapeOptions. Contradicts v1 shape. NEEDS CONFIRMATION.

## TWO SEPARATE AGENT MECHANISMS (not one)
9a. FIRE-1 (legacy, 2025-04-15 launch, still "Beta", no deprecation banner)
    agent:{model:"FIRE-1", prompt} inside /v1/scrape or /v1/extract ONLY.
    No fixed multiplier published.
9b. POST /v2/agent — STANDALONE, spark models, NOT stated to be FIRE-1's successor
    prompt (required, <=10000 chars), urls[] (optional seeds), schema, maxCredits (default 2500),
    model: spark-1-pro (default) | spark-1-mini (~60% cheaper) | spark-2 (cheapest/fastest)
    GET /v2/agent/{jobId} -> {status: processing|completed|failed, data, model, creditsUsed}
    Badged "Preview": 5 free daily runs then dynamic. "Most runs consume a few hundred credits."
    strictConstrainToURLs — claimed once, NOT found on re-fetch, likely not real.
~70% confidence these are two parallel generations, not a succession. No source states lineage.

## Webhook events — exact dotted strings
crawl.started / crawl.page / crawl.completed
batch_scrape.started / batch_scrape.page / batch_scrape.completed
extract.started / extract.completed / extract.failed
agent.started / agent.action / agent.completed / agent.failed / agent.cancelled
monitor.page / monitor.check.completed
CONFIG-level events[] uses BARE names: "completed"|"failed"|"page"|"started"
CONFLICT: crawl.failed / batch_scrape.failed are subscribable in the request enum but
ABSENT from the events-listing docs table across 3 independent fetches. Don't assume they fire.
Delivery: must return 2xx within 10s. Retries at +1min, +5min, +15min (3 total), then
permanent failure. NO further attempts.

## Credit costs — first-party verified (docs.firecrawl.dev/billing)
scrape base            1 credit/page
crawl                  1 credit/page
map                    1 credit/CALL
search                 2 credits/10 results (rounded up)
json/LLM extraction    +4 credits/page
changeTracking json    +5 credits/page  (git-diff mode: NO extra cost)
PDF parsing            +1 credit/page
zeroDataRetention      +1 credit
enhanced/auto proxy    NO SURCHARGE  <-- contradicts the 5x blog claim
interact               2 cr/browser-min (no prompt); 7 cr/browser-min (WITH prompt)
agent (/v2/agent)      5 free daily runs then dynamic, "a few hundred credits" typical
monitor                1 credit/page/check
X/twitter.com scrape   1 credit + 29 Grok X Query credits = ~30 credits/request
No documented surcharge for screenshot or actions beyond base.

## Proxy geo gating
basic: 26 countries/regions. enhanced: NETHERLANDS AND US ONLY, falls back to nearest EU/US.
auto's failure-detection trigger (block page? CAPTCHA? non-200? timeout?) is NOT
enumerated anywhere — genuine spec gap.
The whole proxy param carries deprecation language in favor of just using auto.

## Licensing
Core AGPL-3.0; SDKs + some UI components MIT (dual license).

## 20 flagged unverified/conflicting items — see agent report. Key ones:
- No v2 OpenAPI JSON resolved (raw openapi.json is v1.0.0 with /deep-research at top level)
- changelog 404s on every variant — no dated history for v2 launch, maxAge, or surcharge removal
- attributes + query format inner fields never recovered
- PDF parsers per-page field: `pages` vs `pageMarkdown` unresolved
- branding/product/menu nested shapes single-sourced
- self-host vs cloud parity table is an un-OCR'able image in the README
