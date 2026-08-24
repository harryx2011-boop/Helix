# Competitive Landscape — Aug 2026 (agent 2)
[UNVERIFIED] = aggregator-sourced, not vendor page.

## Matrix (price | JS | anti-bot | self-host | BYO-LLM | BYO-proxy)
Firecrawl      Hobby $16/5k cr; Std $83/100k; ~$0.0008-0.003/pg | Y | cloud-only unlocker | AGPL core | N | N
Jina Reader    free ~20RPM; $0.02/1M output tok; 10M free tok/key | Y | weak, no unlocker | Apache-2.0 FULL | n/a | N
Jina DeepSearch same token pool | Y | - | partial | N | N
Exa.ai         $10 free; search $7/1k(<=10 res); DeepSearch $12/1k; Answer $5/1k; Contents $1/1k;
               +$1/1k per result past 10 | contents-fetch only | own index | N | N | N
Exa Websets    Starter $49/mo 8k cr; Pro $449/mo 100k cr | - | - | N | N | N
Tavily         free 1k cr/mo; $30/mo 4k cr ($0.008/cr); Growth $500/mo 100k ($0.005/cr)
               search 1-2cr; extract 1cr/5 URLs; map 1cr/10pg; research 4-250cr | Y | managed | N | N | N
Apify          free $5/mo; Starter $29 -> Business $999. CU $0.13-0.20; resi proxy $8/GB | Y | full network | Crawlee OSS only | per-actor | Y
Bright Data    Unlocker 5k free/mo; PAYG $1.5-3/1k; Scale $499/mo ~380k ($1.3/1k over);
               Scraping Browser $8->$5/GB | Y | LARGEST pool | N | N | proxies ARE product
Zyte API       $0.13/1k simple HTTP, 5 protection tiers scaling to headless | Y | auto-tiered escalation | N | N | N
Oxylabs        $49/mo entry, 7 tiers to $10k/mo; ~$9.40/GB Unblocker | Y | large network | N | N | limited
ScrapingBee    1k free cr; $49/$99/$249/$599. JS ~5x mult, premium/stealth ~10-25x mult | Y | stealth tier | N | N | N
ScraperAPI     $49/mo = 100k credits ~1cr/req; AUTO-UPGRADES on overage (Jan 2026) | Y | rotation+JS incl | N | N | N
Browserbase    Dev $20/mo, Startup $99/mo; browser-hr $0.12/$0.10; 1-MIN BILLING FLOOR | full Chromium |
               fingerprint/stealth | Stagehand SDK OSS only | **YES** | proxy GB add-on
Browserless    free 1k units; Starter $140/mo 180k units 40 conc; Scale $350/mo 500k 100 conc
               1 unit = 30s browser time | full | BYO/add-on | **OSS core, self-hostable** | Y | **Y**
Steel.dev      OSS free; cloud ~$29/mo [UNVERIFIED] | full | session/stealth | **FULLY OSS** | Y | Y
Hyperbrowser   from $10; ~100cr = 1 browser-hr ~$0.10/hr | full | stealth+proxy | N | Y | likely [UNVERIFIED]
Anchor Browser no public pricing, enterprise-led; sample ~$6 [UNVERIFIED] | full |
               AI-planned DETERMINISTIC replay | N | likely | [UNVERIFIED]
Crawlee/PW/PPTR free | Y full control | none built-in | **FULLY OSS** | Y | Y
Diffbot        free 5 calls/min; $299/mo; $899/mo. KG query 25-100cr vs 1cr/page extract | Y | own Crawlbot | N | N | N
Spider.cloud   flat bw+compute, no multipliers, ~$0.48/1k pages blended [UNVERIFIED vendor bench] | Y | built-in | OSS Rust core | N | [UNVERIFIED]
Olostep        free 500; Starter $9/mo 5k ($1.80/1k) -> Scale $399/mo 1M ($0.399/1k)
               BILLED ONLY ON SUCCESS; resi IP + JS on EVERY req; self-healing LLM parsers Std/Scale | Y | resi standard | N | N | N
Scrapfly       from ~$30/mo; credit multipliers 1x-30x+ | Y | ASP bypass layer | N | N | N
Crawlbase      from $29/mo | Y | proxy+crawler | N | N | N
SerpAPI        $25/mo 1k searches -> $275/mo 30k. $9.17-25/1k | n/a | SERP infra | N | n/a | N
Serper         prepaid from $50, to $0.30/1k. $0.30-1.00/1k  <-- 10-25x cheaper than SerpAPI
LlamaParse     10k free cr/mo; Fast ~$0.00125/pg; Agentic Plus ~$0.056/pg (45X SPREAD under one number)
Unstructured   15k free pg/mo; $0.03/pg flat PAYG | core lib Apache-2.0 OSS, platform not
Reducto        15k free cr; $0.015/pg; $0.012/pg batched (-20%)
Chunkr         [UNVERIFIED no pricing found] | partially OSS
Trafilatura    free | NO JS, static only | OSS
Readability    free | NO JS | Apache-2.0 OSS
Docling (IBM)  free | docs | MIT OSS | 88% F1 vs MarkItDown 82%, TableFormer tables, ~2min/100pg CPU
MarkItDown(MS) free | MIT OSS | ~12sec/100pg, 15+ formats vs Docling ~6, weak on complex tables
AgentQL        free tier; [UNVERIFIED pricing] | Y | uses your PW session | N | unclear
Kadoa          from ~$39/mo Flex consumption | Y | managed | N | [UNVERIFIED]
Reworkd        **DEAD — GitHub archived 2026-01-28**. Cause: infra costs + Apify/Browse.ai competition

## Per-vendor notes
- Firecrawl AI Extract is a SEPARATE subscription from $89/mo — easy to miss in cost estimates.
- Jina: URL-prefix trick r.jina.ai/<url> = zero SDK, zero auth. Lowest integration friction in market.
  ACQUIRED BY ELASTIC Oct 2025 — roadmap risk. Apache-2.0 self-host is real (not AGPL tease).
- Exa: Websets (search -> structured enrichable dataset) is unique, nothing else has it natively.
  Most complex pricing in category. Content extraction secondary — builders pair Exa search + Firecrawl scrape.
- Tavily: CLEANEST credit model (single currency across 5 ops). Research 4-250cr range unpredictable.
- Apify: RENTAL ACTOR MODEL BEING RETIRED — Apr 2026 stopped new rentals, Oct 2026 forced migration
  to pure pay-per-use. Disrupts marketplace-dev economics.
- Bright Data: Meta v Bright Data ended in SUMMARY JUDGMENT FOR BRIGHT DATA (no evidence of scraping
  non-public data), Meta dismissed remaining claim. Now cited industry-wide as pro-public-scraping precedent.
- Zyte 5-tier difficulty pricing transparent but unbudgetable without testing your real target list.
- Oxylabs bandwidth-billed favors large-page workloads, penalizes many-small-request.
- Browserbase/Stagehand = clearest BYOK-done-right. But 4-axis metering (browser-hrs + proxy GB +
  calls + tokens) + 1-min floor penalizes many-short-session workloads.
- Steel.dev = ONLY fully-OSS managed-cloud-browser product in the list.
- Anchor differentiator: agent plans flow once, then DETERMINISTIC REPLAY. $6M seed 2025.
- Diffbot: standing KG 10B+ entities, 1T+ facts, refreshed every 4-5 days. Nothing else has a
  persistent entity graph. But DQL steep learning curve, KG burns credits, $299 floor.
- Spider.cloud explicitly positions against Scrapfly credit-multiplier model.
- Olostep steepest volume discount found (4.5x spread), only-on-success billing, no premium-proxy upcharge tier.
- LlamaParse headline $/pg is misleading — always confirm mode.
- 2026 newcomers recurring in listicles: Crawl4AI (OSS, anti-credit-billing positioning),
  Scrape.do, ZenRows (anti-bot-first: CF/Akamai/DataDome/PerimeterX), ScrapeGraphAI.
- NO confirmed first-party general-purpose scrape API from OpenAI/Anthropic/Google found.
  Their browse/computer-use are bundled agent capabilities, not standalone competing products.
  BIGGEST PLATFORM RISK: a frontier lab shipping free/bundled browse reprices the whole category.

## BYOK has SPLIT into 3 distinct meanings
1. BYO-LLM-key: Browserbase/Stagehand (explicit design goal), Browserless, ~Hyperbrowser.
   NOT Firecrawl managed Extract, Exa, Tavily, Diffbot, Kadoa, AgentQL — they bundle an opaque
   model you cannot swap for cheaper/better. Unstructured OSS lib = partial exception.
2. BYO-proxy: Crawlee/PW/PPTR, Steel, Browserless trivially. Managed unlockers (BrightData,
   Oxylabs, Zyte, ScrapingBee, ScraperAPI) DO NOT — their pool IS the product, locked by design.
3. BYO-browser (point at your own CDP endpoint): Browserless + Crawlee/PW/PPTR native.
   Browserbase is the opposite — managed session IS the product.

## Truly self-hostable
Crawlee, Playwright, Puppeteer, Steel.dev, Jina Reader (Apache-2.0, stateless mode),
Browserless (OSS core), Trafilatura, Readability, Docling, MarkItDown, Unstructured core lib.
Firecrawl AGPL core BUT cloud-only unlocker/proxy/dashboard are the actual paid value.
NEVER self-hostable: Exa, Tavily, Apify platform, BrightData, Zyte, Oxylabs, ScrapingBee,
ScraperAPI, Diffbot, Spider platform, Olostep, Scrapfly, Crawlbase, SerpAPI, Serper,
LlamaParse, Reducto, Chunkr, AgentQL, Kadoa.

## THREE WHITE-SPACE GAPS (agent synthesis)
1. NOBODY combines true BYO-LLM-key with flat non-multiplied pricing. Stagehand gets BYOK right
   but inherits 4-axis metering. Everyone with simple pricing bundles an opaque model or has no AI step.
2. NOBODY bridges "web scrape" and "document parse" under one API + one pricing model. RAG builders
   over web+PDF must integrate two vendors with two pricing philosophies.
3. PRICING TRANSPARENCY IS ITSELF THE WEDGE. Tavily single-currency + Spider flat-rate are explicit
   reactions to Exa/Scrapfly complexity. Serper beat SerpAPI 10-25x on a simpler model. Proven pattern.
