# Monitoring/Deltas + Data Layer (agent 6)

## CRITICAL FRAMING: monitoring is NOT greenfield
Firecrawl SHIPPED a substantial Monitor product ~May 26 2026, expanded to web-scale search
monitoring ~Jul 1 2026. 25+ merged PRs: #3203 (scheduled scrapes + Claude Q&A), #3624
(meaningfulChange judgments), #3642 (am/pm schedules), #3657 (pricing), #3766 (search monitor),
#3897 (web monitor emails), #3963 (Slack alerts), #4345 (stop billing unchanged pages).
Covers: cron + NL scheduling (min interval 5 min), markdown/JSON/mixed diff modes, per-field JSON
diffs, AI "judge" for meaningful-change filtering, webhooks (monitor.page, monitor.check.completed),
email/Slack, web-scale search monitors, 1-50 targets/monitor, up to 365-day retention.
=> Differentiate on DEPTH AND COST, not on "build monitoring at all".

## Monitoring gaps worth attacking
1. Structured diff payload w/ word/line/char granularity INLINE in the webhook (no second fetch).
   changedetection.io: "Easily see what changed, examine by word, line, or individual character".
   Firecrawl ships "diffs" but granularity undocumented. Difficulty: MEDIUM (Myers diff is known;
   low-noise HTML->markdown-normalized diffing is the hard part).
2. VISUAL/SCREENSHOT DIFF on change. changedetection.io ships "send a screenshot with the
   notification"; their own open requests #330 (26 up) "store full JPEG/PNG screenshot + show
   diff/history" and #1737 (11 up) "save screenshot snapshot" show even the reference tool's users
   want more. Visualping is screenshot-first. Difficulty: MEDIUM (capture easy; pixel-diff overlay
   with noise suppression for ads/timestamps is the hard part).
3. Restock/price monitors with THRESHOLD triggers. changedetection.io has re-stock & price detection
   with upper/lower thresholds; open #2707 (26 up) "populate restock & price column with xpath
   filtered result"; closed #2630 (20 up) "give a graph of price and instock status" = sustained
   demand post-ship. Difficulty: LOW-MEDIUM (preset on top of existing JSON field diffing).
4. Business-hours / day-of-week / timezone scheduling windows. changedetection.io: "schedule in any
   timezone", "limit by day of week and time", "quick shortcuts for business hours and weekend-only".
   Long-open #164 (15 up) cron-like rules. Cuts cost AND A/B-flicker noise. Difficulty: LOW.
5. Historical change archive / version-history scrubber. changedetection.io #541 "archive" (12 up,
   open) + #3291 "automatic backup generation" (12 up, open) — years-old, still open on the reference
   product. Firecrawl's 30-365d retention is raw retention, not a browsable history feature.
   Difficulty: MEDIUM (storage cheap; UI + GC policy is the work).
6. **SITEMAP lastmod / RSS-DRIVEN INCREMENTAL CRAWL — CONFIRMED GAP.**
   Only re-fetch URLs whose sitemap <lastmod> is newer than last checkpoint. Firecrawl's sitemap
   work (#4049, #4056) is about redirect/discovery CORRECTNESS, not incremental scheduling.
   NOTHING in their docs/changelog/tracker mentions lastmod-based selective crawling.
   Difficulty: MEDIUM (parsing trivial; per-domain crawl-state store + fallback when sitemaps lack
   or lie about lastmod — very common in the wild — is the real work).
7. Differential billing (only charge for CHANGED pages). Firecrawl PR #4345 is BUILDING THIS NOW.
   => catch-up, not differentiator. Difficulty: MEDIUM.
8. Unified notification adapter (Apprise-style) vs bespoke per-channel. changedetection.io gets
   Discord/Email/Slack/Telegram/Webhook/O365/Teams/Rocket.Chat/Gitter/Flock/Google Chat + Jinja2
   templating essentially free via Apprise. Firecrawl hand-built email (#3897) and Slack (#3963)
   separately. Difficulty: LOW (Apprise is OSS and embeddable).
9. Cheap keyword/conditional triggers independent of diffing — fire only when a string appears or
   disappears ("out of stock", competitor name), ignoring unrelated churn. changedetection.io has
   "conditional triggers based on price or keyword presence". Firecrawl's AI judge is the EXPENSIVE
   LLM analog. A non-LLM version is a cost differentiator. Difficulty: LOW.

## DATA LAYER — GENUINELY OPEN
1. **NATIVE SQL-QUERYABLE OUTPUT.** Apify Dataset is tabular ("each object forms a row, attributes
   are columns") but their own docs confirm NO SQL — retrieval is "programmatic filtering through API
   parameters rather than declarative query languages". Confirmed gap at the best-in-class reference.
   No scraping vendor offers this. Difficulty: HIGH (real OLAP store per org; schema inference across
   heterogeneous pages is itself hard).
2. Direct S3/Parquet/BigQuery sinks. Apify exports JSON/CSV/XML/RSS/Excel/HTML — NO Parquet, NO
   native S3/BigQuery sink. No Firecrawl issue found requesting it (searched parquet, bigquery,
   s3 export — all unrelated hits) => plausible but UNCITED as explicit demand, though Fivetran/
   Airbyte exist precisely because this gap is generic. Difficulty: MEDIUM.
3. Content-level dedup. #563 verbatim user quote: "When I crawl websites with firecrawl I'll
   sometimes get essentially the same links eg https://site.com/, https://www.site.com/... when in
   reality they're all the same page. It would be good to dedup these."
   URL-level dedup IS NOW SHIPPED (#878 similar-URL dedup, #3009 strip userinfo, #3044 filter
   malformed mailto/basic-auth, #3134 strip credentials). CONTENT-LEVEL dedup (same content,
   different URL) is NOT anywhere in the tracker. Difficulty: LOW (URL, already solved) /
   MEDIUM (content — simhash/minhash over normalized text at crawl scale).
4. **VECTOR-STORE-BACKED INCREMENTAL RE-CRAWL.** Firecrawl PR #3396 (OPEN, community-contributed)
   "add Qdrant-backed deduplication for crawl jobs". Verbatim: "pages whose SHA-256 content hash is
   unchanged since the last crawl are skipped entirely, making incremental re-crawls of the same site
   dramatically cheaper... Deterministic point IDs derived from URL (UUID v5) so re-crawls update
   in-place rather than creating duplicate vectors."
   A USER BUILT THIS BECAUSE FIRECRAWL DOESN'T OFFER IT. Vendor-specific (Qdrant only), SDK bolt-on,
   not core. Making it vector-DB-agnostic + first-class IS the differentiator. Difficulty: LOW-MEDIUM.
5. **KNOWLEDGE-GRAPH SCRAPE FORMAT.** Firecrawl PR #3684 (OPEN, RFC/proposal, UNDECIDED)
   "add knowledgeGraph scrape format". Verbatim: "Knowledge-graph extraction is the inverse [of
   extract]: the caller wants to discover what entities and relationships are on the page WITHOUT
   pre-specifying their shape." Proposed across scrape/search/crawl with a merged deduped graph at
   top level. UNMERGED = ship-first opportunity.
   Diffbot is the best-in-class reference: 10B+ entities, real entity resolution — "A single entity is
   generally a fusion of data from several different websites... Apple's entity record draws from 560
   different origin sources." DQL + "Enhance" API for enriching by identifier.
   Difficulty: page-scoped LLM version = MEDIUM (matches the RFC). Diffbot-style cross-source fusion
   = HIGH, multi-year (NLP entity linking, canonical IDs, relationship confidence). Do the first,
   treat the second as a separate bet.
6. Columnar index over your OWN crawl corpus ("all pages from domain X in last 30d that returned 200").
   Common Crawl's WARC (raw) / WAT (computed metadata JSON: headers, links, relationships) / WET
   (plaintext) separation confirms the value of metadata-separated formats at scale. No vendor offers
   this per-customer. Difficulty: MEDIUM-HIGH, scopes down a lot if built on the S3/Parquet export.

## Cross-cutting takeaway
Monitoring: crowded, incumbent shipped in the last 3 months. Compete on depth + cost.
Data layer: WIDE OPEN. Two unmerged Firecrawl proposals (#3396 vector dedup, #3684 knowledge graph)
and confirmed gaps at Apify (no SQL, no Parquet/S3/BigQuery) are shippable as first-class core
features before the incumbent formalizes them.
