# Helix — Marketing Asset Inventory

**Status:** research, pre-implementation · **Date:** 23 August 2026

Purpose: separate what a landing page can **prove** from what it can only **assert**, given Helix is pre-implementation. Source documents: [README.md](../README.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [DESIGN.md](../DESIGN.md), [FRONTEND.md](../FRONTEND.md), [openapi.yaml](../openapi.yaml), [MILESTONES.md](../MILESTONES.md), [02-firecrawl-weaknesses.md](02-firecrawl-weaknesses.md), [05-dx-and-byok.md](05-dx-and-byok.md).

**Ground truth on build state (MILESTONES.md, 23 Aug 2026):** M0–M4 done (skeleton, fetch/extract, browser tiers, documents, crawl). M5 (LLM) done except prompt caching and *unverified live provider calls — no API keys available in this environment*. M6 (vectors) in progress — sinks exist but nothing calls them, embedding run unverified. M7 (monitors) and M8 (enrich) not started. M9 (surface: MCP, SDK, docs) not started. **No screenshots, no running dashboard, no live-target validation exist yet.** Stealth is validated only against local detection suites (CreepJS/Sannysoft/browserleaks), never against a live Cloudflare/DataDome target — MILESTONES.md and ARCHITECTURE.md §13 both flag this explicitly. The sample fingerprint profile is a placeholder.

---

## 1. The one-line position

**Primary:** Helix is a self-hosted, BYOK web-data API — turn any page or document into clean, structured, LLM-ready data using your own models, proxies and storage, with nothing held back for a paid tier.

### Three alternative phrasings, by aggression toward Firecrawl

| Level | Phrasing | Notes |
|---|---|---|
| **Low (no incumbent named)** | "The web-data API you run yourself: BYOK, Apache-2.0, no credits, no cloud-only tier." | Safe for any context, including the README/docs. Makes no comparative claim, so needs no evidence citation. |
| **Medium (implicit contrast)** | "Bring your own key, self-host the whole thing — not just the parts a vendor didn't hold back for their paid plan." | Gestures at the "self-host build is crippled" complaint without naming Firecrawl. Defensible without citing issue numbers, since it's a category statement, not a specific claim. |
| **High (named or unmistakable)** | "Firecrawl bills a credit when a Cloudflare page blocks it. Helix calls that a failure." | Directly comparative and specific. Only usable with the citation available (Firecrawl #2413) and only defensible once Helix's own block-detection actually ships this behavior against a live target — currently *specified and unit-tested*, not *field-verified*. Legal/reputational risk if Firecrawl's behavior has changed since the issue was filed (2024–2026 vintage, unconfirmed current state). Recommend gating this tier behind a "as of [date], per [issue link]" citation if used at all.

**Recommendation:** Medium is the safe default for a landing page hero. High-aggression copy should be reserved for a dedicated comparison page with dated citations, not the hero — the incumbent's behavior could have changed and an unqualified claim ages badly.

---

## 2. Capability inventory

Every endpoint, one-sentence marketing description, concrete input→output, and build status per MILESTONES.md.

| Endpoint | Marketing one-liner | Input → Output | Status |
|---|---|---|---|
| `POST /scrape` | Read one URL — web pages and documents return the same envelope. | `{url}` → `{success, data: Document, warnings[]}` or `{success:false, failure: FetchFailure}`. Supports `formats` (markdown/json/screenshot), `extract.schema`, `tier` override, `actions[]` (click/scroll/wait/etc). | **Implemented.** M1 (ladder, block classification, `/scrape`) and M2 (browser tiers, actions, screenshots) both ☑. |
| `POST /batch/scrape` | Read many URLs in one call. | `{urls[]}` → `202 {id, url}` job handle; poll `/jobs/{id}`. | **Implemented** (rides the same job/worker infra as crawl, M4 ☑). Not explicitly milestone-tracked as a separate line item — inferred from shared job machinery. |
| `POST /map` | List a site's URLs without reading them. | `{url}` → `{urls[]}` (sitemap-first, link-discovery fallback). | **Implemented.** M4 ☑ (`POST /map`). |
| `POST /crawl` | Discover and read a whole site, politely. | `{url, limit?}` → `202 {id, url}` job handle. Or `{url, estimate:true}` → `200 Estimate {pages, tierBreakdown, estimatedSeconds, estimatedTokens, estimatedProviderCost, assumptions[]}`. | **Implemented.** M4 ☑ (frontier, dedup, adaptive politeness, robots, sitemap, estimator, Postgres-backed queue with resume). |
| `POST /search` | Search the web, optionally reading every result in the same call. | `{query, scrape?}` → `{results[]}`, each with content when `scrape` set. Serper (default) or SerpAPI. | **Implemented**, but **live calls unverified** — M5 explicitly flags "no API keys available in this environment." Code path exists and is tested structurally; not proven against a real SERP provider. |
| `POST /enrich` | Turn a sparse identifier into structured columns with citations. | `{rows:[{email|domain|...}], fields:[{name,type,description}]}` → `202` job → rows with `value, confidence, sourceUrl, passage` or `null` + reason. | **Not started.** M8 is entirely unchecked (☐ field routing, confidence, citations, guardrails, null-with-reason). This is fully aspirational — spec-only. |
| `GET/POST /monitors`, `GET/DELETE /monitors/{id}` | Scheduled re-reads with inline diffs; unchanged pages are free. | `{urls[], schedule, diff?, trigger?, webhook}` → `201 Monitor`. | **Not started.** M7 entirely unchecked (☐ scheduler, hashing, diffs, keyword triggers, webhooks). Spec-only — the OpenAPI paths exist, no implementation. |
| `GET/DELETE /jobs/{id}`, `GET /jobs/{id}/errors` | Poll status, cancel, and see per-URL failures with typed reasons. | `{id}` → `Job {status, total, completed, failed, data[], usage}`. Errors → `{errors: FetchFailure[], robotsBlocked[]}`. | **Implemented** for crawl/batch-scrape jobs (M4). Will also serve enrich jobs once M8 lands — currently that arm is unimplemented. |
| `GET /profiles` | List browser identity profiles, each validated for internal coherence. | → `{profiles: [{id, browser, version, platform, capturedAt, coherent}]}`. | **Partially implemented.** Profile model, coherence validator and resolver exist (M0/M1 ☑, 7 Rust tests). But MILESTONES.md M1 and "Known risks" both flag: *"the sample profile is a placeholder... nothing goes near a live target until `tools/capture` has produced real ones."* The mechanism is real; the profile data is not yet. |
| `GET /health` | Health check across every dependency. | → `{status, version, services{}, providers{}}`. | **Implemented.** Health-gated compose startup and real health probes are M0 ☑. |
| MCP server | Agents call Helix directly. | N/A | **Not started.** M9 entirely unchecked. README markets it ("Plus an MCP server, so agents can call it directly") but it does not exist yet — this line in the README is itself aspirational relative to MILESTONES.md. |
| Generated TypeScript SDK | Typed client generated from the spec. | N/A | **Not started.** M9. Also flagged in M0: "Codegen wired for all three runtimes (deferred — hand-written types for now)." |
| Vector sinks (Qdrant, pgvector) via `destination` on `/crawl` | Crawl straight into a vector store. | `{url, chunk:{...}, destination:{type, collection}}` → job that also writes chunks/embeddings. | **Specified in openapi.yaml as a documented example, not functional.** M6 ◐: chunking, anchors, local embeddings, both sinks exist, but *"`destination` wired into the crawl worker — sinks exist but nothing calls them"* is explicitly unchecked. The `toVectors` example in the spec is aspirational today. |
| Dashboard (Playground, Jobs, Keys, Health) | Local UI to run requests and watch the ladder. | N/A | **Not started as code.** FRONTEND.md and DESIGN.md are complete specs ("design settled, build starting"); no dashboard app exists in the repo yet per MILESTONES.md (M9 unchecked, and no dashboard-specific milestone line appears anywhere in M0–M8). |

**Marketing implication:** the honest v0.1 surface to lead with is `/scrape`, `/map`, `/crawl`, `/search` (search caveated as live-unverified), plus job polling, health, and profiles-with-a-caveat. `/enrich` and `/monitors` are real OpenAPI-documented endpoints and can be shown as **spec**, but must not be demoed or claimed as working. The MCP server and SDK should not appear as present-tense capabilities at all.

---

## 3. Differentiation ledger

| Design commitment | Incumbent failure it answers | Demonstrable on a landing page? |
|---|---|---|
| **BYOK (no bundled LLM/proxy/vector store)** | Firecrawl's hosted BYOK is broken: #4083 — `OPENAI_API_KEY`/`OPENAI_BASE_URL` params exist but fail silently while still burning credits. Also #1467 — self-host Ollama/local-LLM extract fails, demands a Google API key regardless of configured provider. | **Assert + show config, not run.** Can show the `.env.example` BYOK surface (real, in-repo) and the two-credential-model explanation from ARCHITECTURE.md §9 verbatim. Cannot demonstrate a live BYOK call converting savings, since no cost benchmark exists and Firecrawl's current behavior is not independently re-verified here. |
| **Block-page-is-failure** | #2413 — Cloudflare block silently treated as success and still bills a credit; explicit stealth doesn't reliably auto-trigger. #2257 — self-host fails where Browserless succeeds on identical host/IP (closed "not planned"). | **Assert only, with a large caveat.** The classifier and typed `FetchFailure` shape are implemented and unit-tested (M0 ☑ "block-detection classifier + tests"). But MILESTONES.md's own "Known risks" section says stealth is validated **only locally** (CreepJS/Sannysoft/browserleaks) — "cannot confirm the ladder works" against a real Cloudflare/DataDome. A landing page must not claim Helix beats Cloudflare; it can truthfully claim Helix never dresses a challenge page up as content, and can show the typed failure shape. |
| **Fail-open rate limiting** | #3728 — Firecrawl's limiter fails **closed** on a Redis blip, 429s all traffic for ~30s, worker crashes on an unhandled error. #3150 — no agent-friendly rate-limit headers at all. | **Demonstrable via spec/response headers, not a live incident.** `X-RateLimit-Limit/Remaining/Reset` are real, documented response headers (openapi.yaml). Fail-open logic is implemented and tested (M0 ☑ "fail-open rate limiter + tests"). Can show the headers in a curl example; cannot stage a live "we survived a Redis-equivalent outage" demo without infrastructure most self-hosters don't have Postgres-store failure injection for. |
| **Estimate-before-run** | #3552 — agent hits "max credits" mid-run with no warning on SPA URLs. Positioned in 05-dx-and-byok.md as **"genuine whitespace, nobody does it."** | **Fully demonstrable, and the strongest live-demo candidate.** `POST /crawl {estimate:true}` is implemented (M4 ☑ "Cost estimator via estimate: true"). Real request/response shape exists in openapi.yaml (`Estimate` schema: pages, tierBreakdown, estimatedSeconds, estimatedTokens, estimatedProviderCost, assumptions[]). This is the one differentiator that is both unique-in-category and code-complete — highest priority for the demo surface. |
| **Whole-product self-host** | Fire Engine (anti-bot/IP rotation) is cloud-only; #1028 screenshots missing from early self-host; general "OSS build is crippled" complaint (README's own framing). | **Assert, backed by the milestone table.** Screenshots (M2 ☑), actions (M2 ☑), documents (M3 ☑), and crawl (M4 ☑) are all implemented in the one and only build — there is no cloud tier to compare against, so "nothing withheld" is trivially true today because nothing *exists* to withhold from. This claim gets stronger, not weaker, as more milestones land, since there's structurally no second tier to create a gap. |
| **Apache-2.0** | AGPL (Firecrawl's license) blocks embedding without reciprocal source disclosure — cited in README's "Why" as the third of three consequences. | **Fully demonstrable, verifiable today.** License is a fact of the repo, checkable by anyone. Zero implementation risk. |
| **Spec-first (OpenAPI as source of truth)** | #373 (scrape tool schema wrongly declares JSON options), #357 (README disagrees with actual version behavior), #4252 (JSON format silently empty via Responses API) — all schema-drift bugs cited in 05-dx-and-byok.md as "exactly the drift class generated clients eliminate by construction." | **Partially demonstrable.** `openapi.yaml` exists today (1242 lines, real, lints in CI per M0 ☑ "spec lint"). But the actual codegen that proves "clients are generated, not hand-written" is explicitly deferred (M0: "Codegen wired for all three runtimes — deferred, hand-written types for now"). Landing page can show the spec file and CI lint gate; cannot yet show a generated SDK as proof the drift-elimination mechanism is live. |

---

## 4. The demo surface

Firecrawl converts on an ungated, cloud-hosted playground widget. Helix has no cloud instance by design (self-hosted, BYOK) and no dashboard exists yet. Honest options, ranked:

| Option | What it is | Build cost | Honesty |
|---|---|---|---|
| **1. Copy-paste curl against the reader's own instance** | The README's existing `curl -X POST localhost:7400/v1/scrape ...` example, reproduced on the landing page with a "run this after `docker compose up`" framing. | **Near zero** — copy already exists verbatim in README.md. | **Fully honest.** Makes no claim about anything running anywhere; it's literally the quickstart. Weakest as a *conversion* device (no immediate visual payoff) but zero risk. |
| **2. Pre-recorded, deterministic playback of a real fetch-ladder run** | Capture one real `/scrape` call against a real Cloudflare-fronted test target, record the actual tier timings/outcomes, replay it as the DESIGN.md Sequence A animation (frames verbatim, real latencies substituted for the ms values already spec'd). | **Medium.** Needs: (a) M1–M2 fetch ladder actually running against a real profile (implemented) against (b) a real profile from `tools/capture` (explicitly still a placeholder per MILESTONES.md) before the recording is trustworthy. Today, recording against the placeholder profile would be recording a fiction. | **Honest only after `tools/capture` produces real profiles** and the recording is labeled "recorded run, not live" so nobody mistakes it for an interactive widget. Doing this today, before real profiles exist, would misrepresent stealth capability that is explicitly unverified — do not build this yet. |
| **3. WASM-free scripted animation of the ladder (no real fetch behind it)** | Take DESIGN.md's Frame 0–4 sequence A verbatim as illustrative motion — explicitly labeled as an explainer, not a live result. | **Low.** Pure frontend animation work reusing already-specified frame text, tokens, timing (8fps/125ms, tier colors) from DESIGN.md §3, §5, §6. | **Honest if and only if clearly labeled illustrative** (e.g. "how the ladder works" rather than "watch it run"). Firecrawl's own homepage doesn't do this, so it's a real differentiator in explaining *why* rather than just *that*. Lowest risk, lowest cost, ships today with zero backend dependency. |
| **4. Public sandbox instance (hosted, rate-limited, ephemeral)** | Stand up one real Helix instance, expose a heavily rate-limited `/scrape` and `/crawl {estimate:true}` publicly, reset data hourly. | **High.** Requires infra Helix's own design explicitly avoids being in the business of (README: "no cloud-only tier"; this would be a de facto hosted tier). Also requires BYOK creds paid by the project operator, undermining the BYOK-means-no-margin-on-inference story if it becomes anyone's default touchpoint. | **Honest but philosophically off-brand.** Doable, but risks becoming exactly the "try our cloud" motion the whole positioning is defined against. If built, must be clearly framed as a demo sandbox, not "the product," and should favor the estimate-only `/crawl` path (item 3 in the ledger) since it needs no real target-site fetch and cannot rack up the operator's own provider bill unpredictably. |
| **5. Local one-click via a hosted "try in browser" container (e.g. StackBlitz/CodeSandbox-style)** | Spin up docker-compose in an ephemeral cloud container triggered from the landing page, give the visitor a live terminal + curl. | **High**, and dependent on third-party infra (browser-based container runtimes struggle with multi-service docker-compose + Playwright/Chromium footprint). | **Honest in principle**, but likely infeasible given the three-runtime, browser-pool footprint (HELIX_BROWSER_POOL_SIZE etc.) — not recommended for v0.1 marketing scope. |

**Recommendation for launch:** ship options 1 and 3 together — the real curl quickstart plus a clearly-labeled illustrative ladder animation built from DESIGN.md's actual frame sequences and tokens. Both are buildable today with zero dependency on unfinished milestones or unverified stealth claims. Revisit option 2 once `tools/capture` produces real profiles and a live target has actually been tested (neither is true today).

---

## 5. Visual assets on hand

All values below are reproduced verbatim from DESIGN.md — this is the landing page's signature material.

### Palette (exact hexes)

Sourced from the mark (`apps/dashboard/public/logo.svg`, three isometric plates):

| Token | Hex | Role |
|---|---|---|
| Plate 1 | `#8B5CF6` | violet 500 — the accent |
| Plate 2 | `#5B21B6` | violet 800 — the deep tone |
| Plate 3 / wordmark | `#0B1220` | near-black, blue-cast — the ground |

Full dark-mode token set:

```css
--color-bg:            #0b1220;
--color-bg-raised:     #121a2b;
--color-bg-overlay:    #182136;
--color-border:        #232d44;
--color-border-strong: #33405c;
--color-fg:            #f2f4f8;
--color-fg-muted:      #98a2b8;
--color-fg-faint:      #5f6b85;
--color-accent:        #8b5cf6;
--color-accent-text:   #9d7bf7;
--color-accent-hover:  #9d75f8;
--color-accent-deep:   #5b21b6;
--color-accent-muted:  #2c1d52;
--color-accent-fg:     #ffffff;
--color-success:        #4ade80;
--color-danger:         #f87171;
--color-warning:        #fbbf24;
--color-tier-plain:      #ddd6fe;
--color-tier-tls:        #c4b5fd;
--color-tier-lightpanda: #a78bfa;
--color-tier-chromium:   #9061f9;
```

Light-mode equivalents and full contrast table are in DESIGN.md §5 — all figures are *computed*, not estimated (e.g. `fg` 17.0:1 AAA dark / 18.7:1 AAA light).

Typography: `--font-mono: "Berkeley Mono", "JetBrains Mono", "IBM Plex Mono", ...` (load-bearing — box-drawing glyphs must render full-width or every diagram misaligns); `--font-sans: "Inter", ...` for prose only.

### Character set

| Class | Characters | Used for |
|---|---|---|
| Box-drawing, light | `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` | ladder rails, tree branches, frames |
| Box-drawing, heavy | `━ ┃ ┏ ┓ ┗ ┛ ┣` | the active tier only |
| Block elements | `░ ▒ ▓ █` | progress fill, ratio bars |
| Geometric | `● ○ ◆ ◇ ▸ ▹` | node markers |
| ASCII | `> . x [ ] = ~` | arrows, log lines |

Explicitly excluded: braille spinners (`⠋⠙⠹⠸`) — "reads as an imported library rather than a mechanic worth watching."

### Frame sequence A — Fetch-ladder escalation (the signature animation)

```
Frame 0 (t=0ms)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ▸ trying...  │  ·            │  ·            │  ·            │
└──────────────┴───────────────┴───────────────┴───────────────┘

Frame 1 (t=80ms)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ● 403 5ms    │  ▸ trying...  │  ·            │  ·            │
└──────────────┴───────────────┴───────────────┴───────────────┘
  blocked (cloudflare-mitigated) → escalating

Frame 2 (t=180ms)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ● 403 5ms    │  ● 403 51ms   │  ▸ trying...  │  ·            │
└──────────────┴───────────────┴───────────────┴───────────────┘
  blocked (challenge-platform) → escalating

Frame 3 (t=260ms)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ● 403 5ms    │  ● 403 51ms   │  ○ 200 24ms   │  —            │
└──────────────┴───────────────┴───────────────┴───────────────┘
  content present → done, chromium skipped

Frame 4 (settled — no motion)
┌─ plain ──────┬─ tls ─────────┬─ lightpanda ──┬─ chromium ────┐
│ ● 403  5ms   │  ● 403  51ms  │  ● 200  24ms  │  ○ skipped    │
└──────────────┴───────────────┴───────────────┴───────────────┘
  resolved at lightpanda · 80ms total · 2 escalations
```

Legend: `●` attempted · `○` skipped · `▸` in flight · `·` not yet reached. Colour is additive only — every state is legible in monochrome.

**Marketing caveat:** these specific latencies (5ms/51ms/24ms) and the `cloudflare-mitigated`/`challenge-platform` labels are illustrative values from the design spec, not a captured real run — see Demo Surface item 2 above. Fine to use as an explainer; must not be presented as a real recorded result until a genuine run exists.

### Frame sequence B — Crawl frontier expanding

```
Frame 0
● example.com/

Frame 1
● example.com/
├─▸ /pricing
├─▸ /docs
├─▸ /blog
└─▸ /about

Frame 2
● example.com/
├─● /pricing
├─▸ /docs
│  ├─▸ /docs/quickstart
│  └─▸ /docs/api
├─● /blog
│  └─▸ /blog/launch
└─○ /about        (queued, host at concurrency limit)

Frame 3 (settled)
● example.com/                     6/6
├─● /pricing                       ●
├─● /docs                          ●
│  ├─● /docs/quickstart            ●
│  └─● /docs/api                   ●
├─● /blog                          ●
│  └─● /blog/launch                ●
└─● /about                         ●
```

The `○` throttled state is shown honestly — when adaptive politeness holds a host back, the UI says so rather than implying uniform progress.

### Frame sequence C — Extraction

```
Frame 0
raw html  [██████████████████████████] 14.2kb
markdown  [                          ]

Frame 1
raw html  [██████████████████████████] 14.2kb
markdown  [████████████░░░░░░░░░░░░░░] extracting…

Frame 2
raw html  [██████████████████████████] 14.2kb
markdown  [██████████████████████████] 2.1kb  (trafilatura)
```

A real ratio, not fake progress — "if extraction beats one animation tick, skip to frame 2."

### Frame sequence D — Idle/connecting

```
◇  connecting to localhost:7400
◆  connecting to localhost:7400
```

Cycles at 2 Hz. Stops immediately on a known failure — "it never spins past an error, which is the dishonest-progress-bar problem this product exists to avoid elsewhere." The only place a cycling glyph is permitted at all.

### Motion rules (for any landing-page reuse)

8 fps (125ms/frame) for ladder/frontier sequences, 2 Hz for the idle glyph — deliberately slow so each frame reads as a discrete state, not smooth motion. 60ms stagger between sibling rows. One dimension changes per frame (a glyph or a number, never both plus a colour shift). Full `prefers-reduced-motion` handling specified in DESIGN.md §6 (settled frame renders immediately; sequence D becomes static text with an "(in progress)" suffix).

---

## 6. Claims we cannot make

| Cannot claim | Why | Honest substitute |
|---|---|---|
| **Benchmarks** (speed, accuracy, cost-per-page vs. Firecrawl/Scrapfly/etc.) | No Helix instance has run against a live target. The `02-firecrawl-weaknesses.md` cost figures ($6.84/1k vs $3.97 vs $2.49) are about *competitors*, not a measured Helix number — there is nothing to benchmark yet. | Cite the *mechanism* difference (BYOK removes the margin layer) without a number, or show the `Estimate` response shape as "you see the projected cost before you pay it" — a capability claim, not a benchmark. |
| **User logos** | No users exist; pre-implementation. | None. Do not fabricate a "trusted by" row. |
| **Testimonials** | No users exist. Global rule (`ui-anti-vibe.md`) explicitly bans fake testimonials regardless. | Use direct quotes from the *design docs themselves* ("a block page is a failure") as principle statements, clearly attributed to Helix's own design, never framed as a user quote. |
| **Star count / GitHub stars** | Repo is pre-implementation; no public repo activity to cite. | Omit entirely until there's a real count. A "0 stars" or missing badge reads worse than no badge. |
| **Uptime** | No hosted instance exists to have uptime — the entire model is self-hosted, so "uptime" isn't even Helix's metric to claim (it's the operator's). | Reframe as a design property: "health-gated startup, no boot race" (M0, real) — a startup-reliability claim, not an uptime SLA. |
| **Customer/deployment numbers** ("used by N teams", "N pages processed") | No deployments exist. | Omit. If a number is needed for a stat-shaped layout, use a spec fact instead — e.g. "6 endpoint families," "3 runtimes," "1242-line OpenAPI spec" — real, checkable counts about the product itself, not adoption. |
| **"Beats Cloudflare" / stealth-success claims** | MILESTONES.md and ARCHITECTURE.md §13 both state stealth is validated only against local suites (CreepJS/Sannysoft/browserleaks) and explicitly "cannot confirm the ladder works" against a real target. The sample profile is a placeholder. | Claim the *behavior on failure* instead: "a block is always reported as a block, never silently served as content" — true regardless of the stealth arms race's outcome. |
| **"Faster than Firecrawl"** | No comparative timing exists; the tier latencies in DESIGN.md are illustrative design values, not measurements. | Claim the *architecture property*: "escalates only on evidence — cheapest tier first" — a design description, not a speed claim. |
| **Live MCP / SDK support** | Both unimplemented (M9 ☐ entirely). README currently lists the MCP server as a present-tense feature ("Plus an MCP server, so agents can call it directly") — this is itself ahead of MILESTONES.md and should not be repeated on a landing page without a "coming" qualifier. | Mark as roadmap/planned, or omit from the initial launch page entirely. |

---

## Summary of biggest landing-page risk

The single highest-risk gap between README/openapi.yaml framing and MILESTONES.md reality is the **MCP server line in the README's feature table**, presented as present-tense ("Plus an MCP server...") while M9 is entirely unchecked. Any landing page copy lifted directly from the README's "What it does" table needs an implementation-status pass before publication — most of the six endpoints in that table are real (`/scrape`, `/map`, `/crawl`, `/search` with caveat), but `/enrich` and `/monitors` are OpenAPI-documented specs with zero implementation, and should be marked "coming in v0.1" rather than presented alongside the working four.
