# New Endpoint Feasibility (agent 16)

Ground truth as of 23 Aug 2026: M0-M4 shipped, M5 shipped, M6 (Vectors) in progress — chunking/embedding/sinks exist but nothing calls them from the crawl worker yet — M7 (Monitors), M8 (Enrich), M9 (Surface: MCP/SDK/docs) not started. `apps/api/src/mcp/` and `packages/sdk-ts/` are empty directories. Current openapi.yaml has 12 paths: `/scrape`, `/batch/scrape`, `/map`, `/crawl`, `/search`, `/enrich`, `/monitors`, `/monitors/{id}`, `/jobs/{id}`, `/jobs/{id}/errors`, `/profiles`, `/health`.

This document proposes endpoints buildable substantially from what already exists in `apps/api/src`, `apps/fetch/src`, `apps/extract/helix_extract`, and `packages/`. Effort estimates assume one engineer already familiar with the codebase. S = under a day, M = 2-5 days, L = 1-3 weeks, XL = a milestone's worth of work (comparable to M6/M7/M8 themselves).

---

## 1. Infrastructure inventory

| Capability | Where | Reusable for |
|---|---|---|
| Fetch ladder (4 tiers, evidence-based escalation) | `apps/api/src/core/pipeline.ts`, `escalation.ts` | Any new "fetch a page" surface |
| TLS/HTTP2-impersonating client, 13 identities, per-request client isolation | `apps/fetch/src/main.rs`, `profile.rs` | Any endpoint needing stealth fetch |
| Profile model + coherence validator | `packages/profiles/`, `apps/fetch/src/profile.rs` | `/profiles` already exposes this; anything wanting to select/report an identity |
| Block-detection classifier (weighted signal fusion, typed `FailureReason`) | `apps/api/src/core/block-detection.ts` | Any endpoint that fetches and must not silently return junk |
| Playwright browser pool (context recycling, drain-then-retire) | `apps/api/src/browser/pool.ts` | Screenshot-only, action-only, or any browser-tier endpoint |
| Action runner (click/write/press/scroll/wait/screenshot/executeJavascript) | `apps/api/src/browser/actions.ts` | Agent-facing "act on this page" affordances |
| Crawl frontier, BFS, Bloom dedup at scale, persistence/resume | `apps/api/src/crawl/frontier.ts`, `persistent-frontier.ts` | Any bulk-discovery feature (site graph, discovery within a domain) |
| AIMD adaptive politeness per host | `apps/api/src/crawl/politeness.ts` | Reused automatically by anything built on the crawl worker |
| robots.txt (RFC 9309) + sitemap discovery (recursive index, capped) | `apps/api/src/crawl/robots.ts`, `sitemap.ts` | A standalone `/map`-adjacent "site structure" endpoint |
| Postgres job queue, `FOR UPDATE SKIP LOCKED` | `apps/api/src/crawl/worker.ts`, `jobs` table | Any new async job type — same pattern extends to monitors/enrich |
| Cursor-paginated job results | `apps/api/src/routes/jobs.ts` | Any job-shaped endpoint's result retrieval |
| Cost estimator (`estimate: true` → pages/tiers/tokens/$) | `openapi.yaml` `Estimate` schema, wired into `/crawl` and `/map` | Any endpoint whose cost scales with discovered work |
| PDF classification (`needsOcr`, `suspectedGarbledText`) + mojibake detection | `apps/extract/helix_extract/documents.py` | A standalone document-assessment endpoint |
| Document parsers behind one `convert()` interface (pypdfium2/Marker/Docling/DOCX/PPTX/XLSX) | `apps/extract/helix_extract/documents.py` | Any "parse this file" surface, independent of `/scrape` |
| LLM schema compiler (OpenAI/Anthropic/Gemini/OpenAI-compatible) | `apps/extract/helix_extract/schema_compiler.py` | Any structured-extraction feature outside `/scrape`/`/enrich` |
| Retrieval-then-extract relevance scorer (lexical, `blocks_kept`/`blocks_total`) | `apps/extract/helix_extract/relevance.py` | Any endpoint trimming long content before an LLM call |
| Semantic chunking + stable content-derived anchors | `apps/extract/helix_extract/chunking.py` | Any RAG-facing endpoint (retrieval, re-chunking as a service) |
| Local + BYOK embeddings | `apps/extract/helix_extract/embeddings.py` | Anything needing vectors without forcing a paid key |
| Vector sinks (Qdrant, pgvector) with deterministic UUID v5 upsert | `apps/api/src/vectors/sink.ts` | A standalone `/vectors/*` surface, or search over stored chunks |
| SERP adapters (Serper default, SerpAPI) with domain operators, freshness | `apps/api/src/search/providers.ts` | Already `/search`; reusable for any search-then-X composition |
| Fail-open per-key token-bucket rate limiter, `X-RateLimit-*` headers | `apps/api/src/core/rate-limit.ts` | Automatically covers any new route |
| API keys (hashed, per-key limits, revocation) | `apps/api/src/core/api-keys.ts` | Auth for any new route, no new work |
| Content-hash + conditional-header (`ETag`/`If-Modified-Since`) incremental logic | `apps/api/src/crawl/state.ts` | The exact primitive M7 (Monitors) needs |
| Typed `FetchFailure` taxonomy + per-job failure log | `apps/api/src/routes/jobs.ts` (`/jobs/:id/errors`), `fetch_failures` table | Any observability endpoint over the ladder's own behaviour |

**Notably absent** (do not assume it exists): MCP server (`apps/api/src/mcp/` is an empty directory), generated TS SDK (`packages/sdk-ts/` is empty), any auth-session / cookie-jar persistence across calls, any proxy pool of Helix's own (BYO only), monitor scheduler/diffing (M7 not started), enrich phased extractors (M8 not started), and `destination` (vector sink) is not yet wired into the crawl worker despite the sinks existing.

---

## 2. New endpoint candidates

### A. Cheap compositions of existing pipeline output

| Endpoint | Purpose | Reuses | New work | Effort |
|---|---|---|---|---|
| `GET/POST /screenshot` | Screenshot-only fast path, skip markdown extraction | `browser/pool.ts` render + screenshot, block detection | Thin route; short-circuit `pipeline.ts` before the extract-client call when `formats === ['screenshot']` | S |
| `POST /links` | Links-only extraction (no full markdown body) | `pipeline.ts`, `extract/client.ts` (already returns `links`) | Response shaping only — the data already exists in `ExtractResult.links` | S |
| `POST /markdown` | Alias of `/scrape` with `formats: ['markdown']` fixed, minimal envelope | Full pipeline | Essentially none | S (see honesty note) |
| `GET/POST /pdf-assess` | Return `needsOcr`/`suspectedGarbledText`/page count without full parse | `documents.py` classification step | Split `assess` from `convert` in the extract API surface | S |

**Honesty check on `/markdown` and `/links`:** these are not new capability, they are packaging. `/scrape` already accepts a `formats` array (`markdown`, `text`, `rawHtml`, `screenshot`, per `openapi.yaml`'s `Format` enum) and returns exactly this. A dedicated path only earns its keep if it changes the response envelope or the discovery/DX story — e.g. a flatter response for agent tool-calling, where a smaller schema reduces token overhead per call. Recommendation: do NOT ship `/markdown` and `/links` as separate REST paths — expose them as MCP tools instead (§C), where a narrower schema genuinely helps a tool-calling agent. `/screenshot` and `/pdf-assess` are more defensible as separate paths because they skip real work (extraction, OCR classification) rather than just reshaping output.

### B. Observability of Helix's own work

Prior research (`06-monitoring-and-datalayer.md`, `08-feature-ideation.md`) flags this as a confirmed white space: no competitor surfaces ladder/frontier internals. Helix already logs almost everything needed — this is close to pure plumbing.

| Endpoint | Purpose | Reuses | New work | Effort |
|---|---|---|---|---|
| `GET /jobs/{id}/ladder` | Per-URL tier history: which tier served each page, why it escalated, profile used | `documents` table already stores `tier`, `tiersAttempted` (in `metadata`), `profile`; `fetch_failures` stores `detected_by`, `tiers_tried` | New query + response shape only, no new capture | S |
| `GET /jobs/{id}/cost` | Actual spend breakdown post-hoc: tier distribution, browser-seconds, token/provider cost incurred vs. the `estimate:true` prediction | `Usage` schema already defined (`pagesFetched`, `browserSeconds`, `tokens`, `providerCost`) and written by `worker.ts` (`usage` column) | Response formatting + a diff-against-estimate field; the estimate itself needs to persist alongside the job to compare | S-M |
| `GET /profiles/{id}/health` | Success rate / block rate for a given fingerprint profile over recent use | Block-detection verdicts already logged per failure with `profile`; needs a rollup query over `fetch_failures` + successful `documents` | New aggregation query, no new signal capture | S-M |
| `GET /jobs/{id}/politeness` | Per-host concurrency/backoff timeline during a crawl (AIMD state over time) | `PolitenessController` computes this live but does not currently persist a timeline, only current state | Needs a new time-series write (host, concurrency, event) during the crawl — genuinely new capture, not just a new read | M |

These are high-value and structurally cheap because §1's inventory already writes almost everything into Postgres; most of this section is read-path work on existing columns, which is exactly the kind of endpoint a self-hosted, no-black-box positioning should prioritize — differentiation at near-zero marginal engineering.

### C. Agent-facing affordances (MCP is planned; this is what sits next to it)

| Endpoint / surface | Purpose | Reuses | New work | Effort |
|---|---|---|---|---|
| MCP server itself | Expose scrape/map/crawl/search/enrich as MCP tools | Every route already exists behind typed handlers; OpenAPI is the source of truth | The actual M9 item — tool schema generation from OpenAPI, MCP transport wiring, per-tool description quality | L (this is M9, already scheduled — do not duplicate scope here) |
| `POST /act` | One call: navigate + run an action sequence (click/fill/wait) + return extracted content — Stagehand-style act/extract/observe folded into one call | `browser/actions.ts` runActions, `pipeline.ts`, extract client | `/scrape` already accepts an `actions` array per `openapi.yaml`'s `Action` schema and `ScrapeRequest`. Verify whether `/scrape` + `actions` already satisfies this before building a second path. Likely gap: "observe" (return interactable elements without acting), which the browser pool does not currently expose. | S if `/scrape`+actions already covers it (verification task); M if an `observe` mode is genuinely missing |
| `POST /extract-file` | Structured extraction directly from an uploaded/streamed file (not a URL) — bypasses the fetch ladder entirely | `documents.py` convert(), `schema_compiler.py`, `relevance.py` | Multipart upload handling in `apps/api`, routing straight to `helix-extract` without going through `helix-fetch`/block-detection | S-M |
| `GET /jobs/{id}/schema` | Machine-readable description of what fields a running job will return, for an agent orchestrating multiple jobs | `ExtractConfig`/schema already in the request | Mostly a reflection endpoint over the stored request | S |

### D. BYOK-specific surface (only makes sense because Helix owns no model/store)

| Endpoint | Purpose | Reuses | New work | Effort |
|---|---|---|---|---|
| `POST /vectors/search` | Query the operator's own pgvector/Qdrant store (semantic search over previously-chunked content) using their embedding key | `vectors/sink.ts` (needs a `query` method beside `store`), `embeddings.py` for query-time embedding | `VectorSink` interface currently only has `store`/`ensureCollection`/`health` — a `query(collection, vector, k)` method is new but structurally trivial given the sink abstraction already exists | M |
| `POST /vectors/{collection}/reembed` | Re-embed an existing collection under a new BYOK model (e.g. operator switches from local to OpenAI embeddings) | Chunk storage already keyed by deterministic UUID v5, `embeddings.py` | Needs a job type that reads existing chunks from Postgres and re-runs embedding + upsert — new job kind, but storage/dedup mechanics already exist | M |
| `GET /estimate/model-cost` | Given a schema + sample page, return token/cost estimate without running a job (finer-grained than the whole-crawl estimator) | `relevance.py` trim_to_budget, `schema_compiler.py`, provider token-cost tables already implied by the `Estimate` schema | Needs a token-cost table per BYOK provider/model (partially implicit in the estimator already) exposed standalone | S |

**Note:** `/vectors/search` is the most interesting BYOK-only endpoint on this list — it only makes sense for a product that treats the vector store as the operator's own resource, and Helix already writes into it deterministically. Every hosted competitor either doesn't offer this (no pgvector sink) or would have to host the index themselves, which conflicts with their own margin model. This is a genuine structural advantage, not a wishlist item — but it is blocked on M6 finishing the `destination` wiring first (§4).

### E. Diff/change semantics (pre-empting, not duplicating, M7)

Monitors (M7) is unstarted, so nothing here should compete for that milestone's dependency chain (scheduler; `MonitorRequest`/`Monitor`/`Schedule` schemas already exist in `openapi.yaml`, but the worker/scheduler code does not). One thing is buildable now, ahead of the scheduler, because it needs no scheduling at all:

| Endpoint | Purpose | Reuses | New work | Effort |
|---|---|---|---|---|
| `POST /diff` | One-shot diff between two URLs, or a URL and previously-stored content, at word/line/char granularity | `state.ts` content hashing, conditional-header logic; a Myers-diff implementation is the only missing primitive | Needs a diff library integration (not in the codebase yet) plus a response shape; useful standalone ("did this page change since I last fetched it") without cron/scheduling | M |

This is explicitly NOT a monitor — no schedule, no webhook, no persistence beyond one comparison. It is the diff *primitive* M7 will need, buildable and shippable independently, and it de-risks M7 by proving the diff-quality bar before the scheduler is built around it.

---

## 3. What Helix should NOT build

Per `ARCHITECTURE.md` §1 (principles 4-6: BYOK is structural, self-host is the whole product, no hosted-tier capability gap), the following are structurally incompatible and should be explicitly declined rather than silently deferred:

| Capability | Why it conflicts |
|---|---|
| A maintained crawl index / "search our index" endpoint (Diffbot/Common-Crawl style) | Requires Helix to own and continuously refresh a corpus at its own expense — a hosted-index business, the opposite of BYOK. `MILESTONES.md` explicitly excludes "cross-source entity resolution (Diffbot-scale fusion)" as a separate multi-year bet. |
| A residential/rotating proxy pool as a Helix-operated service | Principle 4: "Helix never bundles a model, a proxy pool or a vector store." `ARCHITECTURE.md` §3: "Bring your own. Helix owns retry, failover, block detection and per-host throttling; the provider owns rotation, geography and pool health." Operating a proxy pool also creates the margin-taking incentive the BYOK thesis exists to avoid. |
| Hosted vector storage (a Helix-run Qdrant-as-a-service) | Same principle; the pgvector/Qdrant sinks are adapters to the operator's own instance, not a managed offering. A "Helix Vector Cloud" tier would directly contradict "the self-host build is the whole product." |
| A Helix-hosted LLM proxy/gateway (even a pass-through with margin) | Principle 4 and §9: "Helix never proxies a model call through its own account and takes no margin on inference." An `/llm/complete`-style endpoint routed through Helix's own provider account is exactly the anti-pattern the architecture rejects. |
| SQL/Parquet/BigQuery export as a hosted warehouse | `MILESTONES.md` "Deliberately out of scope for v0.1" already lists this. Not structurally incompatible with BYOK (an operator's own S3/warehouse credentials would fit the model) but it is real net-new infra (export pipeline, schema inference across heterogeneous pages) with no existing scaffolding — a genuine roadmap item, not a never-build, but correctly deferred. |
| Knowledge-graph / cross-source entity resolution (Diffbot-style fusion) | Explicitly out of scope per `MILESTONES.md`. Entity resolution needs a persistent, growing, cross-customer knowledge base to get good at — again a hosted-index business model, not a per-operator BYOK tool. |
| A managed multi-tenant hosted tier / billing system | `MILESTONES.md`: "Hosted multi-tenant deployment and billing" is explicitly out of scope for v0.1. Endpoint design should not assume multi-tenant isolation beyond the existing per-key model. |

---

## 4. Sequencing

M6 (Vectors) is in progress with one explicit blocking gap: `destination` is not wired into the crawl worker, so sinks exist but nothing calls them. M7 and M8 are unstarted. Sequencing new endpoints against this:

1. **Ship now, zero dependency conflict** (§B observability, §A screenshot/links/pdf-assess, §D `/estimate/model-cost`): these read from tables/pipelines that are already complete (M0-M5) and touch none of M6/M7/M8's unfinished surface. Safe to build in parallel with M6 completion.
2. **Ship only after M6's `destination` wiring lands** (§D `/vectors/search`, `/vectors/{collection}/reembed`): these depend on chunks actually being written by the crawl worker. Building a query endpoint over an empty sink wastes the work — sequence strictly after M6's remaining item.
3. **`POST /diff` (§E) should land before M7 starts**, not concurrently with it — it is the diff-quality primitive the Monitors scheduler will consume, and proving it standalone avoids discovering diff-noise problems mid-scheduler-build.
4. **Do not start anything under §C's MCP server** outside the already-scheduled M9 — a second, informal MCP-adjacent surface (e.g. hand-rolled tool schemas for `/act`) would fork the "generated from OpenAPI" discipline `ARCHITECTURE.md` principle 7 requires. `/act`'s gap-check (does `/scrape` + `actions` already cover it) should happen first since it may require zero new code.
5. **Nothing here should touch M8 (Enrich).** Enrich's phased-extractor/confidence work is self-contained and none of the candidates above depend on or feed it.

Net recommendation: the observability endpoints (§B) are the highest value-to-cost items on this list — they require no new capture, only new reads over data the system already persists, and they directly serve the differentiator prior research identified ("no competitor surfaces this"). `/vectors/search` is the highest-value BYOK-native idea but is correctly gated on finishing M6 first.
