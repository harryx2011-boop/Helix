# Helix — next-session prompts (suite roadmap, 2026-10-10)

The five suite goals, in the order Harry set on 2026-10-10. Each is a **big plan**: a new feature
or multi-step build, not a quick fix. Open a fresh Claude Code session in `D:\Helix` and paste the
goal you are picking up. Do them in order unless Harry says otherwise.

Shared rules for every goal:

- Read `context.md` (top entries), `SUITE-PLAN.md`, the Helix entry in `~/.claude/BACKLOG.md`, and
  memory `project_open_threads.md` first.
- Run `node ~/.claude/hooks/helix-ensure.js`; confirm `helix_health` and `helix_search` answer.
- Read every stray diff before touching the tree (other sessions share this checkout; the
  `graphify-out/`/`synapse-out/` churn is not yours; two stashes are Harry's to drop).
- A failing test first for every code change. Claim a speedup only from `bench-scrape.mjs` output.
- Stage by name. No Claude co-author trailer. Push `main` per batch.
- Update `context.md`, `SUITE-PLAN.md` and the BACKLOG entry as items land.
- A new tool follows the seven-step checklist (openapi path, SDK `NOT_IN_SDK` row,
  `tool-surface.json`, `HELIX_MCP_TOOLS` in `helix-ensure.js`, `CORE_TOOLS` in `mcp-schema-size.mjs`,
  the character cap in `slim.test.ts`, tests).

Verified against the code 2026-10-10: `mapWithLimit` lives in `routes/search.ts` and is used by
`routes/enrich.ts` but NOT by `routes/extract.ts`; `crawl/worker.ts` stores `etag` but sends no
`If-None-Match`; `summarizeDiff`, `routes/mine.ts`, `routes/image-sheet.ts`, `apps/vscode` and any
Composio code in `apps/api` are absent.

---

## Goal 1 — `helix_image_sheet` (SUITE-PLAN Phase 3) — START HERE

Recommended first: its SearXNG image input already works on the dev stack (`SearchHit.imageUrl`).

```
Build helix_image_sheet in D:\Helix (SUITE-PLAN Phase 3). Read the shared rules in
docs/next-session.md first, then SUITE-PLAN.md Phase 3.

The tool: query in -> search images over several pages (SearxngProvider, categories=images) ->
dedupe by perceptual hash -> filter by minimum size and aspect -> return a contact sheet (one PNG
grid) plus a JSON list of {imageUrl, sourcePage, size}. Optional "motion reference" mode adds terms
like "storyboard", "frame", "keyframe". Output is an MCP image block (the 2.2.0 token diet already
supports image blocks).

Seam: routes/image-sheet.ts plus the seven-step tool checklist. Write failing tests first.
Verify live against the local stack (helix_search returns image results with imageUrl).
```

## Goal 2 — finish anti-bot Phase 1 (SUITE-PLAN Phase 1) + two design calls

Partial today: baseline->final p50 800->417 ms, p95 5517->2623 ms, useful success 69.8%->75.9%.
Open items below.

```
Finish Helix anti-bot Phase 1 in D:\Helix. Read the shared rules in docs/next-session.md, then
SUITE-PLAN.md Phase 1 and context.md "2.3.0 — anti-bot pass 2".

Build, each behind a failing test, each speedup proven by apps/api/scripts/bench-scrape.mjs:
- Item 6: parallel /extract URL loop with mapWithLimit (routes/extract.ts, ~line 166 is still a
  serial for-loop; mapWithLimit already exists in routes/search.ts). Per-host limits for /scrape and
  /extract through the existing PolitenessController.
- Item 4: keep one CDP connection for lightpanda, camoufox and remote CDP (pool.ts:670,758,837).
- Item 5: send If-None-Match on crawl re-fetches where an etag is stored (crawl/worker.ts stores
  result.etag near line 613 but never sends it).
- Camoufox as an automatic last tier when it is installed.
- New captured profiles beyond the two in packages/profiles/definitions/ (no fabricated JA4; see the
  dead-ends memory).
- A block signal for reddit's "Prove your humanity" page so it stops counting as an empty success.

Two design calls Harry approved 2026-10-10, fold both in:
- Ship full Chromium: channel: 'chromium' (~450 MB), reversing DESKTOP-PLAN D14 (recorded there as
  D17). extraResources bundles the full Chromium; the browser tier launches it. Re-run the walled-site
  bench (airbnb, g2, zillow, indeed) at channel: 'chromium' to measure the gain.
- SearXNG in the desktop app: add a SEARXNG_URL settings field (user points at their own instance; no
  bundled Docker). The dev stack sets SEARXNG_URL; the desktop app does not.

Still-failing walls (airbnb, g2, zillow, indeed) are the target for the full-Chromium change.
```

## Goal 3 — VSIX (Phase 6), then Web Monitoring change summaries (Phase 5)

```
Build the Helix VS Code extension (SUITE-PLAN Phase 6), then the monitor change summaries (Phase 5),
in D:\Helix. Read the shared rules in docs/next-session.md, then SUITE-PLAN.md Phases 5 and 6.

Phase 6 (apps/vscode, own version line like packages/sdk-ts):
- A webview hosts an iframe of http://127.0.0.1:<port>/app from the running API (desktop 7410 or dev
  7400). Verify the live X-Frame-Options / frame-ancestors header first (@fastify/helmet registers
  with only CSP off at index.ts:299); allow frame-ancestors vscode-webview:.
- Key handoff: an origin-checked postMessage handshake in dashboard/lib/desktop.ts (the iframe cannot
  see a window.helixDesktop the webview sets).
- All six /app routes plus Web Monitoring, and a status-bar item for API health.
- One row in ~/.claude/scripts/desktop-apps.mjs APPS so the installed vsix stays current.

Phase 5 (monitor summaries, surfaced in the VSIX monitoring view):
- Add a deterministic summarizeDiff(diff): string in monitor/diff.ts (changed sections, first changed
  lines, JSON field names). Attach it at checker.ts (~line 157). Add summary to MonitorDiff and
  MonitorJsonDiff (openapi.yaml ~4268). An optional model summary runs only when a change fires.
```

## Goal 4 — `helix_data_miner` (Phase 4) + Composio sources

```
Build helix_data_miner (SUITE-PLAN Phase 4) in D:\Helix. Read the shared rules in
docs/next-session.md, then SUITE-PLAN.md Phase 4.

Input: a topic and a column list or prompt. Steps: agent/schema for columns -> search for candidates
(enrich findCandidates, dedupeByUrl, screenSource) -> scrape with mapWithLimit -> extract with
includeSources -> keep only grounded fields (verifyGrounding; never soften the grounding check) ->
dedupe rows by key -> return a table with a citation per cell. Run it as an async job for scale.
Seam: routes/mine.ts plus the seven-step tool checklist. Failing tests first.

Composio sources (add-on): the mcp__composio__* tools load in sessions now (the old authorize-via-/mcp
blocker is cleared). Add X/Twitter as one optional candidate source and AI-model-release-date lookups.
Check the X/Twitter connection with mcp__composio__COMPOSIO_MANAGE_CONNECTIONS before building against it.
```
