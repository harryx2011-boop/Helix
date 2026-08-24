# Milestones

v0.1 is large: six endpoint families, three runtimes, a stealth layer and monitors. These are sequenced by real dependency, so the tail can be cut without stranding half-built work.

Legend: ☐ not started · ◐ in progress · ☑ done

---

## M0 — Skeleton ☑

The shape of the thing, with nothing working yet.

- ☑ Monorepo layout, pnpm workspace
- ☑ `docker compose` with health-gated startup (no boot race)
- ☑ Postgres schema: keys, jobs, tasks, documents, failures, crawl state, monitors, webhooks, chunks
- ☑ OpenAPI spec covering every v0.1 endpoint
- ☑ CI: typecheck, clippy, ruff, spec lint, and a compose boot test
- ☑ Block-detection classifier + tests
- ☑ Fail-open rate limiter + tests
- ☑ Escalation policy (content-presence, not framework detection)
- ☑ Postgres pool, checksummed migrations runner, real health probe
- ☑ API keys: generation, SHA-256 hashing, lookup, revocation, per-key limits
- ☐ Codegen wired for all three runtimes (deferred — hand-written types for now)

## M1 — Fetch and extract ☑

The walking skeleton. Proves the three-runtime shape end to end.

- ☑ Profile model + coherence validator + resolver (7 Rust tests)
- ☑ `FetchClient` and `ExtractClient` with typed contracts and health probes
- ☑ Scrape pipeline: ladder walk, block classification, typed failures (9 tests)
- ☑ `POST /scrape` with format selection and fabrication-keyword rejection
- ☑ `/scrape` contract aligned with the spec: `jsonOptions` alias with per-request
      `provider`/`model`, `json` wired to helix-extract with `usage` reported,
      `proxy` as `auto|stealth|none` or an object, `mobile`, sanitised `html`,
      `chunks`, `warnings` on every response (28 route and sanitiser tests)
- ☑ `helix-fetch` transport: wreq client, 13 browser identities, proxy support,
      per-request clients so a pooled connection cannot leak the prior identity
- ☑ `helix-extract`: trafilatura + readability, `auto` routing, selector support,
      absolute link resolution, whitespace-stable content hashing (16 tests)
- ☐ Real captured profiles from `tools/capture` (the sample is a placeholder)

## M2 — Browser tiers ☑

- ☑ Playwright pool: one process, many contexts, drain-then-recycle after N pages
- ☑ Lightpanda as tier 2 over CDP, skipped when visual layout is needed
- ☑ Escalation wired to the live ladder, capability-aware
- ☑ Actions (click, write, press, scroll, wait, screenshot, executeJavascript, scrape)
- ☑ Screenshots, full-page and viewport

## M3 — Documents ☑

The unclaimed structural gap: web pages and documents under one API.

- ☑ PDF classification before parsing, routing on `needsOcr` / `suspectedGarbledText`
- ☑ Mojibake detection by Unicode category — catches broken CMaps and subsetted
      fonts without false-positiving on CJK, Arabic or emoji
- ☑ pypdfium2 for clean text layers (Apache/BSD — PyMuPDF's AGPL is disqualifying here)
- ☑ Marker routing for scanned and garbled documents (optional `documents` extra)
- ☑ Docling routing when table fidelity matters (optional `documents` extra)
- ☑ DOCX, PPTX, XLSX with heading and table preservation
- ☑ Page markers in output so a citation stays locatable
- ☑ 19 tests against real generated PDFs
- ☑ `POST /v1/parse`: multipart `file` or `url`, `ocr: auto|force|off`, `formats: markdown|json`
      with `jsonOptions` (schema or prompt) resolved by the operator's model
- ☑ Gateway upload ceiling (`HELIX_PARSE_MAX_UPLOAD_MB`) enforced before a byte reaches Python; HTTP 413
- ☑ File-type classification by signature, then declared type, then extension; HTML answers `unsupported_type`
- ☑ Parsed-output cache keyed by content hash plus the options that change the output
- ☑ 34 route and classifier tests
- ☐ Image OCR (`png`, `jpg`): accepted at the gateway, the Python service answers `unsupported_type` until an OCR path lands
- ☐ Separate OCR queue so long scans do not hold text-layer parses

Implemented the classification directly rather than depending on
`@firecrawl/pdf-inspector`: the routing decision is four rules over pypdfium2
output, and a native binary with per-platform builds is a heavy dependency for
that. The behaviour it provides — `needsOcr` and `suspected_garbled_text` — is
what `assess_pdf` returns.

## M4 — Crawl ☑

- ☑ URL normalisation: tracking params, `www`, trailing slash, fragments, param order
- ☑ Frontier: BFS, per-host partitioning, scope and depth filtering, rejection accounting
- ☑ Bloom dedup above 50k URLs, exact set below — verified at 100k URLs with
      zero false positives and zero false negatives
- ☑ Adaptive politeness (AIMD: ramp while healthy, halve on 5xx and latency
      spikes, floor and back off on 429 with `Retry-After`)
- ☑ robots.txt (RFC 9309, 24h cache, 500 KiB parse, `Crawl-delay` honoured)
- ☑ Sitemap discovery incl. recursive `<sitemapindex>`, cycle-safe, depth-capped
- ☑ `POST /map`
- ☑ `POST /crawl` + worker draining the Postgres queue via `FOR UPDATE SKIP LOCKED`
- ☑ `GET /jobs/:id`, `DELETE /jobs/:id`, `GET /jobs/:id/errors`
- ☑ Cost estimator via `estimate: true`, reporting assumptions rather than false precision
- ☑ Incremental mode: conditional requests (ETag / If-Modified-Since) plus
      content-hash comparison; unchanged pages counted, not re-written
- ☑ Frontier persistence: Postgres-backed queue with batched writes, claim
      batching, resume-on-restart, and claim release on shutdown or cancellation
- ☑ `GET`/`DELETE /crawl/:id` serve the job view under the spec's path; the
      202 carries `jobId` and a `/v1/crawl/{jobId}` poll URL
- ☑ `includePaths`/`excludePaths` accept globs (`/blog/*`); regex still honoured;
      an unparseable pattern is a 400, not a silent match-nothing
- ☑ Spec aliases: `webhook` as a bare URL, `allowExternalLinks`, nested `scrapeOptions`
- ☑ Operator caps: `HELIX_CRAWL_DEFAULT_LIMIT`, `HELIX_CRAWL_MAX_LIMIT`,
      `HELIX_CRAWL_MAX_DEPTH`; a request above the cap is rejected, not clamped
- ☑ Webhooks: `started`/`page`/`completed`/`failed` events queued per job with
      dedupe keys, delivered by an in-process dispatcher with exponential backoff
      (1 min doubling, 6 h cap, ~3 days at 20 attempts), HMAC-SHA256 signature
      when `HELIX_WEBHOOK_SECRET` is set, dead letters kept in `webhook_deliveries`
- ☐ Dead-letter replay endpoint (rows are kept; nothing re-queues them yet)
- ☐ Job results in `data[]` carry `text`/`links`, not the full `Document` (no html/screenshot per page)

## M5 — LLM ☑

- ☑ Provider adapters: OpenAI, Anthropic (forced tool use), Gemini (`responseSchema`)
      native; one OpenAI-compatible path covering Ollama, vLLM, OpenRouter, LM Studio
- ☑ One internal schema representation compiled per provider, including strict-mode
      rewriting (optional fields become nullable) and Gemini keyword filtering
- ☑ Reject `minItems`/`maxItems`/`minProperties`/`maxProperties` with an
      explanatory error, plus a warning past ~30 fields
- ☑ Retrieval-then-extract: block splitting with headings attached, lexical
      relevance scoring, budget trimming that preserves document order
- ☑ `blocks_kept` / `blocks_total` reported, so a missing field can be told
      apart from a trimmed-away one
- ☑ `POST /search` with Serper (default) and SerpAPI adapters, domain operators,
      freshness windows, category shorthands, and search-then-scrape in one call
- ☑ One failed result does not fail the search — failures travel per-row
- ☑ `/search` contract aligned with the spec: `scrapeOptions` (`scrape` kept as
      an alias), `lang`, `country`, `tbs`, `limit` default 5 with an operator
      ceiling, `data.web[]` with `url`/`title`/`description`, a `warnings` array,
      and `metadata.backend`
- ☑ SearXNG adapter as the zero-key backend; `HELIX_SEARCH_PROVIDER=auto` picks
      SearXNG, then Serper, then SerpAPI, whichever has credentials
- ☑ Bounded per-call scrape concurrency and a short-TTL cache on identical queries
- ☑ Route tests over Fastify inject (20) plus backend and cache tests
- ☐ Prompt caching where the provider supports it
- ☐ Live provider calls unverified — no API keys available in this environment

## M6 — Vectors ◐

- ☑ Semantic chunking: heading-aware sections, sentence-boundary splitting,
      configurable overlap, and `heading`/`fixed`/`semantic` strategies
- ☑ Stable anchors — hashed from a 64-character opening plus heading path, so
      editing a paragraph does not invalidate citations into its section
- ☑ Local embeddings by default (no key, no cost); OpenAI and Voyage optional
- ☑ Qdrant sink with collection auto-creation
- ☑ pgvector sink reporting inserts and updates separately
- ☑ Deterministic UUID v5 IDs from URL + anchor, so a re-crawl updates in place
      rather than appending a second copy of every chunk
- ☐ `destination` wired into the crawl worker — sinks exist but nothing calls them
- ☐ Live embedding run unverified: the local model was not downloaded here

## M7 — Monitors ☐

- ☐ Scheduler: cron, intervals, timezone and business-hours windows
- ☐ Content hashing, unchanged pages free
- ☐ Diffs at word, line and character granularity, delivered inline
- ☐ Keyword triggers (no model call)
- ☐ Webhooks: HMAC signing, backoff over days, dead letter with replay

## M8 — Enrich ☐

Last, because the hard part is not the loop — it is calibration and knowing when to say nothing.

- ☐ Field routing across phased extractors
- ☐ Confidence scoring, with honest limits stated
- ☐ Citations carrying the grounding passage, not just a URL
- ☐ Guardrails: parked domains, placeholder pages, social blocklist, content floor, URL validation
- ☐ `null` with a reason when no good data exists

## M9 — Surface ◐

- ☑ MCP server at `/mcp` (streamable HTTP, bearer key), tools generated from `openapi.yaml` for every live route; descriptions and input schemas are the spec's, and tests check the generator against the real spec plus a tool-call round trip through the HTTP routes
- ☑ `@helix/cli` connector (`packages/cli`): `init --all -k` writes MCP config and SKILL.md for Claude Code, Cursor, Codex, Windsurf; `--browser` opens the connect page. Unpublished; the `@helix` npm scope is unclaimed
- ☑ Per-account SKILL.md served at `/api/app/skill` (session or bearer key) and the public `/agent-onboarding/SKILL.md`
- ☐ Generated TypeScript SDK
- ☐ Documentation site
- ☐ Self-host polish, resource tuning

---

## Deliberately out of scope for v0.1

- Hosted multi-tenant deployment and billing
- BYO-browser (pointing at Browserbase or Steel) — the seam exists, the adapter does not
- SQL/Parquet/BigQuery export
- Knowledge-graph extraction
- Cross-source entity resolution (Diffbot-scale fusion is a separate multi-year bet)

## Known risks

**Stealth is validated locally only.** CreepJS, Sannysoft and browserleaks catch fingerprint incoherence; they cannot tell you whether Cloudflare or DataDome would let you through. The local suite will find real bugs and cannot confirm the ladder works.

**Three runtimes is real overhead.** If the Rust tier proves marginal against curl_cffi in Python, collapsing it is a legitimate simplification, not a defeat.

**`wreq` is pinned to 0.15.3.** 0.16 requires rustc 1.98, above the 1.95 toolchain here. Its predecessor `rquest` was yanked from crates.io entirely — every version — so this dependency needs watching.

**BoringSSL needs cmake to build.** Present in the Docker image, absent on this host, so `cargo test` for the fetch service only runs in a container until cmake is installed locally.

**The sample profile is a placeholder.** Hand-written fingerprint values validate structurally and are wrong in precisely the way detection looks for. Nothing goes near a live target until `tools/capture` has produced real ones.
