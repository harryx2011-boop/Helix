# Suite plan: audits and five features (2026-10-05)

Status: **plan only.** Harry chose "audits only, plan features" on 2026-10-05. Nothing below is built.
Decisions taken that day: the VS Code extension lives in `apps/vscode`; image search runs on SearXNG in
WSL Docker; `helix_data_miner` is "topic to table" with Composio as one optional source.

## Audit 1: cross-MCP performance and tokens (vulcan, last 30 days)

Source: `mcp__vulcan__vulcan_mcp` window 30, probed 2026-10-06T01:19Z. 1,663 calls, 138 errors,
about 2.59M result tokens, 128 live MCP processes using about 1.77 GB.

| Server | Calls | Errors | p50 / p95 | Result tokens | Finding |
|---|---|---|---|---|---|
| helix | 1,106 | 85 | 6.3 s / 41.2 s | 1.79M | `helix_scrape` is 915 calls, 1.72M tokens (about 1.9k per call), p50 7.2 s, p95 45 s. `helix_search` failed 56 of 56: no backend. |
| aether | 330 | 39 | 0.4 s / 1.9 s | 584k | `read_file` 575k tokens; `write_file` failed 28 of 128 (22%). |
| qmd | 192 | 5 | 31.8 s / 128.8 s | 215k | `query` (hybrid plus rerank) dominates; 28 processes, 457 MB. |
| synapse | 8 | 0 | 0.3 s / 1.4 s | 2k | 32 processes, 492 MB for 8 calls: orphaned stdio children. |
| caveman, ponytail | 0 | 0 | — | 0 | 14 processes each, 285 MB together, zero calls. The rules arrive by SessionStart hook already. |
| vulcan, hindsight | 0 / 3 | 0 | — | small | 12 and 14 processes. |
| mobbin | 4 | 4 | — | — | Paid plan required; every call fails. |
| plugin probe-server | 6 | 5 | — | — | Test plugin leftover. |

Actions, ranked by payoff:

1. **Give Helix a search backend (Phase 2 below).** It ends a 100% failure rate on 56 calls and unblocks
   `helix_enrich`, image search and the data miner. Until then, `helix-first` should not bounce
   WebSearch through a `helix_search` call that is known to fail.
2. **Cut `helix_scrape` latency (Phase 1).** It carries 66% of all MCP result tokens and most of the wall time.
3. **qmd: use `lex` with `rerank: false` for file location.** Hybrid query with rerank is the 33 s median;
   BM25 answers a known term in about a second (`reference/search.md`).
4. **Remove the `caveman` and `ponytail` MCP servers, and `mobbin` if still registered.** Zero calls in 30 days;
   the session hooks already inject their rules. Saves 28 processes and about 285 MB. Shared infrastructure,
   so Harry decides.
5. **Reap orphaned stdio children** (synapse 32 and qmd 28 processes against 14 sessions).
6. **Helix MCP schema:** `helix_crawl` (2.5k tokens) and `helix_estimate_crawl` (2.1k) repeat the same
   option schema. Point estimate at crawl's schema or keep only its required fields. Both are deferred tools,
   so this is paid per use, not per session.

## Audit 2: session-start budget

Measured with a headless `/context` on this session (`claude -p "/context" --resume <id> --fork-session
--no-session-persistence`, no model call). Total 103k at measurement, of which about 51k was loaded before
the first prompt plus about 10k of hook text.

| Category | Tokens | Note |
|---|---|---|
| System prompt | 3.3k | Fixed. |
| System tools | 16.3k | Fixed. |
| Memory files | 15.8k | `PROJECTS.md` 4.7k, `CLAUDE.md` 2.9k, Helix `CLAUDE.md` 2.8k, `search.md` 1.4k, `USER.md` 1.3k, `finish.md` 0.9k. |
| Skills listing | 10k | About 60 project design skills from `.claude/skills/`; about 30 of them list under 20 tokens because they have no description, so they cost a line and can never trigger. Duplicates: `mcp-builder` and `skill-creator` also come from `anthropic-skills`. |
| MCP tools (loaded) | 2.7k | Claude Docs and hindsight load eagerly. |
| MCP instructions | 1.5k | qmd, synapse, Claude Docs. |
| Custom agents | 1.5k | |
| SessionStart hook text | about 9k | Superpowers `using-superpowers` about 1.9k, ponytail and caveman rules about 2k each, the context hint about 0.6k, the remaining hooks under 0.5k. |
| Deferred tools | 0 | 28.7k MCP and 19.9k system tool schemas load only on ToolSearch. |

Trims, ranked by tokens saved per session:

1. **`PROJECTS.md` (4.7k, every session in every repo).** Keep the repo table to path plus one line; move the
   notes and the cross-project gotchas to `reference/projects-detail.md`, which is already in qmd. About 3k saved.
2. **Project skill listing.** Give the description-less design skills a description or move them out of
   `.claude/skills/` (they stay reachable through `design-skills/search.py`). About 3–5k saved.
3. **Mode hooks.** Inject one line naming the mode and level; the full rules stay one tool call away
   (`caveman_rules`, `ponytail_rules`). About 3.5k saved. This conflicts with removing those MCP servers
   (audit 1, item 4): keep the servers if the hooks shrink, or keep the full hook text if the servers go.
4. **Helix `CLAUDE.md` (2.8k).** The typecheck timing paragraph and the converter and Vulcan history are
   history, not standing rules; they belong in `context.md`. About 0.8k saved.

Total achievable: roughly 10k of the 61k start budget (about 16%).

Status 2026-10-06 (Harry approved trims 1-3; MCP servers kept):

- Trim 1 done: `PROJECTS.md` 10481 to 2967 characters; the removed text is in `reference/projects-detail.md` (harness commit `33bdfda`).
- Trim 3 done: `hooks/caveman-activate.js` and `hooks/ponytail-activate.js` emit one line, for example `CAVEMAN MODE ACTIVE — level: lite. Full rules: mcp__caveman__caveman_rules`. The output fell from 5139 and 5231 characters to 76 and 79. The subagent hooks still inject the full rules, because most custom agents cannot call MCP tools.
- Trim 2 premise was wrong: all 53 `SKILL.md` files under `.claude/skills/` have a valid `description:`. The bare names come from Claude Code's listing budget. That budget is context window × 4 × `skillListingBudgetFraction` (default 0.01) characters, or `SLASH_COMMAND_TOOL_CHAR_BUDGET`. Skills over the budget list by name only, so writing descriptions saves nothing. The real saving is moving rarely used design skills out of `.claude/skills/`. The duplicates `mcp-builder` and `skill-creator` come from `~/.claude/skills/` and the `anthropic-skills` plugin, not from this repo.

## Feature phases

Order: the ladder fixes and a backend first, because three features depend on search and every feature
depends on scrape speed. Each phase ends with its tests green and a live check against the local stack.

### Phase 1: scraping efficiency and anti-bot

Baseline first: a throughput script over a fixed URL set (static pages, SPAs, bot-walled pages) that records
p50/p95 latency, tier reached, bytes and success rate, built on `apps/api/scripts/smoke-live.mjs` and the
`/jobs/{id}/ladder` data. "Multiple times faster" is judged against that baseline only.

1. Fix the two ladder findings (`FOLLOWUPS-PLAN.md:78-80`):
   - example.com climbs to chromium: stop when two tiers return the same `contentHash`, or skip the 200-char
     floor (`escalation.ts:93`) when the HTML has no empty app root (`pipeline.ts:344`).
   - Disabled lightpanda: add `unavailable` tiers to `Capabilities`, filled from the pool's enabled engines,
     checked in `tierSupports` (`escalation.ts:64`).
2. Reuse the Rust `wreq::Client` per (profile, proxy, allow_private) instead of one per request
   (`apps/fetch/src/main.rs:170`). Identity stays fixed per key.
3. Block images, fonts and media in browser tiers unless a screenshot or PDF is requested (`pool.ts:199`).
4. Keep one CDP connection for lightpanda, camoufox and remote CDP (`pool.ts:670,758,837`).
5. Scrape result cache with `maxAge` (`routes/scrape.ts:404` hardcodes `fromCache: false`); send
   `If-None-Match` on crawl re-fetches where an `etag` is stored (`crawl/worker.ts:609`).
6. Parallel `/extract` URL loop with `mapWithLimit` (`routes/extract.ts:166`); per-host limits for
   `/scrape` and `/extract` through the existing `PolitenessController`.
7. Anti-bot: real captured profiles beyond the two in `packages/profiles/definitions/` (no fabricated JA4;
   see the dead-ends memory), and camoufox as an automatic last tier when it is installed.

**Status 2026-10-06: items 1, 2, 3 and 5 done; items 4 and 6 open; item 7 partly done.** Evidence: `context.md` "Anti-bot pass 2". The benchmark baseline-to-Phase-5 numbers moved:

- useful success: 69.8% to 75.9%
- p50: 800 ms to 538 ms
- p95: 5517 ms to 2407 ms
- sum of medians: 217.7 s to 25.2 s, mostly the end of a 180 s reddit hang; 37.7 s to 25.2 s without it

What remains:

- Item 4 (one CDP connection for lightpanda, camoufox and remote CDP) is not built.
- Item 6 (parallel `/extract`, per-host limits) is not built.
- Item 5's `If-None-Match` on crawl re-fetches is not built; the scrape `maxAge` cache is.
- Item 7: the browser tier is hardened (UA and client hints, webdriver, `window.chrome`, plugins, native `toString`, stable canvas). Camoufox as an automatic last tier and new captured profiles are not done.

### Phase 2: search backend

**Status 2026-10-06: done for the dev stack.** The container `helix-searxng` runs on 127.0.0.1:7440 in WSL Docker. `helix-ensure.js` starts it and sets `SEARXNG_URL` (harness commit `6af2ed4`). `helix_search` over MCP returned 3 web and 3 image results for "red panda", with `imageUrl` set. The desktop app's settings do not carry `SEARXNG_URL` yet.

SearXNG in WSL Ubuntu Docker (`wsl.exe -d Ubuntu docker`), JSON output enabled, `SEARXNG_URL` in
`apps/api/.env` and in the desktop app's settings. `SearxngProvider` already exists
(`search/providers.ts:312`) with `categories=images`. Add a start step to `helix-ensure.js`.

### Phase 3: `helix_image_sheet`

Image search already exists (`SearchSource` `images`, `SearchHit.imageUrl`). The tool:
query in, then search images (several pages), dedupe by perceptual hash, filter by minimum size and aspect,
and return a contact sheet (one PNG grid plus a JSON list of image URL, source page, size). Optional
"motion reference" mode adds terms such as "storyboard", "frame", "keyframe". Output is an MCP `image`
block, which the 2.2.0 token diet already supports. Seam: `routes/image-sheet.ts` plus the
seven-step tool checklist (openapi path, sdk `NOT_IN_SDK` row, `tool-surface.json`, `HELIX_MCP_TOOLS` in
`helix-ensure.js`, `CORE_TOOLS` in `mcp-schema-size.mjs`, the 37,000-character cap in `slim.test.ts`, tests).

### Phase 4: `helix_data_miner` (topic to table)

Input: topic and a column list or prompt. Steps: `agent/schema` for columns, search for candidates
(`enrich` `findCandidates`, `dedupeByUrl`, `screenSource`), scrape with `mapWithLimit`, extract with
`includeSources`, keep only grounded fields (`verifyGrounding`; the grounding check is never softened),
dedupe rows by key, return a table with a citation per cell. Runs as an async job for scale.
Composio adds X/Twitter as a source once Harry authorizes the `composio` MCP server, which this session could not do.
Seam: `routes/mine.ts`.

### Phase 5: Web Monitoring that says what changed

Checks already store a structured diff (`monitor/checker.ts:74-88`, `diff.ts:24-41`) but no prose summary.
Add a deterministic `summarizeDiff(diff): string` in `monitor/diff.ts` (changed sections, first changed lines,
JSON field names), attach it at `checker.ts:157`, add `summary` to `MonitorDiff` and `MonitorJsonDiff`
(`openapi.yaml:4268`). An optional model summary runs only when a change fires.

### Phase 6: VS Code extension (`apps/vscode`)

Own version line, like `packages/sdk-ts`. A webview hosts an iframe of `http://127.0.0.1:<port>/app` from
the running API (desktop 7410 or dev 7400). Needed:

- `@fastify/helmet` registers with only CSP off (`apps/api/src/index.ts:299`), so it likely sends
  `X-Frame-Options: SAMEORIGIN`; verify the live header, then allow `frame-ancestors vscode-webview:`.
- Key handoff: an origin-checked `postMessage` handshake added to `apps/dashboard/lib/desktop.ts`, since the
  iframe cannot see a `window.helixDesktop` the webview sets.
- All six `/app` routes plus Web Monitoring with the Phase 5 summary, and a status-bar item for API health.
- One row in `~/.claude/scripts/desktop-apps.mjs` `APPS` so the installed vsix stays current.
