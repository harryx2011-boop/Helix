# Helix — Architecture

**Status:** design, pre-implementation · **Date:** 23 August 2026

An open-source, self-hostable web-data API. Bring your own LLM keys, your own proxies, your own storage. Helix is the machine; you buy the fuel.

Companion documents: [RESEARCH.md](RESEARCH.md) for the evidence base, [openapi.yaml](openapi.yaml) for the wire contract.

---

## 1. Principles

These come directly out of the research, and each one names a specific failure in the incumbent.

1. **Never report a block page as success.** A Cloudflare interstitial returning HTTP 200 is a failure with a typed reason, never markdown handed back as if it were content. *(Firecrawl #2413 bills for these.)*
2. **Fail open, loudly.** If a rate-limiter or cache backend is unreachable, serve the request and log a warning. Infrastructure hiccups must never become client-visible 429s. *(Firecrawl #3728 fails closed and 429s all traffic.)*
3. **Fingerprint coherence over fingerprint cleverness.** TLS, HTTP/2, CDP and JS layers must describe one consistent device. A single contradictory field defeats every other precaution.
4. **BYOK is structural, not a feature flag.** Helix never bundles a model, a proxy pool or a vector store. Credentials belong to the operator, and the LLM call is billed to them by their provider.
5. **The self-host build is the whole product.** No capability is withheld for a hosted tier. The gap between OSS and cloud is the single most-cited complaint about Firecrawl.
6. **`docker compose up` works the first time.** Health-gated startup ordering, no boot races, modest idle footprint. *(Firecrawl #2583 races on RabbitMQ; #948 has 21 comments about the image not building.)*
7. **Spec first.** The OpenAPI document is the source of truth; clients are generated from it. *(Firecrawl's #373, #357 and #4252 are all schema-drift bugs.)*
8. **Estimate before executing.** Any operation whose cost scales with discovered pages can be dry-run first.

---

## 2. Shape

Three runtimes, each chosen because it is genuinely the best tool for its layer, behind one HTTP surface.

```
                    ┌─────────────────────────────────┐
   client ───────►  │  helix-api        TypeScript    │
   MCP    ───────►  │  routes · auth · orchestration  │
                    │  job scheduler · browser pool   │
                    └───┬──────────┬──────────────┬───┘
                        │          │              │
              internal HTTP   internal HTTP   Postgres
                        │          │              │
            ┌───────────▼──┐  ┌────▼─────────┐  ┌─▼──────────────┐
            │ helix-fetch  │  │ helix-extract│  │ jobs · results │
            │    Rust      │  │   Python     │  │ keys · monitors│
            │              │  │              │  │ pgvector       │
            │ TLS identity │  │ trafilatura  │  └────────────────┘
            │ HTTP/2 finger│  │ pdf-inspector│
            │ proxy egress │  │ chunk · embed│
            └──────────────┘  └──────────────┘
```

**Why three.** TypeScript owns orchestration because Playwright and the job/HTTP layer live there most comfortably. Python owns extraction because trafilatura, Docling and the embedding stack have no real equivalent elsewhere. Rust owns the fetch tier because TLS and HTTP/2 fingerprint control needs a client that exposes the handshake, and because it is the one layer where per-request overhead is on the hot path for every single page.

**The cost.** Three toolchains to build, ship and debug. Mitigated by: one monorepo, one compose file, one `make dev`, and a hard rule that cross-service contracts are typed and generated rather than hand-written.

### Services

| Service | Runtime | Owns |
|---|---|---|
| `helix-api` | TypeScript / Node | HTTP + MCP surface, auth, job scheduling, crawl frontier, browser pool, escalation policy, response assembly |
| `helix-fetch` | Rust | Plain and TLS-impersonating fetch, profile application, proxy egress, block-page signal capture |
| `helix-extract` | Python / FastAPI | HTML→markdown, PDF and Office parsing, LLM structured extraction, chunking, embedding |
| `postgres` | Postgres 16 + pgvector | Jobs, results, API keys, monitors, crawl state, vectors |

Browsers (Chromium via Playwright, and Lightpanda) run as an in-process pool inside `helix-api`.

---

## 3. The fetch ladder

Four tiers, cheapest first. Each escalation is a decision made on evidence, never on a guess about the framework a site uses.

```
  tier 0  plain HTTP            ~5ms    no JS, no TLS mimicry
  tier 1  TLS-impersonating     ~50ms   coherent JA4 + HTTP/2 settings
  tier 2  Lightpanda            ~25ms   JS execution, no layout/canvas
  tier 3  Chromium              ~2-5s   full render, screenshots, actions
```

Tiers 0 and 1 live in `helix-fetch`; tiers 2 and 3 in the `helix-api` browser pool.

### Escalation triggers

Escalate when, and only when, there is a signal:

- Response is a **block page** (see §4) → retry at a higher tier, or with a different profile or proxy.
- **Content is absent from raw HTML** — an empty root container, no article text, a body that is mostly script tags. This is a content-presence test, not a framework test: Next.js and Nuxt frequently server-render real content, and escalating on framework name alone burns the expensive tier for nothing.
- The request **needs a capability** the tier lacks: screenshots, actions, canvas, or `waitFor`.
- Explicit `tier` override in the request.

Tier 2 is skipped when the request needs a screenshot, canvas, or real visual layout — Lightpanda has no layout engine.

### Profiles

A profile is one coherent identity, applied as a unit. Never assembled piecemeal.

```jsonc
{
  "id": "chrome-149-macos",
  "tls":     { "ja4": "...", "cipherSuites": [...], "extensions": [...], "alpn": ["h2","http/1.1"] },
  "http2":   { "headerTableSize": 65536, "windowSize": 6291456, "pseudoHeaderOrder": [...] },
  "headers": { "userAgent": "...", "acceptLanguage": "...", "order": [...] },
  "js":      { "canvasSeed": "per-session-stable", "webglVendor": "...", "fonts": [...],
               "hardwareConcurrency": 8, "timezone": "Europe/London" }
}
```

Two rules that matter more than the contents:

**Coherence is validated, not assumed.** A profile whose JA4 claims Chrome 149 while its HTTP/2 `headerTableSize` carries a Python default is a contradiction detectable before the response body is read. Profiles are checked at load time and the check is a test.

**Canvas noise is stable per session.** Real browsers produce the same canvas hash on every read. Tools that randomise per-read are detectable precisely because they vary. Seed once per session, then hold.

Profiles are produced by **capture-and-replay**: a capture harness records a real browser's handshake and JS surface, and emits a profile definition. That keeps profiles honest as browsers ship new versions, and makes staleness a mechanical problem rather than a research one.

### Proxies

Bring your own. Helix owns retry, failover, block detection and per-host throttling; the provider owns rotation, geography and pool health. Configured globally, per-domain, or per-request.

The managed path — if there is ever a hosted Helix — is the same code path with operator-supplied credentials. Not a fork.

---

## 4. Block detection

A block page is a failure. Getting this right is a headline differentiator, and it is a classifier rather than a status-code check, because Cloudflare interstitials routinely return 200.

Signals, combined:

| Signal | Example |
|---|---|
| Status | 403, 429, 503 |
| Known interstitial fingerprints | Cloudflare `cf-mitigated`, ray IDs, DataDome, PerimeterX, Akamai |
| Challenge markers | JS challenge scripts, meta-refresh loops, CAPTCHA widgets |
| Content shape | body under a threshold, boilerplate-only, no extractable main content |
| Expectation mismatch | `expect` hints in the request that did not appear |

Outcome is a typed `FetchFailure` with a `reason` (`blocked` · `challenge` · `timeout` · `dns` · `tls` · `http_error` · `empty`), the tier and profile used, and whether escalation remains available. Never a 200 with a block page in the body.

---

## 5. Extraction

`helix-extract` is a stateless FastAPI service. Everything below is one HTTP hop from the core.

**HTML → markdown.** trafilatura by default — the strongest F1 across independent benchmarks. Readability is available as an alternative for recall-sensitive work, since it over-includes where trafilatura is precise. The engine is pluggable and selectable per request or per domain.

**PDF.** `@firecrawl/pdf-inspector` first: a Rust classifier that distinguishes scanned from text PDFs and flags `needsOcr` and `suspected_garbled_text`. Text-layer PDFs go to pypdfium2 (Apache/BSD — chosen over the faster PyMuPDF, whose AGPL licence would contaminate a permissively-licensed project). Scanned or garbled documents route to Marker. Table-critical work routes to Docling, which leads on table fidelity. Different tools genuinely win different sub-tasks, so the pipeline routes rather than picks a winner.

**Office.** python-docx, python-pptx, openpyxl behind the same `convert() → markdown` interface. Notably more reliable than scanned PDFs.

**Documents share the API with web pages.** `/scrape` on a PDF URL returns the same envelope as `/scrape` on an HTML page. This is white-space gap #2 from the research — no competitor bridges live web and document parsing under one API and one pricing model.

### Structured extraction

One internal schema representation, compiled to each provider's native mechanism:

| Provider | Mechanism |
|---|---|
| OpenAI | `json_schema` response format, `strict: true` |
| Anthropic | forced tool-use, `tool_choice` — *incompatible with extended thinking* |
| Gemini | `responseSchema` |
| OpenRouter, Ollama, vLLM, LM Studio | OpenAI-compatible path |

Two lessons from the research are baked in. **Retrieval-then-extract**: relevance-score and trim page content before it reaches the model rather than dumping whole pages. **Schema enforcement solves shape, not truth**: constrained decoding guarantees a JSON shape and guarantees nothing about accuracy, so `minItems`/`maxItems` are rejected at validation time with an explanatory error — they induce hallucinated entries to satisfy the constraint. Schemas beyond ~30 fields emit a warning suggesting a split.

### Chunking and embedding

Semantic chunking with stable anchors, so a citation can deep-link to the passage that produced it and survive a re-crawl. Embeddings default to a local sentence-transformers model so the feature works with no keys and no cost; BYOK swaps in OpenAI, Voyage or Cohere.

Sinks: Qdrant and pgvector in v0.1, behind an adapter interface. Content-hash dedup with deterministic UUID v5 point IDs derived from the URL means a re-crawl updates in place instead of duplicating vectors — the mechanism from Firecrawl's unmerged community PR #3396, shipped as a first-class, vector-store-agnostic feature.

---

## 6. Jobs and crawling

Postgres backs the queue. One datastore for jobs, results, keys, monitors and vectors — no Redis, no RabbitMQ, no boot race. Slower per operation than Redis and entirely fast enough for this workload, and it buys an enormously simpler self-host story.

**Frontier.** BFS with per-host partitioning. In-memory Bloom filter per job for URL dedup — a billion URLs at 0.1% false-positive costs roughly 1.8GB against 40GB for an exact set. Frontier state persists to Postgres so a restart resumes rather than restarts.

**Politeness is adaptive.** Start at a reasonable per-host concurrency, ramp while latency and error rates stay flat, back off hard on 429s, `Retry-After` or latency spikes. AIMD, essentially. Fast on hosts that tolerate it, self-correcting on hosts that do not — without an artificial global slowdown, and without hammering anyone into blocking the user.

**robots.txt is respected by default.** RFC 9309 semantics: longest-match wins, case-insensitive agent matching, 500 KiB parse limit, 24-hour cache. `Crawl-delay` is honoured despite being absent from the RFC. Override exists, requires an explicit flag, and is logged.

**Idempotency.** Key is `hash(normalised URL + render params + profile + proxy geo + schema version)`. The queue is honestly at-least-once, so side effects are idempotent: results upsert, webhook dispatch dedupes on `(job_id, event_type, url)`.

**Webhooks** follow Stripe's model rather than Firecrawl's: HMAC-SHA256 over `{timestamp}.{body}`, constant-time comparison, five-minute tolerance, dual-active secrets during rotation, exponential backoff over days rather than minutes, explicit no-ordering guarantee, and a dead-letter queue with manual replay. Firecrawl offers three retries over 21 minutes and no signing at all; clearing that bar costs almost nothing.

---

## 7. Monitors

Scheduled re-crawls with change detection. Firecrawl shipped a comparable product recently, so Helix competes on depth and cost rather than novelty.

Scheduling is cron plus natural language. Change detection is content-hash first — the cheap path that also drives incremental crawl and billing-relevant "did anything change" decisions. Diffs are produced at word, line and character granularity and delivered **inline in the webhook payload**, so a consumer never needs a second round trip to learn what changed.

Two deliberately cheap features the incumbent lacks: **keyword triggers** that fire only when a string appears or disappears, avoiding an LLM call entirely for the common case; and **scheduling windows** by timezone, weekday and business hours, which cuts both cost and the noise from overnight A/B flicker.

**Only changed pages count.** Unchanged pages on a scheduled re-crawl are free — a `lastmod`-aware, hash-checked incremental crawl rather than a full re-fetch.

---

## 8. Enrichment

`/enrich` takes a sparse identifier — an email, a domain, a company name — and returns structured columns with confidence scores and citations.

The pipeline is search → filter → scrape → extract → score, with fields routed to specialised extractors that run in phases so later phases can build on facts the earlier ones established. Every value carries a confidence, a source URL, **and the passage that grounded it** — a citation you can check, not merely a link.

fire-enrich's guardrails are a free list of the real failure modes, and all of them are adopted: reject parked domains and placeholder pages, blocklist social profiles that mostly yield noise, require a minimum of genuine content, validate URLs the model claims exist before trusting them, dedupe by URL, and trim to a token budget with a per-source floor.

Two honest limits, stated rather than hidden. Confidence is model-reported and therefore soft until calibrated against a labelled set. And "no good data exists" is a first-class outcome — `null` with a reason beats a plausible fabrication, which is the failure mode that makes enrichment products untrustworthy.

---

## 9. Auth and credentials

Two distinct credential concepts, deliberately never conflated:

**Helix API keys** authenticate the caller. Stored hashed in Postgres, multiple keys per account, named per project, individually revocable, with per-key rate limits and usage counters.

**Provider credentials** — LLM, embedding, proxy, vector store — belong to the operator and are configured through environment variables. Helix calls the user's models with the user's keys, and the user is billed by their provider directly. Helix never proxies a model call through its own account and takes no margin on inference.

That separation is the whole BYOK thesis in one design decision. It also means Helix has no incentive to be vague about retries or failures, because it does not profit from them.

Rate limiting is per-key, token bucket, and **fails open**: if the backing store is unavailable the request proceeds and a warning is logged. Every response carries `X-RateLimit-Limit`, `-Remaining` and `-Reset` so an autonomous client can self-throttle without parsing error strings — a thing Firecrawl's own users asked for in #3150 and did not get.

---

## 10. Cost estimation

Any operation whose cost scales with discovered pages accepts `estimate: true` and returns projected work instead of doing it: page count, tier distribution, wall-clock estimate, token estimate at the configured model, and provider cost in real currency.

For a BYOK tool, resources are the honest unit — "about 340 pages, roughly 12 minutes, approximately $0.80 of OpenAI tokens at your configured model" tells an operator what they actually need to know. Credits would be a fiction here, since Helix does not sell inference.

---

## 11. Repository layout

```
helix/
├─ apps/
│  ├─ api/            TypeScript — HTTP + MCP, orchestration, browser pool
│  ├─ fetch/          Rust — TLS-impersonating fetch, profiles, proxy egress
│  └─ extract/        Python — extraction, parsing, LLM, chunking, embedding
├─ packages/
│  ├─ schema/         OpenAPI spec + generated types for all three runtimes
│  ├─ profiles/       Captured browser identity definitions + validator
│  └─ sdk-ts/         Generated TypeScript client
├─ tools/
│  ├─ capture/        Browser fingerprint capture harness
│  └─ antibot-suite/  Local detection tests (CreepJS, Sannysoft, browserleaks)
├─ docker-compose.yml
├─ ARCHITECTURE.md
├─ RESEARCH.md
└─ openapi.yaml
```

Monorepo, pnpm workspaces for the TS side, each non-TS service self-contained with its own toolchain. One clone, one compose file, atomic cross-language changes.

---

## 12. Build order

v0.1 is large — six endpoint families, three runtimes, a stealth layer and monitors. These milestones are sequenced by real dependency, so the tail can be cut without stranding half-built work.

| # | Milestone | Contains |
|---|---|---|
| **M0** | Skeleton | Monorepo, compose, CI, OpenAPI spec, generated types, health checks |
| **M1** | Fetch and extract | Tiers 0–1, profile model and validator, block classifier, trafilatura, `/scrape` |
| **M2** | Browser tiers | Playwright pool, Lightpanda, escalation policy, actions, screenshots |
| **M3** | Documents | pdf-inspector routing, pypdfium2, Marker, Docling, Office formats |
| **M4** | Crawl | Frontier, Bloom dedup, adaptive politeness, robots, sitemap, `/map`, `/crawl`, estimator |
| **M5** | LLM | Provider adapters, schema compilation, retrieval-then-extract, `/search` |
| **M6** | Vectors | Chunking, anchors, local embeddings, Qdrant and pgvector sinks |
| **M7** | Monitors | Scheduler, hashing, diffs, keyword triggers, webhooks with signing |
| **M8** | Enrich | Field routing, phased extractors, confidence, citations, guardrails |
| **M9** | Surface | MCP server, SDK generation, docs, self-host polish |

M1 is the walking skeleton that proves the three-runtime shape. Everything after it is additive.

---

## 13. Known risks

**Stealth is validated only locally.** CreepJS, Sannysoft and browserleaks detect fingerprint incoherence; they do not tell you whether Cloudflare or DataDome would let you through. The local suite will find real bugs and cannot confirm the ladder works in production. Revisit once there is something worth testing against a live target.

**Three runtimes is real overhead.** Justified per layer, but it triples toolchain surface and CI time. If the Rust tier proves marginal against curl_cffi in Python, collapsing it is a legitimate simplification rather than a defeat.

**Anti-bot is an arms race with no finish line.** Firecrawl closed its fingerprinting issue as "not planned" because this is genuinely hard and genuinely endless. BYO-proxy and BYO-browser reduce exposure by making Helix not the only party in the fight.

**Enrichment is a quarter-plus of work.** The search-then-extract loop is straightforward; confidence calibration, source-quality filtering and graceful "no data" handling are not. It is correctly the last milestone.

**A frontier lab shipping free bundled browsing would reprice the category.** No standalone competing API exists today. Nothing to do about it except stay cheap to run and easy to self-host, which is the strategy regardless.
