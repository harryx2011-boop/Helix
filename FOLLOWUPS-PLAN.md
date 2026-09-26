# Follow-ups plan: after the 2026-09-26 live smoke

Plan of record for the work Harry picked on 2026-09-26 after the first live pass over every
endpoint (`apps/api/scripts/smoke-live.mjs`, all 27 MCP tools). One phase per turn; each phase
ends with its tests green, the live smoke re-run, `context.md` updated, and a commit.

Designs come from two read-only backend-architect passes the same day; the load-bearing claims
below were re-checked against the code before this was written.

## Phase 0: land the crawl/batch fix (in the tree, uncommitted)

`routes/crawl.ts` and `routes/batch.ts` wrote raw URLs to `job_tasks` while `PersistentFrontier`
claims and completes rows by `normaliseUrl()`'s form, so any seed the normaliser changes
(`https://example.com`, a trailing slash) was fetched and dropped. Fixed by seeding the
normalised form; regression test in `batch.test.ts` fails on HEAD; 1368/1368 green.

- [x] Restart the dev API (Harry authorised, 2026-09-26) and re-run live through MCP: the tutorial crawl went from 0 pages to 1/1, the batch from 0 done to 2 done + 1 failed (the bad host), and the example.com `limit: 1` crawl to 1/1.
- [ ] Full `smoke-live.mjs` with `HELIX_API_KEY` (still needs the key).
- [x] **Second defect found by the same run** (fixed: fetch the URL as found, dedupe on the normalised key; `FrontierItem.url` / `.key`, `fetchUrl()` in `crawl/url.ts`): the frontier fetches the *normalised* URL, and `normaliseUrl()` strips the trailing slash (`crawl/url.ts`). A server that serves `/3/tutorial` without redirecting makes every relative link resolve one directory too high (`/3/appetite.html` for `/3/tutorial/appetite.html`), so `includePaths: ['/3/tutorial/*']` rejects them and the crawl stops at the seed. `/scrape` of the slashed URL resolves correctly. Harry chose this direction 2026-09-26.
- [x] **Third defect:** `PersistentFrontier.next()` claimed discovered links before they were flushed (the worker flushes only past 50), so the claim matched no row and every discovered page was fetched and dropped. `next()` now flushes before claiming. Live: the tutorial crawl returns 3/3.
- [ ] Fourth, not fixed here: markdown links inside page content resolve against the site root, not the page (`links` is correct). Extract service.
- [ ] Commit the fixes, the tests, the smoke script and the doc updates. No version bump: Harry chose (2026-09-26) to rebuild and replace the `Helix-Setup-2.0.0.exe` installer once the phases land, knowing installed 2.0.0 apps will not auto-update to it and the `v2.0.0` tag stays on `a3895f4`.

## Phase 1: loud failures (no new routes)

**1a. A job must not report a clean success after losing pages.** `crawl/worker.ts:745` sets
`status = 'completed'` unconditionally. `total` is the in-memory `frontier.enqueued`, not the
`job_tasks` row count, and a `markCompleted`/`markFailed` that returns `false` (row not owned,
`worker.ts:609`) is dropped with no counter, log or row. The module's own comment
(`persistent-frontier.ts:16-22`) names this failure.
- At finalise, `SELECT status, count(*) FROM job_tasks WHERE job_id = $1 GROUP BY status`. Rows still `queued`/`running`, or a DB count that disagrees with the local counters, add a warning (`unaccounted_tasks: N`). Zero pages completed plus stranded rows is `failed`. (Harry, 2026-09-26: completed + warning, not failed.)
- Count and log every `false` from `markCompleted`/`markFailed` (`notOwned`); nonzero at the end joins the warning.
- Audit first: every path that ends a task (robots-denied, path-cap, filtered, unchanged) must move its `job_tasks` row to a terminal status, or the guard trips on healthy jobs.
- Wire: `Job` in `openapi.yaml` (line 4585) has no `warnings`; add `warnings: string[]`. This is additive, but it is a contract addition: **MINOR**.
- Test: `worker.stranded.test.ts`: one `markCompleted` returns `rowCount: 0`, and finalise must not be a clean `completed`.

**1b. Empty extraction escalates.** `core/escalation.ts:99` returns early only when the extracted text is 200 characters or more. A short extraction then falls through to raw-HTML checks, and those pass any page with boilerplate (python.org/psf: 200, 0 characters, no escalation). Check the extracted text against the same 200-character floor before the raw-HTML heuristics, and keep those heuristics as extra triggers. This is signal-based, not framework-based.
- Test: `escalation.test.ts`, a boilerplate page with `extractedText: ''` must escalate; `pipeline.test.ts`, plain returns 200 with empty markdown, and the answer comes from the next tier.
- Risk: it adds browser spend on truly thin pages. Keep the floor at 200, not enrich's 300.

**1c. A short but clean PDF keeps its text.** `apps/extract/helix_extract/documents.py:410` sends any `needs_ocr` PDF to `_ocr_pdf`, which returns `""` when Marker is absent. `needs_ocr` fires on fewer than 50 characters per page (`MIN_CHARS_PER_PAGE`) even when the text layer is clean (w3.org dummy.pdf: 14 characters, not garbled). Discard the text layer only when `suspected_garbled_text`. When the page is merely short and OCR is unavailable, fall through to `_pdf_to_markdown` and keep `needsOcr` true, so the warning still fires. Leave the constant alone.
- Test: extract pytest, short clean PDF with Marker absent returns non-empty markdown and `needs_ocr`; a garbled PDF with Marker absent still returns `""`.
- Restart extract after the change: uvicorn does not hot-reload.

Release: **2.1.0** (1a adds a response field). Extract gets its own PATCH line.

## Phase 2: detect a running Ollama, offer it, never auto-use it

Today `/health` reads LLM configuration from env only (`routes/health.ts:24-46`), and local
runtimes are gated on `OPENAI_COMPATIBLE_BASE_URL` alone (`index.ts:158`). A running Ollama is
invisible, and every model tool answers "not configured". Storage and the safety boundary
already exist and stay as they are (`PUT /providers/:provider`, `providers.ts:102-165`, which
exempts loopback for local providers and verifies before storing).
- `providers/detect.ts`: probe `GET http://127.0.0.1:11434/api/tags`, 1 s timeout, result cached for a few seconds. A failure means "not detected", never an error. This is an operational probe of a fixed loopback address, the same trust tier as the fetch and extract health checks, not a caller URL, so `url-guard.ts` does not apply.
- Surface it as `providers.llm.detected` on `/health` and `detected: true` on the `ollama` row of `GET /providers`, with `configured` unchanged.
- Dashboard `provider-row.tsx`: a "Detected" row that pre-fills the base URL and calls the existing `PUT` on one click. Nothing is stored without that click.
- Wire: additive fields on `/health` and `/providers`; run `mcp/tools.test.ts` and `mcp-tool-names.test.ts`. **MINOR.**
- Verify on the installed desktop app too (its loopback-only binding must not block reaching 11434).

## Phase 3: `GET /v1/jobs/{id}/ladder` and `GET /v1/jobs/{id}/cost`

**Ladder (S).** Per page: winning `tier`, `tiersAttempted`, `profile`, `timingMs`, from
`documents` (`001_init.sql:83-101`, written at `worker.ts:880-896`). Escalation reasons for a
page that succeeded are not stored today, only for failures (`fetch_failures.detected_by`). Add
`escalationReasons` to the existing `documents.metadata` jsonb write, so no migration is needed.
Paginated like `GET /jobs/{id}` (`next`, page size 100). An empty `escalationReasons` on a
first-tier success is asserted in tests, so no reason is ever invented.

**Cost (M).** Two honesty gaps, both confirmed:
- The estimate is never stored. `estimateCrawl` (`routes/crawl.ts:289`) is computed and thrown away. Recomputing later would report today's discovery as the original estimate. Migration `013_job_estimate.sql` adds `jobs.estimate jsonb`, written once at submit; older jobs answer `estimate: null`. It must run on both drivers (pg and PGlite `exec()`).
- Actual usage is thin. `worker.ts:745` writes only `pagesFetched`/`pagesUnchanged`, yet `openapi.yaml`'s `Usage` schema documents `browserSeconds`, `tokens` and `providerCost`. Count `tierBreakdown` and `browserSeconds` in the worker. Tokens and provider cost stay `null` with a `reasons` entry until the extract service reports them per call. Fix the `Usage` schema so it stops promising fields nobody writes.
- Tests first: an unmeasured field is `null` plus a reason, never `0`.

Both join the MCP core list (`helix_get_job_ladder`, `helix_get_job_cost`), cost only once the
worker counters land. **MINOR.**

## Phase 4: `POST /v1/vectors/search` (L)

The blocker is confirmed: `VectorSink` (`vectors/sink.ts:40-45`) has `store`, `ensureCollection`
and `health`, and no `query`, so nothing can read stored chunks back.
- Add `query(collection, vector, k, filter)` to the Qdrant and pgvector sinks.
- Record the embedding model per collection: migration 014 adds `chunks.model` and `chunks.dimensions`, written where `sink.store` runs; for Qdrant it goes in the collection payload. A query embedded with a different model is refused, and a collection older than tracking requires an explicit `model`.
- Runtime matrix, stated in the docs and the 400s: Qdrant everywhere; pgvector on the desktop app (PGlite ships `pglite-pgvector`) but not on the dev PG18, where the chunks table is gated off. When the local embeddings pack is still downloading, pass through the extract service's 503 + `Retry-After`.
- Response: chunk `text`, stable `anchor`, `score`, `url`, `headingPath`.
- MCP: `helix_vectors_search` joins the core tool list (Harry, 2026-09-26); update `HELIX_MCP_TOOLS` in `~/.claude/hooks/helix-ensure.js` when it ships. **MINOR.**

## Out of scope here

A search backend (`TODO.md`), the crawl estimate's "0 pages" for example.com (a separate
link-discovery question in `routes/map.ts:45`), and the interact error that says `actions[1]`
beside `actionIndex: 0`. Each gets its own entry if picked up.
