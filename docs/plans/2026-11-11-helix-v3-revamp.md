Status: PLANNED

# Helix: Scrapling made live, speed, benchmark, agent surfaces, Amber, UI revamp

Goal: make the Scrapling service the one that actually runs, bring warm scrapes down to tens of milliseconds on the HTTP path and about one second on the browser path, prove it with a dated benchmark, and then add agent surfaces, the Amber source layer and a UI revamp of all four surfaces.

Build order note (Harry, 2026-11-11): the Aether lean-tools work (`D:\Aether\docs\plans\2026-11-11-lean-tools.md`) is built first. This plan starts after it.

Evidence, all dated 2026-11-11, in `docs/audits/`: `2026-11-11-scrapling-wiring-and-gaps.md`, `2026-11-11-scrapling-live-timing.md`, `2026-11-11-firecrawl-site-ui.md`, `2026-11-11-firecrawl-docs-and-features.md`. Screenshots and raw data: `D:\scratch\helix-revamp\`.

## What the audit found

- The live stack does not run Scrapling. `C:\Users\harry\.claude\hooks\helix-ensure.js:145-149` starts the old Rust `helix-fetch.exe` (1.7.0) on 7401; nothing starts `helix-scrape` on 7403. The API calls `/render` on the Rust service and gets 404, so every browser scrape fails as `service_unavailable: helix-scrape returned HTTP 404`.
- Scrapling is used in one place: `AsyncStealthySession` in `apps/scrape/helix_scrape/render.py`. Its parser, adaptive selectors, request capture, spiders, proxy rotation and tab pool are unused. Newest upstream is 0.5.1; Helix pins 0.5.
- Measured on 12 URLs, 4 runs each, serial:

| Path | Success | Warm p50 ms | Warm p95 ms |
|---|---|---|---|
| helix-scrape `/fetch` plain | 58% | 154 | 329 |
| helix-scrape `/fetch` tls | 83% | 144 | 336 |
| Rust `/fetch` tls | 83% | 55 | 99 |
| helix-scrape `/render` | 75% | 3191 | 9054 |
| helix-scrape `/render` stealth | 75% | 4938 | 11840 |

- helix-scrape opens a new connection for every call (20 calls to one host: 75 ms each; Rust: 19 ms). A new browser starts on every render (about 1.5 s on an idle machine).
- The browser's cookies (`cf_clearance` included) are returned and then dropped; no `host_sessions` code exists.
- A hung render keeps its slot past the caller's deadline; two hung renders lock `/render` until a restart.
- g2.com and the Cloudflare demo blocked every path; the solver timed out at 60 s.

## Decisions (Harry, 2026-11-11)

| Question | Answer |
|---|---|
| Output | Plan and build all. |
| UI surfaces | Marketing site, dashboard, playground, docs. |
| Likeness to Firecrawl | Patterns, own identity. No Firecrawl colours, marks, art or copy. |
| Pages studied | Home and nav, docs and llms.txt, pricing and playground, Alexandria and blog. |
| Features | Data-source indexes named **Amber**, agent surfaces, a public benchmark. |
| Optimize | All of it; "scrapes should be in ms". |
| Scrapling audit | Full audit (done, see above). |

Default, not confirmed: the claims guard (`WEBSITE.md` 655-662) lifts only for numbers produced by the benchmark script with a dated result file in the repo. The 2026-10-12 "do not rewrite or strip this UI" note is lifted by this request for restyling; removing a protected piece still needs Harry's say-so.

## Out of scope

Paid data-provider deals. Hosted MCP with OAuth. A desktop installer. Slack and email sinks for monitors. PII redaction.

## Phases (each step one commit, test first)

### Phase 0: make Scrapling live

1. `helix-ensure.js` starts `apps\scrape\.venv\Scripts\pythonw.exe -m helix_scrape` on 7403 and stops starting the Rust exe; the API is started with `HELIX_FETCH_URL=http://127.0.0.1:7403` in its environment. Verify: `helix_scrape` of `https://quotes.toscrape.com/js/` returns quotes; `/v1/health` names helix-scrape.
2. An upstream 404 is reported as `not_found` with the upstream status, not `service_unavailable`. Verify: unit test in `core/block-detection.test.ts`, live scrape of a missing URL.
3. A render that passes its deadline frees its slot. Verify: pytest with a page that never loads; a third render succeeds.
4. Pin scrapling 0.5.1; the venv is Python 3.13 while the ADR says 3.12, so record the real version. Verify: `python -m pytest` in `apps/scrape`.

### Phase 1: speed

Targets: `/fetch` tls warm p50 at or under 60 ms; `/render` warm p50 at or under 1,000 ms; a repeat scrape inside `maxAge` under 10 ms.

5. One curl_cffi session per host and profile, kept alive, cookie jar off. Verify: the 20-call test drops from 75 ms to about 20 ms.
6. Short-TTL cache in `lookup_public` (public answers only, never a private one). Verify: guard tests still pass; one lookup per host per TTL.
7. Warm browser: one long-lived patched Chromium, a new context and guard proxy per render. Verify: five back-to-back renders, median under 1 s; the redirect-to-loopback tests still refuse.
8. `TierMemory` remembers hosts whose HTTP body had no content, so repeat visits start at the browser. Verify: unit test; second scrape of a script-built page skips tls.
9. The extract route runs off the event loop, and extraction is skipped for a page that will escalate. Verify: two concurrent scrapes do not serialize.
10. The browser is not tried when tls already returned a full page (npm: tls 200, render 403). Verify: ladder test.

### Phase 2: reliability

11. Host sessions (migration 016): store and replay cookies and the winning tier per host, proxy and profile. Verify: a second scrape of a Cloudflare-fronted host reuses `cf_clearance`.
12. Solver budget and a clear `challenge` failure with the time spent. Verify: nopecha demo fails in the stated budget with that reason.

### Phase 3: benchmark

13. `apps/api/scripts/bench.mjs`: a fixed public URL list, coverage defined as "at least 50% of the reference text returned" (stricter than Firecrawl's stated 10%), p50 and p95, a dated JSON in `research/benchmarks/`. Verify: one run on this PC.
14. The site's Performance section reads that JSON and shows the date, the machine and the method. "Illustrative example" labels go away only where a measured number replaces them. Verify: `check:claims` script fails on a number with no source.

### Phase 4: agent surfaces

15. `helix init` (writes MCP config for Claude Code, Codex and Cursor) and `helix doctor` (checks ports, key, browser). Verify: CLI tests.
16. A skills pack served at `/agent-onboarding/`. Verify: links resolve.
17. Docs: agent-setup cards with client tabs and a copy button.

### Phase 5: Amber

18. ADR `docs/adr/0002-amber.md` (proposal for Harry): a source registry with three calls, `amber_sources` (find a source), `amber_describe` (what it holds, its terms) and `amber_query` (retrieve). Each source is one module plus one registry line.
19. First sources after their terms are verified: Wikipedia REST, arXiv with OpenAlex, the GitHub public API, Federal Register with eCFR. The access terms in the audit are unverified and must be read first.
20. MCP tools, OpenAPI paths, SDK and docs pages for the three calls.

### Phase 6: UI revamp

21. Merge `ui/harry-templates` and `ui/promptbox-revamp` (both touch `TOKENS.md`, `composer.tsx`, `refine-bar.tsx`). Verify: dashboard vitest, typecheck.
22. Housekeeping: remove the dead `/canvas` footer link; fix or remove the unrendered `lib/docs.ts` pages in the sitemap; mark `DESIGN.md` and `FRONTEND.md` superseded.
23. Design directions (three, shown before any build) for the marketing site and the docs. Harry picks.
24. Docs layout: a 288 px grouped sidebar, a 632 px reading column, an "on this page" rail, built from the catalog groups.
25. Marketing restyle on the existing frame parts: mega-menu polish, bold-lead sentences, eyebrow labels, chip links, the benchmark rows with real data.
26. Dashboard: Jobs and Monitors screens (monitors are only a playground tab today).
27. Playground polish, then the required review skills before any landing commit (interface-review, review-animations, tastemaker scan, ui-anti-vibe).

## Risks and rollback

- Phase 0 moves the fast path from 55 ms (Rust) to 144 ms until step 5 lands. Steps 1 and 5 ship together if step 1 alone makes everyday scrapes feel slower.
- A warm browser shares one process across renders. Each render keeps its own context and guard proxy; the loopback-redirect tests are the gate.
- Cookie replay can leak a session across callers. Replay stays keyed by host, proxy, tier and profile, as the cookie jar is today.
- Published numbers are one machine, one sitting. The page says so.
- Rollback for Phase 0: `helix-ensure.js` is one file; the Rust exe is still on disk.
